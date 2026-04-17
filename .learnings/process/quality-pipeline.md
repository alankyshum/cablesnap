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

### Verify All Output Formats in Multi-Format Share/Export Flows
**Source**: BLD-72 — handleShare() only shares JSON, not human-readable text
**Date**: 2026-04-15
**Context**: Crash report feature wrote both .txt and .json files but the share handler only attached the .json file. The human-readable text format — the one users actually need — was generated but never shared. Caught post-merge by reviewer.
**Learning**: When code generates multiple output formats (text, JSON, CSV), it is common for only one format to be wired into the share/display/export flow. The unused format passes all tests because it is written correctly — it is just never delivered to the user. This is a silent omission bug.
**Action**: For any feature that produces multiple output formats, add a reviewer checklist item: "Verify each generated format is actually used in the share/display/export path." Write at least one test per format that asserts the format appears in the final output (e.g., share payload includes .txt attachment). Don't test just generation — test delivery.
**Tags**: code-review, share, export, multi-format, silent-bug, checklist, quality

### Four Plan Specification Gaps That Block Approval — Address Before Review
**Source**: BLD-181 — PLAN: Weekly Training Summary & Insights
**Date**: 2026-04-16
**Context**: Quality Director reviewed a detailed feature plan and found 4 blocking issues that required a full revision cycle before approval. All 4 fall into recurring categories of plan specification gaps that apply to any feature plan.
**Learning**: Feature plans consistently underspecify four categories: (1) **Conditional behavior when optional features are absent** — e.g., what happens when no active program exists; the UI must define both the "feature present" and "feature absent" states. (2) **Accessibility state for interactive components** — expandable cards, toggles, and navigation must specify `accessibilityState`, `accessibilityHint`, and reduced-motion behavior. (3) **Temporal boundary edge cases** — in-progress periods (current week, current day) must define whether they are included or excluded from aggregations like streaks. (4) **Precise threshold definitions** — terms like "on target" must be defined with exact criteria (e.g., calories within ±10%) and named constants, not left to implementer interpretation.
**Action**: Before submitting a plan for review, verify it addresses all four categories: conditional absent-feature behavior, a11y state specs for interactive elements, in-progress period handling for temporal data, and exact threshold/constant definitions. This prevents a revision cycle and accelerates plan approval.
**Tags**: planning, plan-review, specification, quality-director, edge-cases, accessibility, thresholds, process, cross-project

### Conditional Algorithm Specs Require Branch-by-Branch Implementation Verification
**Source**: BLD-182 — Weekly Training Summary & Insights
**Date**: 2026-04-16
**Context**: The approved plan specified body weight display as: "movingAvg() for ≥3 entries, raw for <3 entries." The implementation returned raw first/last entries for ALL cases, ignoring the ≥3 branch. The UI label displayed "(3-day rolling avg)" regardless, creating a label-data mismatch where the display described a computation that was not performed.
**Learning**: When a plan specifies conditional behavior (do X when condition A, do Y when condition B), implementations tend to implement one branch and apply it universally. The missing branch is easy to overlook because the code "works" — it just produces subtly wrong results. The bug is doubly hidden when the UI label describes the intended algorithm rather than the actual one: users and reviewers see the label and assume correctness.
**Action**: For each conditional algorithm in the plan (if/else, threshold-based, count-based), verify that BOTH branches are implemented in the code. During review, search for the condition check (e.g., `entries.length >= 3`) — if the condition doesn't appear in the code, one branch is missing. Add test cases that exercise each branch explicitly: one test for the ≥3 case verifying smoothed output, another for the <3 case verifying raw output.
**Tags**: implementation-fidelity, conditional-logic, plan-spec, code-review, label-data-mismatch, algorithm, verification, testing

### External API Integration Plans Require Three Data Integrity Specifications
**Source**: BLD-247 — PLAN: Online Food Search — Open Food Facts Integration (Phase 41)
**Date**: 2026-04-17
**Context**: A plan to integrate Open Food Facts API was rejected by Quality Director in Round 1 with 3 Critical data integrity gaps. The plan described the API and UI flow but left ambiguous how external data would be normalized, validated, and deduplicated when stored locally.
**Learning**: External API integrations consistently underspecify three data integrity categories: (1) **Unit conversion rules** — when the API uses different units than the app (e.g., per-100g vs per-serving), the plan must define which to display, the conversion formula, the storage format, and the multiplier behavior. (2) **Input validation for untrusted data** — crowd-sourced or third-party data needs explicit sanity bounds (e.g., kcal ≤ 2000/100g), NaN/Infinity rejection, and required-field rules. Products with all zeros may be valid (water). (3) **Deduplication strategy** — when external records map to internal records, define the match criteria (e.g., name + macros) and whether to create or reuse existing entries.
**Action**: Before submitting any plan that integrates an external API, explicitly address: unit conversion (formula + storage + display), input validation (bounds + rejection rules + edge cases like all-zeros), and deduplication (match criteria + create-vs-reuse). These three categories accounted for all 3 Critical issues found during plan review of the Open Food Facts integration.
**Tags**: planning, plan-review, external-api, data-integrity, validation, unit-conversion, deduplication, specification, quality-director, cross-project

### Feature Plans Must Include an Existing Code Inventory to Prevent Scope Duplication
**Source**: BLD-260 — PLAN: Phase 43 — 1RM Trend Chart, Session Annotations & Plate Calc Deep Link
**Date**: 2026-04-17
**Context**: A Phase 43 plan proposed building 1RM calculation, plate calculator features, and percentage tables. Quality Director found ~80% of the proposed scope already existed in the codebase (`lib/rm.ts`, `app/tools/plates.tsx`, `app/tools/rm.tsx`, `app/exercise/[id].tsx`). Tech Lead confirmed the duplication. The plan required 3 revision cycles before approval, with scope shrinking from "build from scratch" to "3 small incremental enhancements."
**Learning**: Plans that skip upfront codebase auditing consistently propose building features that already exist, wasting reviewer cycles on scope negotiation. The corrective pattern is an explicit "Existing Code Inventory" table listing every relevant component, its file location, and its completion status. This table forces the plan author to audit the codebase BEFORE proposing new work and makes reviewers' job trivial — they verify the inventory, then check that proposed work doesn't overlap.
**Action**: Before writing any feature plan, grep the codebase for related functionality and create an "Existing Code Inventory" table with columns: Component | Location | Status. List every file, function, and UI element related to the feature area. Only THEN define the proposed scope as the delta between what exists and what's needed. This prevents the ~80% scope duplication pattern and eliminates multi-round revision cycles.
**Tags**: planning, plan-review, scope-duplication, code-inventory, codebase-audit, specification, quality-director, cross-project
