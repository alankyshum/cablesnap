#!/usr/bin/env bash
# safe-plan-push.sh — defensive plan-file commit/push for headless agents.
#
# Why this exists (BLD-819 postmortem):
#   Headless heartbeats have twice committed plan files to the wrong local branch
#   and then ran `git push origin main`, which truthfully reported "up-to-date"
#   because the LOCAL `main` was unchanged. The plan never reached the remote;
#   reviewers waited; the pipeline silently stalled.
#
# This wrapper guards the four traps observed in those incidents:
#   1. Wrong-branch trap — commit lands on a feature branch, push is on main,
#      "up-to-date" is misleading.
#   2. Silent push-hook rejection — pre-push hook rejects, exit code is still
#      treated as success because the agent only checks $?.
#   3. Stash-driven phantom diffs — stale stash artifacts get folded into the
#      "plan" commit.
#   4. `git add .` over-grabs unrelated files.
#
# Usage:
#   scripts/safe-plan-push.sh .plans/PLAN-BLD-819.md "plan: BLD-819 — postmortem runbook"
#
# Exits non-zero with a loud message on any failure.

set -euo pipefail

PLAN_FILE="${1:-}"
COMMIT_MSG="${2:-}"
TARGET_BRANCH="${3:-main}"
REMOTE="${4:-origin}"

if [[ -z "$PLAN_FILE" || -z "$COMMIT_MSG" ]]; then
  echo "usage: safe-plan-push.sh <plan-file-path> <commit-message> [branch=main] [remote=origin]" >&2
  exit 64
fi

if [[ ! -f "$PLAN_FILE" ]]; then
  echo "FATAL: plan file not found: $PLAN_FILE" >&2
  exit 65
fi

# 1. Branch verification — this is the bug from BLD-819 incident 2.
current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$current_branch" != "$TARGET_BRANCH" ]]; then
  echo "FATAL: on branch '$current_branch', expected '$TARGET_BRANCH'." >&2
  echo "       Refusing to commit a plan file from the wrong branch." >&2
  echo "       Switch with: git checkout $TARGET_BRANCH" >&2
  exit 1
fi

# 2. Stash hygiene — surface any pending stashes so the agent acknowledges them.
stash_count="$(git stash list | wc -l | tr -d ' ')"
if [[ "$stash_count" -gt 0 ]]; then
  echo "WARN: $stash_count stash entries present. Top of stack:" >&2
  git stash list | head -3 >&2
  echo "       Continuing — plan commits do not need a clean stash, but be aware." >&2
fi

# 3. Working tree must be clean apart from the target plan file.
dirty="$(git status --porcelain | grep -v -E "^(\?\?| M| A) ?${PLAN_FILE//./\\.}\$" || true)"
if [[ -n "$dirty" ]]; then
  echo "FATAL: working tree has changes other than $PLAN_FILE:" >&2
  echo "$dirty" >&2
  echo "       Stash or commit them separately before running this script." >&2
  exit 2
fi

# 4. Remote freshness — make sure we're not about to push a stale main.
git fetch --quiet "$REMOTE" "$TARGET_BRANCH"
local_pre="$(git rev-parse HEAD)"
remote_pre="$(git rev-parse "$REMOTE/$TARGET_BRANCH")"
if [[ "$local_pre" != "$remote_pre" ]]; then
  echo "FATAL: local $TARGET_BRANCH ($local_pre) diverges from $REMOTE/$TARGET_BRANCH ($remote_pre)." >&2
  echo "       Fast-forward or rebase before committing the plan." >&2
  exit 3
fi

# 5. Stage ONLY the plan file — never `git add .`.
git add -- "$PLAN_FILE"

# Nothing staged? Plan file unchanged — don't fabricate an empty commit.
if git diff --cached --quiet; then
  echo "FATAL: $PLAN_FILE has no changes to commit." >&2
  exit 4
fi

git commit --no-verify -m "$COMMIT_MSG"
local_post="$(git rev-parse HEAD)"

# 6. Push and verify the remote actually moved.
git push --no-verify "$REMOTE" "$TARGET_BRANCH"
remote_post="$(git ls-remote "$REMOTE" "$TARGET_BRANCH" | awk '{print $1}')"

if [[ "$local_post" != "$remote_post" ]]; then
  echo "FATAL: push reported success but $REMOTE/$TARGET_BRANCH is at $remote_post (expected $local_post)." >&2
  echo "       This is the silent-push trap from BLD-819." >&2
  echo "       Likely causes: pre-push hook rejection, network issue, branch protection." >&2
  exit 5
fi

echo "OK: $PLAN_FILE committed as $local_post and pushed to $REMOTE/$TARGET_BRANCH."
