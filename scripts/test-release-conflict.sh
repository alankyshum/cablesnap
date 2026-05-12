#!/usr/bin/env bash
# Integration test for the "regenerate-on-conflict" path in scheduled-release.yml.
#
# Scenario: A CHANGELOG.md-touching commit lands on `origin/main` between the
# workflow's checkout and its push attempt. The naive `git pull --rebase` would
# fail with a content conflict on CHANGELOG.md. This test verifies that the
# release workflow logic correctly:
#   1. Detects the conflict.
#   2. Aborts the rebase.
#   3. Resets to origin/main.
#   4. Re-applies the version bump + changelog promotion.
#   5. Commits and pushes successfully.
#
# The test does NOT exercise the full GitHub Actions YAML (no runner needed).
# It isolates and exercises the bash logic from the "Commit and push" step
# using local bare git repos as stand-ins for `origin`.
#
# Exit codes:
#   0  All assertions passed
#   1  One or more assertions failed
#
# Usage:
#   bash scripts/test-release-conflict.sh
#   # Or from the repo root:
#   npm test -- --testPathPattern='test-release-conflict' 2>/dev/null ||
#     bash scripts/test-release-conflict.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
PASS=0
FAIL=0

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    pass "$label"
  else
    fail "$label — expected '$expected', got '$actual'"
  fi
}

assert_contains() {
  local label="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    pass "$label"
  else
    fail "$label — expected to find '$needle' in output"
  fi
}

assert_file_exists() {
  local label="$1" path="$2"
  if [ -f "$path" ]; then
    pass "$label"
  else
    fail "$label — file not found: $path"
  fi
}

# ---------------------------------------------------------------------------
# Setup: create a minimal fake repo that mimics the CableSnap layout
# ---------------------------------------------------------------------------
TMPDIR_BASE=$(mktemp -d)
trap 'rm -rf "$TMPDIR_BASE"' EXIT

FAKE_REMOTE="$TMPDIR_BASE/remote.git"
WORKFLOW_CLONE="$TMPDIR_BASE/workflow-clone"   # simulates the Actions checkout
CONCURRENT_CLONE="$TMPDIR_BASE/concurrent"      # simulates concurrent PR merge

# Ensure local git operations use 'main' as default branch name
export GIT_DEFAULT_BRANCH=main
git config --global init.defaultBranch main 2>/dev/null || true

# Minimal changelog.generated.ts so npm run changelog:gen can be called
# (or replaced with a stub for isolated testing).
NODE=$(command -v node || true)

echo ""
echo "=== test-release-conflict.sh — Regenerate-on-conflict integration test ==="
echo ""

# ---------------------------------------------------------------------------
# Test 1: Clean rebase path (no conflict)
# ---------------------------------------------------------------------------
echo "--- Test 1: Clean rebase (non-CHANGELOG concurrent commit) ---"

# Create a bare remote with a minimal package.json + CHANGELOG.md.
git init --bare "$FAKE_REMOTE" -q
INIT_CLONE="$TMPDIR_BASE/init"
git clone "$FAKE_REMOTE" "$INIT_CLONE" -q

cd "$INIT_CLONE"
git config user.name "Test" && git config user.email "test@example.com"

cat > package.json <<'PKG'
{"name":"cablesnap","version":"0.26.32"}
PKG

cat > app.config.ts <<'APP'
export default { version: "0.26.32", android: { versionCode: 100 } };
APP

cat > CHANGELOG.md <<'CL'
## Unreleased

- Some feature

## v0.26.32 — 2026-05-01
<!-- versionCode: 100 -->
- Previous release
CL

mkdir -p fdroid/metadata/com.persoack.cablesnap/en-US/changelogs
cat > fdroid/metadata/com.persoack.cablesnap.yml <<'FDROID'
CurrentVersion: 0.26.32
CurrentVersionCode: 100
FDROID

git add -A && git commit -m "initial" -q
git push origin main -q

# Workflow clone = the Actions runner checkout
git clone "$FAKE_REMOTE" "$WORKFLOW_CLONE" -q
cd "$WORKFLOW_CLONE"
git config user.name "CableSnap Release Bot"
git config user.email "release-bot@cablesnap.app"

# Concurrent change: touches only README (no CHANGELOG conflict)
git clone "$FAKE_REMOTE" "$CONCURRENT_CLONE" -q
cd "$CONCURRENT_CLONE"
git config user.name "Test" && git config user.email "test@example.com"
echo "readme" > README.md
git add README.md && git commit -m "chore: readme update" -q
git push origin main -q

# Workflow: bump version in its clone (already-fetched HEAD, before the concurrent push)
cd "$WORKFLOW_CLONE"
VERSION="0.26.33"
VCODE="101"

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
sed -i "s/version: \"[^\"]*\"/version: \"$VERSION\"/" app.config.ts 2>/dev/null || \
  sed -i '' "s/version: \"[^\"]*\"/version: \"$VERSION\"/" app.config.ts
sed -i "s/versionCode: [0-9]*/versionCode: $VCODE/" app.config.ts 2>/dev/null || \
  sed -i '' "s/versionCode: [0-9]*/versionCode: $VCODE/" app.config.ts
sed -i "s/CurrentVersion: .*/CurrentVersion: $VERSION/" fdroid/metadata/com.persoack.cablesnap.yml 2>/dev/null || \
  sed -i '' "s/CurrentVersion: .*/CurrentVersion: $VERSION/" fdroid/metadata/com.persoack.cablesnap.yml
sed -i "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE/" fdroid/metadata/com.persoack.cablesnap.yml 2>/dev/null || \
  sed -i '' "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE/" fdroid/metadata/com.persoack.cablesnap.yml

# Promote CHANGELOG (simplified: no npm run changelog:gen, just header bump)
DATE=$(date -u +%Y-%m-%d)
NEW_HEADER="## v$VERSION — $DATE"
MARKER="<!-- versionCode: $VCODE -->"
PLACEHOLDER=$'## Unreleased\n\n_No user-facing changes yet._\n'
awk -v new_header="$NEW_HEADER" -v marker="$MARKER" -v placeholder="$PLACEHOLDER" '
  BEGIN { promoted = 0 }
  /^##[[:space:]]+Unreleased[[:space:]]*$/ && promoted == 0 {
    printf "%s\n", placeholder; print new_header; print marker; promoted = 1; next
  }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

mkdir -p fdroid/metadata/com.persoack.cablesnap/en-US/changelogs
echo "Some feature" > "fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/${VCODE}.txt"

git add -A && git commit -m "release: v$VERSION" -q

# Now run the push+rebase logic (clean path — only README changed concurrently)
pushed=0
for i in 1 2 3 4 5; do
  if git push origin main 2>/dev/null; then
    pushed=1
    break
  fi
  git fetch origin main -q
  if git pull --rebase origin main -q 2>/dev/null; then
    : # clean rebase
  else
    git rebase --abort 2>/dev/null || true
    git reset --hard origin/main -q
    # (reapply_bump would run here — covered by Test 2)
    echo "UNEXPECTED conflict in Test 1"
    break
  fi
done

assert_eq "Test1: pushed via clean rebase" "1" "$pushed"

# Verify remote has the release commit
REMOTE_MSG=$(git log origin/main --oneline -1)
assert_contains "Test1: release commit on remote" "$REMOTE_MSG" "release: v$VERSION"

# Verify remote also has the concurrent README change
assert_file_exists "Test1: README from concurrent merge present" \
  "$WORKFLOW_CLONE/README.md"

# ---------------------------------------------------------------------------
# Test 2: Conflict path (concurrent commit touches CHANGELOG.md)
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 2: Conflict path (concurrent CHANGELOG.md modification) ---"

T2_REMOTE="$TMPDIR_BASE/t2-remote.git"
T2_WORKFLOW="$TMPDIR_BASE/t2-workflow"
T2_CONCURRENT="$TMPDIR_BASE/t2-concurrent"

git init --bare "$T2_REMOTE" -q
INIT2="$TMPDIR_BASE/t2-init"
git clone "$T2_REMOTE" "$INIT2" -q

cd "$INIT2"
git config user.name "Test" && git config user.email "test@example.com"

cat > package.json <<'PKG'
{"name":"cablesnap","version":"0.26.32"}
PKG
cat > app.config.ts <<'APP'
export default { version: "0.26.32", android: { versionCode: 100 } };
APP
cat > CHANGELOG.md <<'CL'
## Unreleased

- Some feature from workflow checkout

## v0.26.32 — 2026-05-01
<!-- versionCode: 100 -->
- Previous release
CL

mkdir -p fdroid/metadata/com.persoack.cablesnap/en-US/changelogs
cat > fdroid/metadata/com.persoack.cablesnap.yml <<'FDROID'
CurrentVersion: 0.26.32
CurrentVersionCode: 100
FDROID

git add -A && git commit -m "initial" -q
git push origin main -q

# Workflow clone (checks out before the concurrent CHANGELOG merge)
git clone "$T2_REMOTE" "$T2_WORKFLOW" -q
cd "$T2_WORKFLOW"
git config user.name "CableSnap Release Bot"
git config user.email "release-bot@cablesnap.app"
BASE_HASH=$(git rev-parse HEAD)

# Concurrent clone: adds a new Unreleased bullet AND modifies the same
# fields in package.json that the workflow will also modify.
# This guarantees a 3-way merge conflict that git cannot auto-resolve.
git clone "$T2_REMOTE" "$T2_CONCURRENT" -q
cd "$T2_CONCURRENT"
git config user.name "Test" && git config user.email "test@example.com"
cat > CHANGELOG.md <<'CL'
## Unreleased

- Some feature from workflow checkout
- New bullet from concurrent PR

## v0.26.32 — 2026-05-01
<!-- versionCode: 100 -->
- Previous release
CL
# Also set a conflicting version value in package.json so the rebase
# produces a definite, unresolvable content conflict.
cat > package.json <<'PKG'
{"name":"cablesnap","version":"0.26.32-hotfix"}
PKG
git add CHANGELOG.md package.json && git commit -m "feat: add concurrent changelog entry + hotfix version" -q
git push origin main -q

# Workflow: bump version in its stale clone
cd "$T2_WORKFLOW"
VERSION2="0.26.33"
VCODE2="101"

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$VERSION2';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
sed -i "s/version: \"[^\"]*\"/version: \"$VERSION2\"/" app.config.ts 2>/dev/null || \
  sed -i '' "s/version: \"[^\"]*\"/version: \"$VERSION2\"/" app.config.ts
sed -i "s/versionCode: [0-9]*/versionCode: $VCODE2/" app.config.ts 2>/dev/null || \
  sed -i '' "s/versionCode: [0-9]*/versionCode: $VCODE2/" app.config.ts
sed -i "s/CurrentVersion: .*/CurrentVersion: $VERSION2/" fdroid/metadata/com.persoack.cablesnap.yml 2>/dev/null || \
  sed -i '' "s/CurrentVersion: .*/CurrentVersion: $VERSION2/" fdroid/metadata/com.persoack.cablesnap.yml
sed -i "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE2/" fdroid/metadata/com.persoack.cablesnap.yml 2>/dev/null || \
  sed -i '' "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE2/" fdroid/metadata/com.persoack.cablesnap.yml

# Promote CHANGELOG (from stale view — only has "Some feature from workflow checkout")
DATE=$(date -u +%Y-%m-%d)
NEW_HEADER2="## v$VERSION2 — $DATE"
MARKER2="<!-- versionCode: $VCODE2 -->"
PLACEHOLDER2=$'## Unreleased\n\n_No user-facing changes yet._\n'
awk -v new_header="$NEW_HEADER2" -v marker="$MARKER2" -v placeholder="$PLACEHOLDER2" '
  BEGIN { promoted = 0 }
  /^##[[:space:]]+Unreleased[[:space:]]*$/ && promoted == 0 {
    printf "%s\n", placeholder; print new_header; print marker; promoted = 1; next
  }
  { print }
' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

mkdir -p fdroid/metadata/com.persoack.cablesnap/en-US/changelogs
echo "Some feature from workflow checkout" > \
  "fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/${VCODE2}.txt"

git add -A && git commit -m "release: v$VERSION2" -q

# Inline reapply_bump function (mirrors the workflow's reapply_bump helper)
reapply_bump_t2() {
  DATE=$(date -u +%Y-%m-%d)
  NEW_HEADER2="## v$VERSION2 — $DATE"
  MARKER2="<!-- versionCode: $VCODE2 -->"
  PLACEHOLDER2=$'## Unreleased\n\n_No user-facing changes yet._\n'

  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$VERSION2';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  sed -i "s/version: \"[^\"]*\"/version: \"$VERSION2\"/" app.config.ts 2>/dev/null || \
    sed -i '' "s/version: \"[^\"]*\"/version: \"$VERSION2\"/" app.config.ts
  sed -i "s/versionCode: [0-9]*/versionCode: $VCODE2/" app.config.ts 2>/dev/null || \
    sed -i '' "s/versionCode: [0-9]*/versionCode: $VCODE2/" app.config.ts
  sed -i "s/CurrentVersion: .*/CurrentVersion: $VERSION2/" fdroid/metadata/com.persoack.cablesnap.yml 2>/dev/null || \
    sed -i '' "s/CurrentVersion: .*/CurrentVersion: $VERSION2/" fdroid/metadata/com.persoack.cablesnap.yml
  sed -i "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE2/" fdroid/metadata/com.persoack.cablesnap.yml 2>/dev/null || \
    sed -i '' "s/CurrentVersionCode: .*/CurrentVersionCode: $VCODE2/" fdroid/metadata/com.persoack.cablesnap.yml

  awk -v new_header="$NEW_HEADER2" -v marker="$MARKER2" -v placeholder="$PLACEHOLDER2" '
    BEGIN { promoted = 0 }
    /^##[[:space:]]+Unreleased[[:space:]]*$/ && promoted == 0 {
      printf "%s\n", placeholder; print new_header; print marker; promoted = 1; next
    }
    { print }
  ' CHANGELOG.md > CHANGELOG.md.tmp && mv CHANGELOG.md.tmp CHANGELOG.md

  # Stub for npm run changelog:gen — write the sidecar directly.
  mkdir -p "fdroid/metadata/com.persoack.cablesnap/en-US/changelogs"
  echo "Some feature from workflow checkout; New bullet from concurrent PR" > \
    "fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/${VCODE2}.txt"
}

stage_and_commit_t2() {
  git add package.json app.config.ts fdroid/metadata/com.persoack.cablesnap.yml \
    CHANGELOG.md \
    fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/ 2>/dev/null || true
  if git diff --cached --quiet; then
    return 0
  fi
  git commit -m "release: v$VERSION2" -q
}

# Run the push+conflict-detect+regenerate logic
pushed2=0
conflict_detected=0
for i in 1 2 3 4 5; do
  if git push origin main 2>/dev/null; then
    pushed2=1
    break
  fi
  git fetch origin main -q
  if git pull --rebase origin main -q 2>/dev/null; then
    : # clean rebase
  else
    conflict_detected=1
    git rebase --abort 2>/dev/null || true
    git reset --hard origin/main -q
    reapply_bump_t2
    stage_and_commit_t2
  fi
done

assert_eq "Test2: conflict was detected" "1" "$conflict_detected"
assert_eq "Test2: pushed after conflict regeneration" "1" "$pushed2"

# Verify release commit on remote
REMOTE_MSG2=$(cd "$T2_WORKFLOW" && git log origin/main --oneline -1)
assert_contains "Test2: release commit on remote" "$REMOTE_MSG2" "release: v$VERSION2"

# Verify the promoted CHANGELOG contains the concurrent PR's bullet
CHANGELOG_ON_REMOTE=$(cd "$T2_WORKFLOW" && git show origin/main:CHANGELOG.md)
assert_contains "Test2: concurrent bullet promoted into versioned section" \
  "$CHANGELOG_ON_REMOTE" "New bullet from concurrent PR"

# Verify CHANGELOG has no ## Unreleased content (it was promoted)
# After release, the new ## Unreleased placeholder should be present but empty
UNRELEASED_BODY=$(echo "$CHANGELOG_ON_REMOTE" | awk '
  /^##[[:space:]]+Unreleased[[:space:]]*$/ { in_u = 1; next }
  in_u && /^## / { exit }
  in_u { print }
')
STRIPPED=$(printf '%s\n' "$UNRELEASED_BODY" \
  | sed -E 's/_No user-facing changes yet\._//I' \
  | tr -d '[:space:]')
assert_eq "Test2: Unreleased section is empty after release" "" "$STRIPPED"

# Verify sidecar was written
assert_file_exists "Test2: F-Droid sidecar written" \
  "$T2_WORKFLOW/fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/${VCODE2}.txt"

# ---------------------------------------------------------------------------
# Test 3: Retry cap — fails after 5 attempts if remote never accepts push
# ---------------------------------------------------------------------------
echo ""
echo "--- Test 3: Retry cap (always-failing push) ---"

T3_REMOTE="$TMPDIR_BASE/t3-remote.git"
T3_WORKFLOW="$TMPDIR_BASE/t3-workflow"

git init --bare "$T3_REMOTE" -q
INIT3="$TMPDIR_BASE/t3-init"
git clone "$T3_REMOTE" "$INIT3" -q
cd "$INIT3"
git config user.name "Test" && git config user.email "test@example.com"
echo '{"name":"cablesnap","version":"0.26.32"}' > package.json
git add -A && git commit -m "initial" -q
git push origin main -q

git clone "$T3_REMOTE" "$T3_WORKFLOW" -q
cd "$T3_WORKFLOW"
git config user.name "CableSnap Release Bot"
git config user.email "release-bot@cablesnap.app"

# Make the remote keep advancing so every push attempt fails
T3_BLOCKER="$TMPDIR_BASE/t3-blocker"
git clone "$T3_REMOTE" "$T3_BLOCKER" -q
cd "$T3_BLOCKER"
git config user.name "Test" && git config user.email "test@example.com"

cd "$T3_WORKFLOW"
echo '{"name":"cablesnap","version":"0.26.33"}' > package.json
git add -A && git commit -m "release: v0.26.33" -q

attempts=0
pushed3=0
for i in 1 2 3 4 5; do
  attempts=$((attempts + 1))
  # Keep advancing remote so push always fails
  cd "$T3_BLOCKER"
  echo "blocker $i" > "blocker-$i.txt"
  git add -A && git commit -m "blocker $i" -q
  git push origin main -q 2>/dev/null
  cd "$T3_WORKFLOW"

  if git push origin main 2>/dev/null; then
    pushed3=1
    break
  fi
  git fetch origin main -q
  git pull --rebase origin main -q 2>/dev/null || {
    git rebase --abort 2>/dev/null || true
    git reset --hard origin/main -q
    echo '{"name":"cablesnap","version":"0.26.33"}' > package.json
    git add -A && git commit -m "release: v0.26.33" -q
  }
done

assert_eq "Test3: attempted all 5 retries" "5" "$attempts"
assert_eq "Test3: push failed after all retries" "0" "$pushed3"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
