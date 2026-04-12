# PR Workflow Learnings

## Learnings

### GitHub PAT Requires `workflow` Scope to Push CI Files
**Source**: BLD-8 — Phase 1: Project Scaffolding
**Date**: 2026-04-12
**Context**: During initial repo setup, the agent prepared a `.github/workflows/ci.yml` file but could not push it. The PAT had `repo` scope but lacked `workflow` scope, causing the push to be silently rejected.
**Learning**: GitHub PATs have a separate `workflow` scope that governs write access to `.github/workflows/`. The standard `repo` scope alone is insufficient. Without `workflow` scope, pushes containing workflow file changes are rejected — the error message does not always clearly indicate the missing scope.
**Action**: Before pushing GitHub Actions workflow files, verify the PAT includes `workflow` scope. If a push to `.github/workflows/` is rejected despite having `repo` scope, the missing `workflow` scope is the most likely cause.
**Tags**: github, pat, workflow-scope, ci, github-actions, permissions
