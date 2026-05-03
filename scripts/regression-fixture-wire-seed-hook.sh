#!/usr/bin/env bash
# Wire seedScenario() into the pre-fix tree's useAppInit.ts so the
# regression-fixture-capture workflow's playwright run can flip
# <body data-test-ready="true"> and produce bld-480-pre-fix.png.
#
# Why this script exists:
#   The pre-fix SHA `cce2ac1f828538bf884f91c5e209ab9f6a40d87f` predates the
#   visual-UX-audit scenario harness (`feat(bld-494)` 40ab6980). Its
#   `hooks/useAppInit.ts` does not import `lib/db/test-seed`, so even when
#   the spec sets `window.__TEST_SCENARIO__` via addInitScript, no seed runs
#   and the gate `body[data-test-ready='true']` never appears (15s timeout).
#
#   We therefore patch the pre-fix `useAppInit.ts` *during fixture capture
#   only* (in a fresh checkout under `prefix-tree/`) by appending a
#   dynamic-import + seedScenario() call after a stable anchor line. The
#   patch is surgical: it does NOT modify any rendering code path, so the
#   captured PNG still reproduces the BLD-480 MusclesWorkedCard cropping bug.
#
# Usage:
#   scripts/regression-fixture-wire-seed-hook.sh path/to/prefix-tree/hooks/useAppInit.ts
#
# Idempotent: re-running on a patched file is a no-op.
#
# Refs: BLD-1021, BLD-1022, BLD-959, BLD-480.

set -euo pipefail

TARGET="${1:?path to useAppInit.ts required}"

if [ ! -f "$TARGET" ]; then
  echo "::error::Expected $TARGET; aborting." >&2
  exit 1
fi

if grep -q "seedScenario" "$TARGET"; then
  echo "$TARGET already wired (idempotent re-run)."
  exit 0
fi

ANCHOR='if (Platform.OS === "web" && isMemoryFallback()) setBanner(true);'

if ! grep -qF "$ANCHOR" "$TARGET"; then
  echo "::error::Anchor line not found in $TARGET; pre-fix tree shape changed?" >&2
  echo "Expected anchor: $ANCHOR" >&2
  exit 1
fi

# Build the injection in a tmpfile to avoid quoting/escaping hazards.
INJECT="$(mktemp)"
trap 'rm -f "$INJECT" "$TARGET.new"' EXIT

cat >"$INJECT" <<'INJECTION'
        // [BLD-959 fixture-capture only] invoke scenario seed hook so
        // <body data-test-ready="true"> flips for playwright. This block
        // is appended by scripts/regression-fixture-wire-seed-hook.sh on
        // a throwaway pre-fix checkout — it never lands in main.
        if (Platform.OS === "web" && typeof window !== "undefined" && (window as any).__TEST_SCENARIO__) {
          // eslint-disable-next-line no-console
          console.log("[fixture-capture] seedScenario starting:", (window as any).__TEST_SCENARIO__);
          try {
            const mod = await import("../lib/db/test-seed");
            await mod.seedScenario();
            // eslint-disable-next-line no-console
            console.log("[fixture-capture] seedScenario completed");
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error("[fixture-capture] seedScenario failed:", e);
            // Surface failure as a body attribute so the playwright trace
            // shows which path went wrong (vs. silent timeout on the gate).
            if (typeof document !== "undefined" && document.body) {
              document.body.dataset.fixtureCaptureError =
                e instanceof Error ? e.message : String(e);
            }
          }
        } else if (Platform.OS === "web" && typeof window !== "undefined") {
          // eslint-disable-next-line no-console
          console.log(
            "[fixture-capture] no __TEST_SCENARIO__ on window — guard skipped.",
          );
        }
INJECTION

# Splice INJECT immediately after the first $ANCHOR occurrence using awk.
awk -v anchor="$ANCHOR" -v injectfile="$INJECT" '
  BEGIN {
    while ((getline line < injectfile) > 0) {
      inject = inject line "\n"
    }
    close(injectfile)
  }
  { print }
  !done && index($0, anchor) {
    printf "%s", inject
    done = 1
  }
  END {
    if (!done) {
      print "::error::awk did not splice — anchor missed at runtime?" > "/dev/stderr"
      exit 2
    }
  }
' "$TARGET" >"$TARGET.new"

mv "$TARGET.new" "$TARGET"

echo "--- patched $TARGET (relevant excerpt) ---"
grep -n "seedScenario\|isMemoryFallback" "$TARGET" || true
