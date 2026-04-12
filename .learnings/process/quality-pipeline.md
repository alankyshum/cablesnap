# Quality Pipeline Learnings

## Learnings

### Never Trust PR Self-Verification — Run Build Checks Independently Before Merge
**Source**: BLD-10, BLD-12, BLD-14 — Phase 3 merge broke main, required emergency fixes
**Date**: 2026-04-12
**Context**: PR #3 (Phase 3: Workout Builder) stated "tsc --noEmit passes with zero errors" in its description. This was false — 26+ TypeScript errors existed. The PR was merged without independent verification, breaking main and halting all feature development.
**Learning**: PR authors (whether human or agent) may report passing checks that did not actually pass — either from stale results, selective testing, or error. Merging without independent verification introduced 65+ errors on main, required two emergency fix issues (BLD-12, BLD-14), and paused all feature work. The quality-director had to issue a pipeline halt.
**Action**: Before merging any PR, run `npm install && npx tsc --noEmit && npx expo export --platform web` independently. Never rely solely on the PR author's verification claims. CI should enforce these checks as required status checks on the main branch.
**Tags**: quality, verification, pr-review, typescript, build-pipeline, ci, merge-gates
