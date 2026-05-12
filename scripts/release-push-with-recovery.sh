#!/usr/bin/env bash
# scripts/release-push-with-recovery.sh
# BLD-1185: Push the release commit to origin/main with CHANGELOG conflict recovery.
#
# Called by .github/workflows/scheduled-release.yml "Commit and push" step after the
# release commit has already been created (git add + git commit already done by the
# caller).
#
# Required env vars:
#   VERSION               – semver string, e.g. "0.26.34"
#   VCODE                 – integer version code, e.g. "27"
#   DATE                  – ISO date, e.g. "2026-05-12" (optional; defaults to today)
#   RELEASE_PUSH_SLEEP_MAX – max jitter sleep seconds between retries (default: 5;
#                           set to 0 in tests to skip sleep)
#
# Behaviour (up to 5 push attempts):
#   (a) Clean path       — git push succeeds immediately.
#   (b) Clean rebase     — push rejected, git pull --rebase succeeds → retry push.
#   (c) Conflict path    — push rejected, git pull --rebase conflicts
#                          (CHANGELOG.md / derived artifacts diverged):
#                          abort rebase, reset to origin/main, re-apply all version
#                          bumps + changelog promotion + npm run changelog:gen, re-commit,
#                          retry push.  Any new "## Unreleased" entries added by the
#                          concurrent merge are preserved — they are promoted into the
#                          v$VERSION section automatically.
#
# Preconditions: git user.name/email already configured; CWD is the repo root.

set -euo pipefail

VERSION="${VERSION:?VERSION env var is required}"
VCODE="${VCODE:?VCODE env var is required}"
DATE="${DATE:-$(date -u +%Y-%m-%d)}"
RELEASE_PUSH_SLEEP_MAX="${RELEASE_PUSH_SLEEP_MAX:-5}"

# Re-apply all version bump steps on top of whatever HEAD is currently checked out.
# Used after `git reset --hard origin/main` when a rebase conflict occurs.
apply_bumps() {
  local version="$1" vcode="$2" date="$3"

  # package.json
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$version';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "

  # app.config.ts
  sed -i "s/version: \"[^\"]*\"/version: \"$version\"/" app.config.ts
  sed -i "s/versionCode: [0-9]*/versionCode: $vcode/" app.config.ts

  # F-Droid metadata
  sed -i "s/CurrentVersion: .*/CurrentVersion: $version/" fdroid/metadata/com.persoack.cablesnap.yml
  sed -i "s/CurrentVersionCode: .*/CurrentVersionCode: $vcode/" fdroid/metadata/com.persoack.cablesnap.yml

  # Promote ## Unreleased → ## v$version.
  # Any "## Unreleased" bullets that arrived via the concurrent merge are present on
  # this HEAD; the awk script moves them into the versioned section automatically.
  local new_header="## v$version — $date"
  local marker="<!-- versionCode: $vcode -->"
  local placeholder=$'## Unreleased\n\n_No user-facing changes yet._\n'
  awk -v new_header="$new_header" \
      -v marker="$marker" \
      -v placeholder="$placeholder" '
    BEGIN { promoted = 0 }
    /^##[[:space:]]+Unreleased[[:space:]]*$/ && promoted == 0 {
      printf "%s\n", placeholder
      print new_header
      print marker
      promoted = 1
      next
    }
    { print }
  ' CHANGELOG.md > CHANGELOG.md.tmp
  mv CHANGELOG.md.tmp CHANGELOG.md

  # Regenerate derived artifacts (lib/changelog.generated.ts + F-Droid sidecars).
  npm run changelog:gen
}

pushed=0
for i in 1 2 3 4 5; do
  if git push origin main; then
    pushed=1
    break
  fi

  echo "::warning::Push rejected (attempt $i/5). Fetching origin/main..."
  git fetch origin main

  if git pull --rebase origin main; then
    echo "Clean rebase succeeded on attempt $i — retrying push..."
    if [ "$RELEASE_PUSH_SLEEP_MAX" -gt 0 ]; then
      sleep $((RANDOM % RELEASE_PUSH_SLEEP_MAX + 2))
    fi
    continue
  fi

  # Rebase conflicted — typically CHANGELOG.md or derived artifacts diverged because
  # a concurrent PR also touched the ## Unreleased section.  Abort, reset to the new
  # origin/main tip, and regenerate all bump + changelog artifacts on top.
  echo "::warning::Rebase conflicted on attempt $i — regenerate-on-conflict recovery..."
  git rebase --abort || true
  git reset --hard origin/main

  apply_bumps "$VERSION" "$VCODE" "$DATE"

  git add package.json app.config.ts fdroid/metadata/com.persoack.cablesnap.yml \
    CHANGELOG.md \
    lib/changelog.generated.ts \
    fdroid/metadata/com.persoack.cablesnap/en-US/changelogs/
  git commit -m "release: v$VERSION"

  if [ "$RELEASE_PUSH_SLEEP_MAX" -gt 0 ]; then
    sleep $((RANDOM % RELEASE_PUSH_SLEEP_MAX + 2))
  fi
done

if [ "$pushed" -ne 1 ]; then
  echo "::error::Failed to push release commit after 5 attempts."
  exit 1
fi

echo "Successfully pushed release: v$VERSION"
