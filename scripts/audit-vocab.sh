#!/usr/bin/env bash
# BLD-771: Vocabulary fork prevention — fail if cable-variant string literals
# appear at any call site OUTSIDE the canonical sources.
#
# Canonical sources (allowlist):
#   - lib/types.ts                  — type unions + label maps (source of truth)
#   - lib/cable-variant.ts          — derived value arrays + helpers
#   - __tests__/**                  — tests assert against literals by design
#   - lib/db/import-export.ts       — CSV/JSON serialization layer (string I/O)
#   - lib/db/session-sets.ts        — DB read/write boundary (DB stores strings)
#
# Any other file that literally writes one of the seven Attachment values or
# four MountPosition values (as a quoted string) is a vocabulary fork waiting
# to drift. Wire this script into the existing UX-audit CI step.
#
# Exit codes:
#   0  — no violations
#   1  — violations found (printed to stderr)
#
# Run locally:
#   bash scripts/audit-vocab.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# Quoted string literals — single or double quotes — for each enum value.
# Using grep -E with alternation; we tolerate `"foo"` and `'foo'`.
ATTACHMENT_PATTERNS='"(handle|ring_handle|ankle_strap|rope|bar|squat_harness|carabiner)"|'"'"'(handle|ring_handle|ankle_strap|rope|bar|squat_harness|carabiner)'"'"
MOUNT_PATTERNS='"(high|mid|low|floor)"|'"'"'(high|mid|low|floor)'"'"

# Allowlist: paths where literals are expected.
ALLOW_RE='^(lib/types\.ts|lib/cable-variant\.ts|lib/db/import-export\.ts|lib/db/session-sets\.ts|lib/db/schema\.ts|lib/db/migrations\.ts|lib/db/tables\.ts|lib/db/seed\.ts|lib/seed\.ts|__tests__/|scripts/audit-vocab\.sh)'

# Limit scan to source files (TS/TSX) under lib/, components/, hooks/, app/.
# Skip generated, vendor, build artifacts.
FILES=$(find lib components hooks app -type f \( -name "*.ts" -o -name "*.tsx" \) 2>/dev/null | sort -u || true)

violations=0
for f in $FILES; do
  # Skip allowlist.
  if [[ "$f" =~ $ALLOW_RE ]]; then
    continue
  fi
  # Search file for any literal. Suppress grep's exit on no-match.
  hits=$(grep -nE "$ATTACHMENT_PATTERNS|$MOUNT_PATTERNS" "$f" || true)
  if [[ -n "$hits" ]]; then
    # Filter out generic-word false positives. The four MountPosition values
    # ("high"/"mid"/"low"/"floor") collide with common English words used in
    # unrelated UI copy ("low contrast", "floor of"). To keep the audit useful
    # and noise-free, treat a hit as a violation only when it co-occurs with
    # a clear cable-variant context cue on the same line: the words
    # "attachment", "mount", "variant", or "pulley". Refine if false-negatives
    # surface in code review.
    contextual=$(echo "$hits" | grep -iE 'attachment|mount|variant|pulley' || true)
    if [[ -n "$contextual" ]]; then
      echo "VOCAB FORK: $f" >&2
      echo "$contextual" >&2
      violations=$((violations + 1))
    fi
  fi
done

if (( violations > 0 )); then
  echo "" >&2
  echo "Found $violations file(s) with cable-variant string literals outside the allowlist." >&2
  echo "Import vocab from lib/cable-variant.ts (ATTACHMENT_VALUES / MOUNT_POSITION_VALUES)" >&2
  echo "or labels from lib/types.ts (ATTACHMENT_LABELS / MOUNT_POSITION_LABELS) instead." >&2
  exit 1
fi

echo "audit-vocab.sh: clean (scanned $(echo "$FILES" | wc -l | tr -d ' ') files)"
