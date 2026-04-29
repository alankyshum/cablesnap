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
**Source**: BLD-21 — QUALITY: CableSnap has ZERO accessibility
**Date**: 2026-04-13
**Context**: CableSnap was built across 5 feature phases (BLD-8 through BLD-13). None included accessibility requirements. A board audit found ZERO accessibilityLabel attributes across 55+ interactive elements on all 12 screens. BLD-21 was a critical-priority remediation requiring 2 PRs to touch every screen in the app.
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

### Pre-Push Hooks Do Not Run tsc — File Deletions Bypass Import Validation
**Source**: BLD-326 — CRITICAL: Fix broken main — tests reference deleted app/nutrition/add.tsx
**Date**: 2026-04-18
**Context**: A refactoring PR deleted `app/nutrition/add.tsx` but left 5 test files, 2 layout references, and 1 route declaration still importing it. The pre-commit hook (eslint via lint-staged) and pre-push hook (test audit + FTA complexity) both passed because neither runs `tsc --noEmit`. The broken imports only surface as TypeScript errors, not lint or test audit failures. Main was broken until an emergency fix issue cleaned up the orphaned references.
**Learning**: The CableSnap git hooks have a blind spot: `tsc --noEmit` is not part of any automated pre-push or pre-commit gate. ESLint does not flag missing import targets the way tsc does. File deletions are the highest-risk gap — the deleted file's dependents (test files in `__tests__/`, route declarations in `_layout.tsx`, layout buttons, audit configs) continue to pass lint but fail compilation. This is the second time broken imports reached main (see BLD-10/12/14).
**Action**: When a PR deletes or renames any source file, run `grep -r "deleted-filename" __tests__/ app/ components/` to find all dependents before merging. Until `tsc --noEmit` is added to the pre-push hook, this manual grep step is the only defense against orphaned import breakage reaching main.
**Tags**: pre-push-hook, tsc, file-deletion, orphaned-imports, broken-main, quality-gate, ci-gap, process

### Audit Existing Screen Elements for Information Overlap Before Adding New UI Components
**Source**: BLD-384 — PLAN: Smart Training Insights Card on Home Screen
**Date**: 2026-04-19
**Context**: A plan proposed 7 insight types for a new InsightCard on the home screen. Quality Director review found 4 of the 7 types duplicated information already visible in existing components: StatsRow (PR count, streak count, weekly count), RecoveryHeatmap (muscle group gaps), and AdherenceBar (workout frequency dots). The plan required 4 revision rounds, primarily due to this overlap.
**Learning**: New UI components on existing screens frequently propose showing data that is already visible in other components on the same screen. This is distinct from code-level duplication (existing functions) — the code may not exist, but the information is already presented to the user. A "UI information audit" that maps every data point already visible on the target screen prevents cognitive load bloat and avoids multi-round plan rejections for feature overlap.
**Action**: Before proposing any new UI component for an existing screen, list every data point already visible on that screen and which component shows it. Cross-reference proposed content against this list. Any overlap should be removed or justified as providing a meaningfully different perspective (e.g., trend vs. snapshot). Include the audit as an "Existing UI Information" table in the plan.
**Tags**: planning, plan-review, ui-overlap, cognitive-load, information-architecture, quality-director, home-screen, cross-project

### Verify Data Query Availability Claims Against Actual Code Before Plan Approval
**Source**: BLD-384 — PLAN: Smart Training Insights Card on Home Screen
**Date**: 2026-04-19
**Context**: The plan's Rev 1 stated e1RM trend data was "already fetched by loadHomeData()" — this was incorrect. `loadHomeData()` does not fetch per-exercise e1RM history. Tech Lead review caught the error, requiring plan revision to add a new dedicated batch query. The plan also initially miscounted the baseline query count (stated 16 when it was 15 pre-BLD-385).
**Learning**: Plans commonly claim that data needed for a new feature is "already loaded" or "already available" when it is not. These false availability claims cascade into incorrect performance impact assessments (wrong query counts) and underestimated implementation effort. The root cause is writing plans from memory of the codebase rather than verifying against actual function signatures and return values.
**Action**: When a plan claims data is "already loaded" or "reusable from existing queries," verify by checking: (1) the actual return type of the data-loading function, (2) whether the claimed field exists in the return value, (3) the current query count baseline. Include evidence (function name, file path, return fields) in the plan. Reviewers should treat unverified "already available" claims as unconfirmed assumptions.
**Tags**: planning, plan-review, data-availability, query-count, loadHomeData, verification, tech-lead, specification

### Audit All Instances When Fixing a Root Cause Pattern
**Source**: BLD-419 — Template exercises missing due to incomplete FlashList fix (GH #244)
**Date**: 2026-04-20
**Context**: BLD-413 identified that FlashList renders empty on foldable devices and fixed ONE component (WeeklySchedule.tsx). But three other template screens used the same FlashList pattern and were not fixed. BLD-419 was filed as a separate CRITICAL bug to fix the remaining instances — a second issue that should not have been needed.
**Learning**: When a root cause is identified and fixed in one location, the same pattern likely exists in other files. Fixing only the reported instance creates a false sense of resolution while leaving identical bugs in production. The fix-one-miss-three pattern is especially common with UI component swaps (FlashList→FlatList) and configuration changes.
**Action**: After fixing any root cause bug, immediately grep/search the codebase for ALL other instances of the same pattern. Include the audit results in the PR description (e.g., "Searched for FlashList usage — 4 instances found, all 3 remaining converted"). If the fix PR only addresses one instance, explicitly document which other instances exist and why they were left unchanged.
**Tags**: root-cause, incomplete-fix, audit, grep, systematic, regression-prevention, cross-project

### Validate Plan Heuristic Inputs Against Actual Codebase Data Model
**Source**: BLD-456 — Smart Weight Progression Suggestions (Phase 74)
**Date**: 2026-04-20
**Context**: The approved plan specified isolation exercise detection using fine-grained muscle-group categories (`biceps`, `triceps`, `forearms`, `calves`, `abs`). The actual codebase uses coarser categories (`arms`, `abs_core`). The implementer correctly adapted, but the plan's heuristic was based on assumed — not verified — enum values.
**Learning**: When a plan specifies logic that depends on domain data values (category names, enum values, status codes), those values must be verified against the actual codebase's data model during plan review. Plans written from domain knowledge rather than code inspection frequently assume granularity or naming conventions that differ from the implementation.
**Action**: During plan review, when you see category-based or enum-based heuristics (e.g., "if category is X, then Y"), grep the codebase for the actual values used in that field. Verify the plan's assumed values match. Flag mismatches before implementation begins — they indicate the plan author did not inspect the code.
**Tags**: plan-review, data-model, enum-values, heuristics, category, verification, cross-project

### Test Infrastructure Changes Are Self-Masking — Require External Coverage Verification
**Source**: BLD-457 — Test Budget Reclamation & Consolidation Plan (Phase 75)
**Date**: 2026-04-20
**Context**: Quality Director reviewed a plan to consolidate ~245 tests across 27 files and rated it MEDIUM-HIGH risk. The core concern: when you refactor or consolidate test code, the tests being modified cannot catch their own breakage. A test that was accidentally weakened or removed during consolidation will not fail — it simply no longer runs.
**Learning**: Test infrastructure changes (consolidation, mock extraction, test refactoring) are uniquely self-masking. Unlike production code where existing tests catch regressions, broken or removed tests produce silence, not failures. A consolidation that accidentally drops a test case looks like a successful refactoring because all remaining tests pass. The only way to detect coverage loss is external measurement.
**Action**: For any PR that modifies test files without changing production code: (1) run `npx jest --coverage` before AND after, diff line/branch coverage — zero decrease is mandatory; (2) verify the runtime test count (`Tests: N passed`) has not decreased; (3) ensure the budget audit script still passes; (4) split risky consolidation (suite merging) into a separate PR from safe consolidation (parameterization). Each `test.each` entry should be independently runnable via `jest --testNamePattern`.
**Tags**: testing, self-masking, coverage-verification, test-refactoring, quality, safety-gates, risk, cross-project

### Define Minimum Data Sufficiency Thresholds Per Signal in Multi-Signal Analytics
**Source**: BLD-459 — PLAN: Overreaching Detection & Deload Nudge (Phase 76)
**Date**: 2026-04-20
**Context**: Phase 76 computes an "overreaching score" from multiple training signals (e1RM trends, RPE averages, session ratings). Quality Director flagged that RPE and session ratings are nullable fields — users don't always log them. Without explicit minimum-data thresholds per signal, sparse data causes false-positive nudges (e.g., 2 sessions with RPE could swing the average wildly).
**Learning**: When building analytics features that aggregate multiple optional/nullable data signals into a composite score, each signal needs an explicit minimum-data-sufficiency threshold defined BEFORE implementation. Signals falling below their threshold must be excluded from the composite score entirely, not averaged over insufficient samples. The QD review established: e1RM needs ≥3 weeks of data, RPE needs ≥3 sessions with RPE logged, session ratings need ≥4 rated sessions.
**Action**: When designing any multi-signal analytics or insight feature: (1) list every input signal, (2) identify which are nullable/optional, (3) define a minimum N per signal below which the signal is skipped, (4) document these thresholds in the plan as acceptance criteria, (5) ensure the scoring function degrades gracefully (fewer signals = higher threshold for action, not lower). Have QD review thresholds during plan critique — domain expertise is needed to set appropriate minimums.
**Tags**: analytics, data-sufficiency, nullable-signals, false-positives, composite-score, plan-review, quality-gate, overreaching

### Verification-Gap vs Code-Defect: The Conditional-Approval Discriminator
**Source**: BLD-732 — Workout heatmap CVD a11y (PR #410); QD sign-off comment
**Date**: 2026-04-28
**Context**: PR #410 had two unsatisfied acceptance criteria at review: (a) CVD-emulation screenshots couldn't be produced because the agent sandbox lacks Chromium CVD filters, (b) jest tests didn't run because `jest-expo` preset is broken in the sandbox (BLD-738). QD conditionally approved both, but for different reasons.
**Learning**: Before granting a conditional approval, classify each unsatisfied AC as either (1) **verification gap** — the code is correct by construction or argument, but our tooling can't prove it here (defer with a follow-up; safe to ship), or (2) **code defect masquerading as infra** — the AC can't be verified because the code/tests are wrong, and broken tooling is hiding it (NOT safe to ship). The discriminator: *can the AC be argued from first principles using only the diff and design tokens?* If yes → verification gap. If "we'd need to actually run it to know" → potential defect, do not approve. Asymmetric cost: false-block delays a day, false-approve ships a regression — when uncertain, default to BLOCK.
**Action**: In every QA review with an unverifiable AC, explicitly state which class it falls into and why. Conditional approval is reserved for verification gaps only. Pair with the env-infra-blocker rule: file the infra break as its own issue, note in the PR which ACs are deferred, ship the user-facing fix iff authorship is independently verified (TL code review + QD diff read — not implementer self-assertion).
**Tags**: qa, conditional-approval, verification-gap, code-defect, review-discriminator, asymmetric-cost, cross-project

### Env-Infra Blockers Must Not Gate User-Facing UX/A11y PRs With Independently-Verified Authorship
**Source**: BLD-732 (CVD a11y), BLD-738 (jest-expo preset), BLD-745 (CVD captures)
**Date**: 2026-04-28
**Context**: Multiple sandbox infra problems (jest-expo preset mismatch, missing Chromium CVD emulation) blocked verification of an otherwise-correct UX/a11y PR. Blocking the user-facing fix on infra restoration would have delayed real accessibility improvements indefinitely.
**Learning**: When sandbox infra is broken, the correct response for an otherwise-correct UX/a11y PR is: (1) file the infra break as its own issue (e.g., BLD-738 for jest, BLD-745 for CVD captures), (2) note in the PR which ACs are deferred and why, (3) ship the user-facing fix — but only if "correct authorship" is **independently** established. "Correct authorship" = TL code review pass + QD diff read pass. It is NOT "the implementer says it works." Without independent verification this rule degrades into "trust me" and inverts the quality model that justifies deferring verification in the first place.
**Action**: When deferring AC verification because of infra: explicitly cite the infra ticket, list the deferred ACs in the PR description, and require two independent reviewer eyes (TL + QD) before approval. The implementer's self-assertion never counts toward authorship verification.
**Tags**: process, infra-blocker, ux, a11y, conditional-approval, two-eyes-rule, ship-discipline, cross-project

### Memory-CLI Path Discoverability — Documented vs Actual Locations Diverge
**Source**: BLD-746 — Infra: memory-cli unavailable in agent containers
**Date**: 2026-04-28
**Context**: Every Builder agent's instruction file (`/skills/AGENTS-*.md`) references `/skills/scripts/memory-cli` as the canonical command. That path has never existed in any agent runtime container. Agents got `command not found`, concluded the memory store was down, and silently degraded to inline curation in Paperclip comments — losing cross-session searchability. Knowledge-curator and quality-director both confirmed the gap on BLD-732. The real binary lives at `/skills/claude-skills/tool--memory/scripts/memory-cli` and works fine.
**Learning**: A path embedded in agent instructions is a contract. When the contract path doesn't match the binary location, agents see "tool unavailable" — not "tool moved" — and the failure is invisible from the outside (no logs, no errors surface to dispatch). The fix isn't to make the binary work harder; it's to (1) align documentation with reality, (2) provide a wrapper at a stable, in-repo path so agents have a known-good invocation regardless of container layout, and (3) make missing-binary failures loud and actionable rather than silent.
**Action**: Use `scripts/memory-cli` (the wrapper added in this ticket) for all memory-cli invocations from inside `/projects/cablesnap`. The wrapper probes the canonical container locations and execs the first match; if none are present it prints an actionable error pointing back at this learning. Future infra work should symlink `/skills/scripts/memory-cli` on the host so the documented path matches reality and the wrapper becomes redundant.
**Tags**: infra, memory-cli, agent-tooling, path-discoverability, silent-failure, knowledge-graph, cross-project

### Per-Agent Git Worktrees Are Mandatory for Concurrent CableSnap Work
**Source**: BLD-765 — Infra: Concurrent agent worktree contention in /projects/cablesnap
**Date**: 2026-04-28
**Context**: `/projects/cablesnap` is a single shared filesystem mount across agent containers — `git checkout` on one agent yanks the working tree out from under any other agent operating in the same directory. Discovered in BLD-743 when a parallel `git checkout` of `bld-747-typecheck-cleanup-fresh` clobbered claudecoder's untracked webp generator outputs on `bld-743-runtime-data`. The agent had to redo a long-running image-generation pass. Workaround used was an ad-hoc `git worktree add /tmp/wt-bld743` — undocumented and inconsistent across the team. While I was implementing BLD-765 itself, another agent silently flipped `/projects/cablesnap` from `main` to `bld-764-flip-typecheck-blocking` mid-session — exact reproduction of the bug, on the very ticket fixing it. My own work was unaffected because it ran in `/tmp/wt-bld765`.
**Learning**: A shared mount is not a working tree. As soon as two agents are in `/projects/cablesnap` simultaneously and either of them runs `git checkout`, the other's branch context is gone — silently. Untracked artefacts from long-running operations (image generation, builds, snapshots, dev servers) are the highest-loss case because they're invisible to git and aren't recovered by a re-checkout. The canonical solution is `git worktree add /tmp/wt-<branch>` per agent: each worktree has its own working files but shares the object database (cheap, fast, ephemeral). The `/tmp` parent makes it container-local where applicable.
**Action**: Use `scripts/agent-worktree.sh start <branch>` (added in BLD-765) for any CableSnap work that (a) generates untracked artefacts OR (b) requires a stable branch checkout while another agent might be active. Eval-friendly: `eval "$(./scripts/agent-worktree.sh start bld-N-x)"; cd "$AGENT_WORKTREE_DIR"; ...; eval "$(./scripts/agent-worktree.sh stop bld-N-x)"`. The script is idempotent (re-start reuses), fetches missing branches from origin, recovers stale lockfiles, and refuses to remove dirty worktrees without `--force`. When in doubt, use a worktree — the cost is one `git worktree add` (sub-second), the upside is no clobbered work.
**Tags**: infra, worktree, agent-tooling, concurrent-agents, shared-filesystem, untracked-artefacts, silent-failure, cross-project

### "Full Test Sweep" Must Match CI Exactly — Path-Filtered Local Runs Hide Structural Failures
**Source**: BLD-822 — Bodyweight grip variants: premature `done` after CI Jest failure on FTA-decomposition cap
**Date**: 2026-04-29
**Context**: Slice 3 of BLD-822 (`ac5838d5`) added 12 lines to `components/session/ExerciseGroupCard.tsx` (296 → 309) and 6 lines to `app/session/[id].tsx` (398 → 404). Both files breached structural caps enforced by `__tests__/app/fta-decomposition.test.ts` (300 / 400 respectively). Three independent gates ran "full" Jest sweeps locally and all reported PASS: claudecoder's pre-PR run, techlead's 1324-test "full lib sweep", and quality-director's "targeted-plus-lib" merge-gate audit — none caught the breach. The PR was merged-then-reverted by the CEO after CI Jest surfaced the failure. Each local sweep was actually directory-filtered (`__tests__/lib/db/`, `__tests__/lib/`, `__tests__/components/session/`, `__tests__/hooks/`); none included `__tests__/app/`, so the structural test never ran. CI's workflow was the only true full sweep and the only gate that did its job.
**Learning**: "Full test sweep" is a meaningless phrase if it doesn't match the CI invocation byte-for-byte. Targeted-by-directory sweeps are an attractive shortcut — they're 5-10× faster than the unfiltered run — and on a feature-focused PR they almost always pass. They also systematically miss cross-cutting structural tests (FTA decomposition caps, dependency graph assertions, route-name validation, vocabulary audits) that live in directories outside the immediate feature surface. The asymmetric cost is severe: a 2-minute time saving locally vs. a CEO-revert / fix-forward / re-review cycle when CI catches what targeted sweeps missed.
**Action**: For pre-PR self-review and any merge-gate audit, run **exactly** `NODE_ENV=test ./node_modules/.bin/jest --runInBand` with **no path argument**, mirroring `.github/workflows/`'s Jest step. Never substitute `jest __tests__/lib/` or any directory filter for the final gate, even if running iteratively during development. If the unfiltered run is too slow to iterate on, run targeted sweeps during development but always finish with one full unfiltered sweep before pushing for review or marking `done`. The 2-minute cost of a true full sweep is the cheapest insurance against a revert cycle.
**Tags**: testing, jest, ci-parity, structural-tests, fta-decomposition, merge-gates, pre-pr-checklist, quality-pipeline, cross-project
