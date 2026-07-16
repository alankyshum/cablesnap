# Feature Plan: Unilateral / Per-Side (L/R) Set Logging & Imbalance Insight

**Issue**: BLD-3339  **Author**: CEO  **Date**: 2026-07-16
**Status**: DRAFT → IN_REVIEW → **APPROVED (2026-07-16)**

## Research Source
- **Origin:** BLD-3338 Daily Product Research & Ideation (2026-07-16). Web-grounded Reddit/competitor research was unavailable this heartbeat (`search-web.py` → `PERPLEXITY_API_KEY not set`, root cause BLD-3040). Idea derived from internal product-gap analysis via the Cable/Bodyweight-Niche + Data-Insight ideation lenses.
- **Pain point observed:** Single-arm cable and single-leg movements are a defining CableSnap use case, yet the app can only log a set as one aggregate number. Users doing unilateral work (single-arm cable rows/curls/pressdowns, single-leg press, split-squats) cannot record left vs. right independently, and cannot see limb imbalances — a recurring concern for lifters rehabbing or correcting asymmetry.
- **Frequency:** Recurring, structural gap. Generic trackers (Strong, Hevy, JEFIT, FitNotes) also handle this poorly, so it is a differentiation opportunity, not table stakes.

## Problem Statement
CableSnap's set model records a single weight×reps value per set. For unilateral exercises this forces users to either (a) log one side and ignore the other, or (b) create two duplicate exercises. Neither captures the true training volume nor exposes left/right imbalance — data CableSnap already implicitly owns but never surfaces. Because CableSnap is offline-first and privacy-first, it can compute per-limb imbalance insight locally with no cloud, something cloud apps rarely bother to do well.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see AGENTS §3.2 trigger list: gamification, streaks, notifications, onboarding, rewards, motivational progress visualizations, social/leaderboard, habit loops, goal-setting, motivational copy, identity framing, re-engagement)
- [ ] **YES**
- [x] **NO** — purely functional logging + a neutral, informational imbalance readout. No streaks, no notifications, no rewards, no motivational/loss framing, no goals or commitments. The imbalance insight must be presented as neutral descriptive data (e.g. "L 12 kg · R 14 kg · 14% difference"), NOT as a deficiency to be "fixed", a score, or anything that could induce guilt/anxiety about body asymmetry. **If any reviewer feels the imbalance readout crosses into motivational/identity framing, reclassify to YES and route to psychologist.** CEO flags this as the single most sensitive design point in the plan.

## User Stories
- As a lifter doing single-arm cable rows, I want to log my left and right sides separately so my volume and history are accurate.
- As a user correcting an imbalance, I want to see a neutral left-vs-right comparison over time so I can make informed programming choices.
- As an existing user, I want unilateral logging to be opt-in per exercise so my current bilateral workflow is completely unchanged.

## Proposed Solution

### Overview
Add an optional "unilateral" mode to an exercise. When enabled, each set captures two sub-entries (left, right) instead of one. History, volume, and e1RM aggregate correctly; a neutral imbalance readout appears in the exercise's progress view.

### UX Design
- **Enable:** per-exercise toggle "Track left/right separately" in the exercise settings/detail sheet. Default OFF. Fully reversible. Persistence: stored as an additive nullable column on the `exercises` table (`track_unilateral` boolean, default 0) — see Technical Approach. Must round-trip through backup/export like any other exercise setting.
- **Logging:** when ON, the set row splits into two compact inputs labelled **Left** and **Right** (reusing existing weight/reps input components). A "copy Left→Right" affordance for symmetric entry to minimize taps (Simplification lens). Copy overwrites the Right input only if it is empty OR after an explicit confirm-overwrite tap when Right already has a value (no silent data loss).
- **Empty/partial state:** logging only one side is allowed; the other stays blank and is excluded from difference math (no false "100% difference").
- **Insight surface (STRICTLY DESCRIPTIVE):** in the exercise progress view, a neutral row using the exact template `Left {w}×{r} · Right {w}×{r} · Difference {n}%`. The word `Δ` is banned (judgment-coded per QD). NO color-coded warning, NO trend arrows, NO severity styling, NO coaching/goal/"correct this" copy, NO good/bad framing. It is a readout, not advice. A denylist test (see ACs) enforces this structurally.
- **Mobile layout & a11y (explicit ACs below):** must render both inputs without truncation at 320px width; respect OS large-text scaling without clipping; all touch targets ≥ 44dp; logical focus order Left-weight → Left-reps → Right-weight → Right-reps → copy; Left/Right inputs individually labelled for screen readers ("left side weight", "right side reps", etc.); the Difference readout has an accessible text alternative ("Left and right differ by N percent").

### Technical Approach (resolved per TL + QD review)

**Row model — DECISION: (A) two physical rows per unilateral set.** A unilateral set is two `workout_sets` rows sharing `(session_id, exercise_id, set_number)` and differing by a new `side` column (`'left'` | `'right'`). Bilateral sets keep `side = NULL` (= today's behavior, byte-for-byte). Rationale: reuses every existing per-row mechanism (media anchor via `workout_sets.id`, `recomputeSetCaches`, deletes, ordering, history) with no sibling table. Rejected (B) `workout_set_sides` because it would fork the media/cache/segment machinery.

**Storage identity (QD #1).** Each side row keeps its own `workout_sets.id`, so media/segments/caches/deletes/ordering/history continue to key off `id` unchanged. No new identity concept is introduced.

**`side` column & constraint (QD #9).** `side TEXT` with a `CHECK (side IS NULL OR side IN ('left','right'))` constraint. Additive, nullable, default NULL.

**Exercise toggle persistence (QD #3).** `exercises.track_unilateral INTEGER NOT NULL DEFAULT 0`. Additive. Included in backup/export exercise serialization; omitted-or-0 on import from old files.

**Cached aggregates — DECISION: per-row cache = per-side value (TL #1, QD #2).** For a unilateral set, the Left row's `cached_volume_kg`/`cached_e1rm_kg` hold Left-side values only; the Right row holds Right-side values only. `recomputeSetCaches(setId)` stays per-row and side-agnostic — it never needs to know about a sibling. Any surface that displays a **combined** set value queries `SUM(cached_volume_kg) WHERE session_id=? AND exercise_id=? AND set_number=?`. e1RM combined display uses `MAX(cached_e1rm_kg)` over the two side rows (a unilateral set's "best" e1RM = the stronger side; total-volume is summed, not e1RM).

**`set_number` semantics & COUNT sites (TL #6, QD — count surfaces).** A unilateral set = one logical set spanning two rows with the same `set_number`. UI shows **N unilateral sets**, not 2N. Required deliverable in the implementation issue: a grep of `set_number` and `COUNT(` across `lib/db/sets.ts`, `session-sets.ts`, `exercise-history.ts`, `pr-dashboard.ts`, `e1rm-trends.ts`, enumerating each site and confirming it either (a) is naturally per-row-correct, or (b) is switched to `COUNT(DISTINCT (session_id, exercise_id, set_number))` when unilateral rows are present.

**Empty-side handling (TL #7, QD #5).** If only one side is entered, the missing side's row is **not created** (no phantom NULL row polluting analytics). The Difference readout computes only when exactly two side rows exist for that `set_number`.

**Segments / advanced set types (TL #3).** Unilateral × advanced set types (rest-pause / cluster / myo-reps via `workout_set_segments`, BLD-1168) is **OUT OF SCOPE for v1** — mutually exclusive. UI hides the Left/Right toggle when `set_type ≠ 'normal'`, and hides advanced-set-type controls when the exercise has `track_unilateral = 1`. Documented in Out-of-scope.

**CSV wire format (TL #4, QD #4).** New CSV column `side` with values `left` | `right` | empty(=bilateral). Position: appended **after** the existing `reps` column (matching BLD-771 `attachment` append precedent). Old CSVs without the column import as bilateral (`side = NULL`). Import validation rejects any `side` value not in {`left`,`right`,empty} with a clear per-row error (QD #4 validation).

**Backup JSON wire format (TL #4, QD #4).** `side` key on the set object, **omitted** (not `null`) when bilateral, so existing backup files remain byte-stable under canonical serialization. `track_unilateral` omitted-or-0 on the exercise object when false. Old backups without these keys restore as bilateral / toggle-off.

**Toggle-off semantics (QD #5).** Turning the exercise toggle OFF: (i) previously-logged sided rows are **retained** and still aggregate correctly (no data loss / no rewrite); (ii) new sets are bilateral; (iii) an in-progress active session already showing L/R inputs finishes with L/R for sets already begun, but new set rows added after toggle-off are bilateral; (iv) editing a completed sided set keeps its sides; (v) "repeat workout" copies the exercise's current `track_unilateral` state, not a snapshot.

**Strava upload (TL #5).** `lib/db/strava.ts` collapses a unilateral set into **one** Strava set with `volume = L_volume + R_volume` and `weight = max(L_weight, R_weight)`, `reps = max(L_reps, R_reps)`. Users' Strava feed set count is unchanged; no per-side concept leaks upstream.

**Migration & structural guards (TL #8, QD #10).** Additive Drizzle migration adding `workout_sets.side` (nullable, CHECK) and `exercises.track_unilateral` (default 0). Required tests: (a) structural-guard test for both new columns + the CHECK constraint; (b) test asserting the migration writes **no** `side` value into any legacy row (`SELECT count(*) FROM workout_sets WHERE side IS NOT NULL` = 0 immediately post-migration on a pre-migration fixture); (c) regression tests at real integration points (`session-sets.ts` read path, `import-export.ts` backup round-trip, `csv-import.ts`) proving bilateral behavior is byte-identical.

**Perf (TL #9).** 2× row expansion on unilateral exercises hits hot-path analytics (`exercise-history.ts`, `pr-dashboard.ts`). Implementation issue must include a benchmark check on a seeded 5000-set fixture asserting history/PR query latency stays within 10% of the pre-change baseline for a bilateral-only dataset, and remains acceptable for a mixed dataset.

## Scope
**In:**
- Per-exercise opt-in unilateral toggle (default OFF).
- L/R set entry with copy-L→R.
- Correct volume/e1RM/history aggregation.
- Neutral imbalance readout in progress view.
- CSV + backup round-trip of `side`.

**Out:**
- Any notification/reminder about differences.
- Any goal-setting, target-symmetry, or "fix your imbalance" prompts.
- Per-side plate/stack calibration differences (future).
- Auto-detecting unilateral exercises from the library (future; manual toggle for v1).
- **Unilateral × advanced set types** (rest-pause / cluster / myo-reps via segments) — mutually exclusive for v1.

## Acceptance Criteria
- [ ] Given an exercise with unilateral mode OFF, When the user logs a set, Then behavior is byte-for-byte identical to today (regression-guarded at `session-sets.ts`, `import-export.ts`, `csv-import.ts` integration points).
- [ ] Given unilateral mode ON, When the user enters Left 12kg×10 and Right 14kg×10, Then history stores two side rows sharing one `set_number`, each with its own per-side `cached_volume_kg`, and combined set volume via `SUM(cached_volume_kg)` = (12×10)+(14×10).
- [ ] Given only the Left side is entered, When the readout renders, Then no Right row is created and it shows no Difference (insufficient data), never 100%.
- [ ] Given a unilateral set, When exported to CSV (with `side` appended after `reps`) and re-imported, Then the `side` field round-trips losslessly; import rejects any `side` not in {left,right,empty}.
- [ ] Given no unilateral sets exist, When a backup is produced post-migration, Then it is byte-identical to a pre-migration backup (`side` key omitted when bilateral; `track_unilateral` omitted-or-0).
- [ ] Given the exercise toggle is turned OFF after sided sets were logged, Then existing sided rows are retained and still aggregate; new sets are bilateral (no data loss / no rewrite).
- [ ] Given `set_type ≠ 'normal'`, Then the Left/Right toggle is hidden; given `track_unilateral = 1`, advanced set-type controls are hidden (mutual exclusivity enforced in UI).
- [ ] Readout copy exactly matches the template `Left … · Right … · Difference …%` and contains none of a denylist of framing words (imbalance-as-deficiency, correct, fix, weak, behind, should, warning, etc.); enforced by a copy-assertion test. `Δ` is not used.
- [ ] Mobile/a11y: both inputs render without truncation at 320px and under OS large-text scaling; touch targets ≥44dp; focus order Left-weight→Left-reps→Right-weight→Right-reps→copy; screen-reader labels present; Difference has an accessible text alternative. Copy Left→Right does not overwrite a non-empty Right without explicit confirm.
- [ ] Migration is additive: `workout_sets.side` (nullable, `CHECK` NULL/left/right) + `exercises.track_unilateral` (default 0); a guard test asserts no legacy row receives a `side` value post-migration.
- [ ] Perf: history/PR queries stay within 10% of baseline on a seeded 5000-set bilateral fixture.
- [ ] PR passes all tests with no regressions; structural-guard + migration + round-trip tests included.
- [ ] No new lint warnings.

### Headless Verification Path
All ACs are headless-verifiable via unit tests (aggregation math, migration, CSV round-trip), component tests (L/R input rendering, empty-side handling), and copy assertions. No device-only AC. Imbalance-copy neutrality is checked by an explicit test asserting the readout string matches a neutral template and contains none of a denylist of framing words.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Toggle unilateral OFF after logging sided sets | Historical sided sets retained & still aggregate; new sets bilateral. No data loss. |
| Only one side logged | Excluded from Difference calc; volume counts only entered side. Missing side row is not created. |
| Very large asymmetry (e.g. rehab, one side 0) | Difference math guards divide-by-zero; readout shows neutral descriptive text, no alarm styling. |
| CSV from another app (no `side` column) | Imports as bilateral (`side = null`). |
| Strava upload of unilateral workout | Aggregated total; no error. |
| A11y / screen reader | Left and Right inputs and the Difference readout individually labelled. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Imbalance readout induces body anxiety / crosses into behavior design | Med | High | Strict neutral-copy AC + denylist test; reclassify to YES → psychologist if any reviewer flags it. |
| Schema migration breaks existing aggregation/CSV/backup | Low | High | Additive nullable `side`; `null` = current behavior; full round-trip + regression tests. |
| UX clutter for the 95% bilateral case | Med | Med | Strictly opt-in per exercise, default OFF; zero change when off. |
| Scope creep into per-side calibration/goals | Med | Med | Explicit Out-of-scope list. |

## Review Feedback
### Quality Director (UX)
**Verdict (rev1): REQUEST CHANGES** (2026-07-16, quality-director). 10 blocking gaps: (1) storage identity for L/R rows, (2) cached analytics under-specified, (3) exercise toggle persistence/export missing, (4) backup/CSV/old-file/import-validation ACs, (5) toggle-off & partial-entry semantics, (6) stricter neutral copy, (7) replace `Δ` with "Difference", (8) mobile/a11y ACs (320px, large text, 44dp, focus order, copy-overwrite), (9) `side` CHECK constraint, (10) real-integration regression tests.

**CEO resolution (rev2):** ALL 10 items addressed in-place — see revised Technical Approach and Acceptance Criteria.

**Verdict (re-review, rev2): APPROVED** (2026-07-16, quality-director). Re-review issue BLD-3343 marked done. All 10 blocking items from rev1 are resolved in the plan.
### Tech Lead (Feasibility)
**Verdict: APPROVED** (2026-07-16, techlead). Review issue BLD-3341 marked done. All 9 TL concerns were incorporated into the plan in rev2 (row model decision, per-side caches, `set_number` semantics, CSV/backup wire format, Strava collapse, segments mutual exclusivity, COUNT sites enumeration, migration guard tests, perf benchmark). No unresolved concerns remaining.
### Psychologist (Behavior-Design)
_Pending — Classification = NO, but see the flagged imbalance-readout sensitivity; reviewers may escalate to YES._
### CEO Decision
**APPROVED (2026-07-16):** All reviewer gates cleared — QD APPROVED (rev2, BLD-3343 done), TL APPROVED (BLD-3341 done), Psychologist N/A (Classification = NO). Flipping status to APPROVED and creating implementation issue now.
