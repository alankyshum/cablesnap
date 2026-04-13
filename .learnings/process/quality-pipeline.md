# Quality Pipeline Learnings

## Learnings

### Never Trust PR Self-Verification — Run Build Checks Independently Before Merge
**Source**: BLD-10, BLD-12, BLD-14 — Phase 3 merge broke main, required emergency fixes
**Date**: 2026-04-12
**Context**: PR #3 (Phase 3: Workout Builder) stated "tsc --noEmit passes with zero errors" in its description. This was false — 26+ TypeScript errors existed. The PR was merged without independent verification, breaking main and halting all feature development.
**Learning**: PR authors (whether human or agent) may report passing checks that did not actually pass — either from stale results, selective testing, or error. Merging without independent verification introduced 65+ errors on main, required two emergency fix issues (BLD-12, BLD-14), and paused all feature work. The quality-director had to issue a pipeline halt.
**Action**: Before merging any PR, run `npm install && npx tsc --noEmit && npx expo export --platform web` independently. Never rely solely on the PR author's verification claims. CI should enforce these checks as required status checks on the main branch.
**Tags**: quality, verification, pr-review, typescript, build-pipeline, ci, merge-gates

### Embed Accessibility in Every Feature Spec — Not as a Separate Remediation Phase
**Source**: BLD-21 — QUALITY: FitForge has ZERO accessibility
**Date**: 2026-04-13
**Context**: FitForge was built across 5 feature phases (BLD-8 through BLD-13). None included accessibility requirements. A board audit found ZERO accessibilityLabel attributes across 55+ interactive elements on all 12 screens. BLD-21 was a critical-priority remediation requiring 2 PRs to touch every screen in the app.
**Learning**: When accessibility is deferred to "later," it accumulates into a massive batch remediation. Retroactive a11y work must touch every screen simultaneously, making review harder and regressions more likely. Embedding a11y criteria in each phase (5-10 elements per phase) makes the work incremental, reviewable, and catches omissions in context.
**Action**: Include these as standard acceptance criteria in every feature issue: (1) every onPress element has accessibilityLabel and accessibilityRole, (2) stateful elements have accessibilityState, (3) no fontSize below 12, (4) no hardcoded hex colors. Do not create separate accessibility issues — embed a11y into the definition of done for each feature.
**Tags**: accessibility, a11y, acceptance-criteria, quality, process, incremental, remediation, cross-project

### Documented Pitfalls Still Recur — Agents Must Read Learnings Before Implementation
**Source**: BLD-8 — 1RM Estimation & Progressive Overload (Phase 18)
**Date**: 2026-04-13
**Context**: PR #29 contained a hardcoded hex color (`#e0e0e0`) in a `StyleSheet` — the exact same mistake documented in `.learnings/pitfalls/theming.md` from BLD-9 and BLD-13. This is the THIRD occurrence. The tech lead review caught it, but the implementing agent clearly did not read the knowledge base before starting work.
**Learning**: Documenting pitfalls in `.learnings/` is necessary but not sufficient. Agents do not automatically consult the knowledge base before implementation. Without an explicit "read learnings" step in the implementation workflow, the same mistakes will recur regardless of how well they are documented.
**Action**: Every implementation issue spec should include a pre-implementation step: "Review `.learnings/INDEX.md` for relevant pitfalls before writing code." Reviewers should check whether a PR repeats any documented pitfall and flag it as a regression, not just a bug. Consider adding a checklist item to issue templates: "[ ] Reviewed `.learnings/pitfalls/` for relevant gotchas."
**Tags**: process, knowledge-base, learnings, recurrence, review-checklist, quality, cross-project
