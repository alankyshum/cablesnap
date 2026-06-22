#!/usr/bin/env bash
# install-playwright-browsers.sh — install Playwright browser binaries
# without relying on `npx playwright install`.
#
# # Why this script exists (BLD-1631)
#
# The daily UX-audit loop (`scripts/daily-audit.sh`) was repeatedly waking
# up to a half-populated `/paperclip/.cache/ms-playwright/` cache (only
# `libvk_swiftshader.so` in `chrome-linux/`, no `headless_shell` binary).
# That cache lives on the workspace's ephemeral overlayfs, so any prior
# partial install leaves the dir in a "looks installed, doesn't run" state
# that `npx playwright install` does not always recover from cleanly — it
# can short-circuit on the presence of the directory.
#
# Separately, agents that ran `npx playwright install` against the older
# `playwright.azureedge.net` host reported HTTP 400 from the redirected
# `playwright.download.prss.microsoft.com` URL. Playwright 1.59 lists
# three mirrors and walks them on transient failures, but the install
# log truncation in the agent harness hid which mirror was hit, so we
# never knew if the failure was retryable.
#
# This script reproduces what `playwright install` would do for our exact
# pinned browser revisions (read from `node_modules/playwright-core/
# browsers.json`), with three improvements:
#
#   1. Aggressive cleanup. We `rm -rf` the target browser dir before
#      extracting so a stale partial extract never shadows a fresh
#      download.
#   2. Explicit mirror walk. The Microsoft Azure CDN occasionally returns
#      HTTP 400 for one or more mirrors. We log each mirror tried so the
#      failure mode is debuggable, and we walk all three before giving up:
#        - https://cdn.playwright.dev                (current primary)
#        - https://playwright.download.prss.microsoft.com  (redirect target)
#        - https://playwright.azureedge.net          (legacy origin)
#      All three currently 307-redirect to the same Azure backend, but
#      Azure may serve different edge nodes per hostname so a 400 from
#      one is not necessarily a 400 from another.
#   3. Idempotent. If the target browser dir already has a valid
#      `INSTALLATION_COMPLETE` marker AND the expected binary is +x, we
#      skip the download entirely.
#
# Concurrency: a `flock`-based lock at `$PLAYWRIGHT_BROWSERS_PATH/.install.lock`
# serializes parallel invocations so two callers can't race the same
# extract.
#
# # Usage
#
#   scripts/install-playwright-browsers.sh                 # install all needed
#   scripts/install-playwright-browsers.sh --force         # re-download
#   scripts/install-playwright-browsers.sh chromium-headless-shell  # subset
#
# Set `PLAYWRIGHT_BROWSERS_PATH` to override the install directory.
# Default: `$HOME/.cache/ms-playwright` (matches Playwright's default on
# Linux when `XDG_CACHE_HOME` is unset).
#
# # When to run
#
# Called from `scripts/daily-audit.sh` before any scenario runs, so the
# binary is guaranteed present on every recycled workspace. Also safe to
# call from CI workflows or developer onboarding — it no-ops when the
# install is already complete.
#
# Refs: BLD-1631 (root cause), BLD-1630 (blocked audit), BLD-481 (audit
# spec), BLD-480 (regression-catcher), BLD-1023 (fixture-route capture).

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── Configuration ────────────────────────────────────────────────────────

# Where Playwright stores browsers. Mirrors `defaultRegistryDirectory` in
# `playwright-core/lib/server/registry/index.js` (Linux branch).
PW_DIR="${PLAYWRIGHT_BROWSERS_PATH:-${XDG_CACHE_HOME:-$HOME/.cache}/ms-playwright}"

# Pin source of truth: the playwright-core package we installed via npm.
# Reading from `browsers.json` keeps this script in lockstep with whatever
# version of `@playwright/test` package.json resolves — no second pin to
# drift.
BROWSERS_JSON="$ROOT/node_modules/playwright-core/browsers.json"
if [[ ! -f "$BROWSERS_JSON" ]]; then
  echo "[install-playwright] ERROR: $BROWSERS_JSON not found." >&2
  echo "[install-playwright] Run \`npm ci\` first so playwright-core is on disk." >&2
  exit 1
fi

FORCE=0
WANTED_BROWSERS=()
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    -h|--help)
      sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "[install-playwright] unknown flag: $arg" >&2
      exit 2
      ;;
    *) WANTED_BROWSERS+=("$arg") ;;
  esac
done

# Default browser set: the same set `daily-audit.sh` and the e2e suite need.
# `chromium-headless-shell` is the only one we actually launch (see
# `playwright.config.ts` — `browserName: chromium`, no `channel` override,
# but the test runner picks headless-shell when `headless: true` is
# implicit which is our default). `ffmpeg` is required to be present
# whenever `chromium` is used because Playwright probes for it during
# context creation; without it, `--video` and certain trace-recording
# paths blow up. Including it now avoids a second BLD-1631 a month from
# now when somebody adds video recording.
if [[ ${#WANTED_BROWSERS[@]} -eq 0 ]]; then
  WANTED_BROWSERS=(chromium-headless-shell ffmpeg)
fi

# ── Host platform detection ─────────────────────────────────────────────

# Map `uname -m` → Playwright's linux-suffix string.
case "$(uname -m)" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "[install-playwright] ERROR: unsupported arch $(uname -m)" >&2
    exit 1
    ;;
esac

# Linux is the only supported platform here. macOS/Windows agents would use
# the upstream `playwright install` because their networks don't have the
# `__dirlock` overlayfs problem this script works around.
if [[ "$(uname -s)" != "Linux" ]]; then
  echo "[install-playwright] ERROR: this script only handles Linux." >&2
  echo "[install-playwright] On macOS/Windows, just run \`npx playwright install\`." >&2
  exit 1
fi

# ── Helpers ─────────────────────────────────────────────────────────────

# Read a browser revision from browsers.json without depending on `jq`
# being installed — node is always available because we're a Node project.
revision_for() {
  local name="$1"
  node -e "
    const b = require('$BROWSERS_JSON').browsers.find(x => x.name === '$name');
    if (!b) { console.error('no entry for $name'); process.exit(1); }
    process.stdout.write(b.revision);
  "
}

# Build the list of CDN URLs to try, in order. Matches Playwright's own
# fallback chain (cdn.playwright.dev → playwright.download.prss.microsoft.com
# → playwright.azureedge.net). All three currently 307-redirect to the same
# Azure backend, but Azure's edge nodes are partitioned by hostname so a
# transient 400 from one mirror is not necessarily a 400 from the others.
urls_for() {
  local name="$1"
  local revision="$2"
  local zipname
  case "$name" in
    chromium-headless-shell)
      # Linux x64 uses the Chrome for Testing CDN via `cftUrl()` in
      # Playwright, but Google's chrome-for-testing-public bucket only
      # has x64 binaries. arm64 falls back to the legacy Playwright CDN
      # path. We replicate both branches.
      if [[ "$ARCH" == "x64" ]]; then
        # Chrome for Testing version, not the Playwright revision, drives
        # the URL. Read browserVersion off browsers.json.
        local cft_ver
        cft_ver="$(node -e "
          const b = require('$BROWSERS_JSON').browsers.find(x => x.name === '$name');
          process.stdout.write(b.browserVersion);
        ")"
        zipname="chrome-headless-shell-linux64.zip"
        cat <<EOF
https://cdn.playwright.dev/dbazure/download/playwright/builds/cft/$cft_ver/linux64/$zipname
https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/cft/$cft_ver/linux64/$zipname
https://playwright.azureedge.net/builds/cft/$cft_ver/linux64/$zipname
https://storage.googleapis.com/chrome-for-testing-public/$cft_ver/linux64/$zipname
EOF
      else
        zipname="chromium-headless-shell-linux-arm64.zip"
        cat <<EOF
https://cdn.playwright.dev/dbazure/download/playwright/builds/chromium/$revision/$zipname
https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/chromium/$revision/$zipname
https://playwright.azureedge.net/builds/chromium/$revision/$zipname
EOF
      fi
      ;;
    ffmpeg)
      zipname="ffmpeg-linux-$ARCH.zip"
      [[ "$ARCH" == "x64" ]] && zipname="ffmpeg-linux.zip"
      cat <<EOF
https://cdn.playwright.dev/dbazure/download/playwright/builds/ffmpeg/$revision/$zipname
https://playwright.download.prss.microsoft.com/dbazure/download/playwright/builds/ffmpeg/$revision/$zipname
https://playwright.azureedge.net/builds/ffmpeg/$revision/$zipname
EOF
      ;;
    *)
      echo "[install-playwright] ERROR: don't know how to install '$name'" >&2
      return 1
      ;;
  esac
}

# Path to the executable inside the extracted browser dir, used to mark
# the install +x and to validate completeness. Matches the
# `EXECUTABLE_PATHS` table in playwright-core registry/index.js.
exe_for() {
  local name="$1"
  case "$name" in
    chromium-headless-shell)
      if [[ "$ARCH" == "x64" ]]; then
        echo "chrome-headless-shell-linux64/chrome-headless-shell"
      else
        echo "chrome-linux/headless_shell"
      fi
      ;;
    ffmpeg) echo "ffmpeg-linux" ;;
    *) return 1 ;;
  esac
}

# Browser directory naming. Playwright maps `chromium-headless-shell` →
# `chromium_headless_shell-<revision>` (dashes → underscores, suffix the
# revision).
dir_for() {
  local name="$1"
  local revision="$2"
  echo "$PW_DIR/${name//-/_}-$revision"
}

# ── Per-browser install ─────────────────────────────────────────────────

install_one() {
  local name="$1"
  local revision; revision="$(revision_for "$name")"
  local dir; dir="$(dir_for "$name" "$revision")"
  local exe_rel; exe_rel="$(exe_for "$name")"
  local exe_abs="$dir/$exe_rel"
  local marker="$dir/INSTALLATION_COMPLETE"

  if [[ $FORCE -eq 0 && -f "$marker" && -x "$exe_abs" ]]; then
    echo "[install-playwright] ✓ $name v$revision already installed at $dir"
    return 0
  fi

  echo "[install-playwright] installing $name v$revision → $dir"
  mkdir -p "$dir"

  local tmpzip
  tmpzip="$(mktemp -t pw-${name//\//_}-XXXXXX.zip)"
  trap 'rm -f "$tmpzip"' RETURN

  local downloaded=0
  while IFS= read -r url; do
    [[ -z "$url" ]] && continue
    echo "[install-playwright]   trying $url"
    if curl --fail --silent --show-error --location --max-time 240 \
        --retry 2 --retry-delay 3 \
        -o "$tmpzip" "$url"; then
      downloaded=1
      break
    fi
    echo "[install-playwright]   ↳ failed; trying next mirror"
  done < <(urls_for "$name" "$revision")

  if [[ $downloaded -ne 1 ]]; then
    echo "[install-playwright] ERROR: all mirrors failed for $name v$revision" >&2
    return 1
  fi

  # Wipe the target dir before extracting so a stale partial extract from
  # a previous failed install doesn't shadow our fresh download. Use a
  # python-based unzip (no `unzip` binary in this image) so we have a
  # single non-shell dependency to rely on.
  rm -rf "$dir"
  mkdir -p "$dir"
  python3 - "$tmpzip" "$dir" <<'PY'
import os, stat, sys, zipfile
src, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    z.extractall(dest)
    # Restore +x on entries that were executable in the zip. Some zip
    # implementations preserve mode bits in `external_attr`; for the
    # Playwright archives the executable bit is set in the upper 16 bits.
    for info in z.infolist():
        if info.is_dir():
            continue
        mode = (info.external_attr >> 16) & 0o777
        if mode == 0:
            continue
        p = os.path.join(dest, info.filename)
        if os.path.isfile(p):
            os.chmod(p, mode | stat.S_IRUSR | stat.S_IWUSR)
PY

  # Guarantee +x on the entry-point binary regardless of zip mode bits.
  if [[ ! -f "$exe_abs" ]]; then
    echo "[install-playwright] ERROR: expected $exe_abs not present after extract" >&2
    return 1
  fi
  chmod +x "$exe_abs"

  : > "$marker"
  echo "[install-playwright] ✓ $name v$revision ready at $exe_abs"
}

# ── Concurrency guard ───────────────────────────────────────────────────

# A second invocation while a download is in flight should wait, not
# clobber. The lock file lives next to the install dir so it inherits the
# same filesystem semantics. We use `flock` which works fine on overlayfs
# (unlike `proper-lockfile` which trips on stat semantics — see top
# comment).
mkdir -p "$PW_DIR"
LOCKFILE="$PW_DIR/.install.lock"
exec 9>"$LOCKFILE"
if ! flock -w 600 9; then
  echo "[install-playwright] ERROR: timeout waiting for install lock at $LOCKFILE" >&2
  exit 1
fi

# ── Drive ───────────────────────────────────────────────────────────────

echo "[install-playwright] target dir: $PW_DIR"
echo "[install-playwright] platform:   linux-$ARCH"
echo "[install-playwright] browsers:   ${WANTED_BROWSERS[*]}"

fail=0
for b in "${WANTED_BROWSERS[@]}"; do
  if ! install_one "$b"; then
    fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "[install-playwright] ✗ one or more browsers failed to install" >&2
  exit 1
fi

echo "[install-playwright] ✓ all browsers ready"
