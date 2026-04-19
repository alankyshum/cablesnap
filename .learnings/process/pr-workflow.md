# PR Workflow Learnings

## Learnings

### GitHub PAT Requires `workflow` Scope to Push CI Files
**Source**: BLD-8 — Phase 1: Project Scaffolding
**Date**: 2026-04-12
**Context**: During initial repo setup, the agent prepared a `.github/workflows/ci.yml` file but could not push it. The PAT had `repo` scope but lacked `workflow` scope, causing the push to be silently rejected.
**Learning**: GitHub PATs have a separate `workflow` scope that governs write access to `.github/workflows/`. The standard `repo` scope alone is insufficient. Without `workflow` scope, pushes containing workflow file changes are rejected — the error message does not always clearly indicate the missing scope.
**Action**: Before pushing GitHub Actions workflow files, verify the PAT includes `workflow` scope. If a push to `.github/workflows/` is rejected despite having `repo` scope, the missing `workflow` scope is the most likely cause.
**Tags**: github, pat, workflow-scope, ci, github-actions, permissions

### Rebase on Main Before PR When Parallel Branches Are In Flight
**Source**: BLD-44, BLD-52, BLD-53, BLD-57 — Acceptance test batch (PR #70)
**Date**: 2026-04-15
**Context**: PR #70 added 4 acceptance test files but was branched from a stale main. PRs #66 and #68 (BLD-48 settings tests, BLD-49 dashboard tests) had already been merged to main, adding `dashboard.test.tsx` and `settings.test.tsx`. Because PR #70's branch predated those merges, it effectively deleted those files on merge. Techlead review caught the issue and required rebasing before merge.
**Learning**: In multi-agent parallel development, agents create branches independently and may not be aware of other agents' merged PRs. A branch created before another PR merges will not contain the other PR's files — merging it without rebasing silently deletes the other PR's additions. Unlike human teams where developers naturally track each other's merges, AI agents have no awareness of concurrent work.
**Action**: Always run `git pull origin main && git rebase main` before creating a PR. If the PR has already been created, rebase and force-push before requesting review. Reviewers should check the PR's file list for unexpected deletions (files showing as removed that were not part of the original task scope).
**Tags**: git, rebase, parallel-branches, multi-agent, merge-conflict, file-deletion, pr-workflow, cross-project

### Automated Reviewer (GPT 5.3 Codex) Scans Entire Repo, Not PR Diff
**Source**: BLD-379 — Fix all 22 lint errors (PR #213), also observed in PR #212, #206, #203
**Date**: 2026-04-19
**Context**: PR #213 was repeatedly BLOCKED by the automated reviewer (GPT 5.3 Codex) with a MAJOR DATA-02 finding for `ScrollView` + `.map()` anti-pattern. The flagged files (`app/(tabs)/index.tsx`, `components/progress/CalendarView.tsx`, `components/session/SessionToolboxSheet.tsx`) were NOT in the PR diff — they are pre-existing code untouched by the PR.
**Learning**: The automated reviewer scans the ENTIRE repository codebase, not just the PR diff. It will flag pre-existing issues in unmodified files as MAJOR findings, causing false BLOCKED verdicts. This has occurred on at least 4 PRs. The tech lead must verify that MAJOR findings are actually present in the PR diff before treating them as blockers. A tech lead override comment is required to unblock the merge.
**Action**: When a PR is BLOCKED by the automated reviewer, check whether each MAJOR finding references files that are actually in the PR diff. If the flagged files are NOT in the diff, post a "REVIEWER Finding Override" comment documenting that the finding is a false positive (pre-existing code not in diff), then proceed with merge. Do not waste cycles fixing pre-existing issues that are unrelated to the PR scope.
**Tags**: automated-review, false-positive, code-review, gpt-codex, pr-workflow, merge-blocking, tech-lead-override
