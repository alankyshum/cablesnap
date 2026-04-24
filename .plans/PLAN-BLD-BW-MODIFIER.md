# Feature Plan: Bodyweight Load Modifier

**Issue**: BLD-539
**Author**: CEO
**Date**: 2026-04-24
**Status**: REVISION R2 — all QD R1 + techlead R1 blockers addressed (awaiting re-verdict)

## Problem Statement

Bodyweight exercises (pull-up, chin-up, dip, push-up, inverted row, pistol squat, L-sit, muscle-up) currently track **reps only**. The `workout_sets.weight` column is `null` for these exercises and rep-based PRs are the only progression signal.

Real-world strength athletes progress bodyweight lifts in two dimensions beyond reps:

1. **Added weight** — weighted belt, weighted vest, dumbbell between ankles. "Pull-up + 20kg × 5".
2. **Assistance reduction** — resistance band, assisted-dip/pull-up machine. "Band-assisted pull-up −25kg × 8" → "−15kg × 8" as strength grows.

Today the app hides both. Users cannot:
- Log that today's pull-up set was weighted +10kg
- Log that today's dip was band-assisted at −20kg
- See "my assisted-pull-up is down from −30kg band to −10kg band over 8 weeks" — one of the most motivating progression narratives in fitness.
- Get a correct 1RM estimate or e1RM for weighted calisthenics.

**User emotion today**: "I did a weighted pull-up with +15kg, but the app just says 5 reps. My logbook can't tell the difference between bodyweight and weighted."

**User emotion after**: "I can see my pull-up went from BW×5 → BW+5kg×5 → BW+15kg×5. That's real progress I can feel."

Hits three product goals simultaneously:
- **#3 Smart defaults** — remember last modifier per exercise, pre-fill automatically
- **#4 Cable + bodyweight first-class** — bodyweight progression finally has a weight axis
- **#6 Zero friction set logging** — compact chip, one tap to adjust

## Behavior-Design Classification (MANDATORY)

**Does this feature shape user behavior?**

- [ ] YES
- [x] **NO** — feature is purely a functional load-tracking affordance. It records an already-existing real-world variable (added/assisted weight). No gamification, no streaks, no notifications, no rewards, no motivational framing, no social. PR tracking changes are mechanical (effective-load computation), not reward-design. **Skip psychologist review.**

## User Stories

- As a lifter doing weighted pull-ups, I want to log "+20kg" so that my progression tracks the added load, not just reps.
- As a beginner using a resistance band for pull-ups, I want to log "−25kg band" so I can watch my assistance shrink over time.
- As a weighted-dip athlete, I want my PR dashboard to show "Dip BW+30kg × 5" instead of just "Dip × 5 reps".
- As any bodyweight lifter, I want the app to remember my last modifier per exercise so I don't re-enter it every set.

## Proposed Solution

### Overview

Add a dedicated column `workout_sets.bodyweight_modifier_kg REAL DEFAULT NULL` that stores a signed load modifier for bodyweight exercises. The existing `weight` column is **never repurposed** — its semantics (absolute load, kg) stay identical on all exercises.

**Authoritative bodyweight classifier** (locks per QD BLOCKER-R1 + techlead T-1): `exercise.equipment === 'bodyweight'`. This is the canonical, synchronous, row-local classifier already used in `hooks/useSessionData.ts:124` and `lib/rest.ts:61`. The history-derived classifier at `lib/db/exercise-history.ts:150` (`!(weighted?.val)`) is a separate legacy heuristic that disagrees with the canonical source on some legacy custom-exercise rows; retiring/reconciling it is a follow-up issue, explicitly out of scope here.

**Storage model** (on bodyweight exercises only — `exercise.equipment === 'bodyweight'`):

| `bodyweight_modifier_kg` | Semantic mode | UI chip |
|---|---|---|
| `NULL` | Pure bodyweight | "BW" |
| `> 0` | **Added** (belt/vest/DB) | "+15 kg" |
| `< 0` | **Assisted** (band/machine) | "Assist −20 kg" |

For non-bodyweight exercises the column is always `NULL` and has no UI affordance.

**Schema change required.** One additive column via the canonical 3-file pattern (see Technical Approach → Data layer). Decision rationale documented in "CEO Decision" section — the semantic-overload path was rejected because 6 production aggregate queries sum `weight * reps` without a bodyweight gate; overloading would silently corrupt session/weekly/monthly volume and achievement totals.

### UX Design

#### 1. Set row (session screen, `components/session/SetRow.tsx`)

For bodyweight exercises, the **`pickerCol` slot currently occupied by `WeightPicker` is swapped for a `BodyweightModifierChip`**. Row geometry (3 columns: set-type badge · picker · reps + check) is unchanged — one component swaps. `ExerciseGroupCard.tsx:107` column header changes from `KG`/`LB` → `LOAD` when `group.is_bodyweight === true` (which is derived at data-assembly time from `exercise.equipment === 'bodyweight'` at `hooks/useSessionData.ts:124` — the same classifier is threaded through everywhere in this plan).

```
Bodyweight row:   [ set# ] [ +15 kg ] [ 5 reps ] ✓   (header: SET | LOAD | REPS)
Weighted row:     [ set# ] [  60 kg ] [ 5 reps ] ✓   (header: SET | KG   | REPS)  ← unchanged
```

**Chip visual spec** (locks per UX REV-2/3/4):
- Outlined rounded-rect (not pill, not filled). `borderRadius: radii.md`, `borderWidth: 1`, `borderColor: colors.outline`, `backgroundColor: "transparent"`. Distinguishes from the circular set-type badge and the filled RPE chips.
- `minWidth: 84` (fits "Assist −37.5"), `minHeight: 44`, `hitSlop: 8` (effective 48dp). Do NOT raise chip visual height to 48 — would blow out row height.
- `fontVariant: ['tabular-nums']`, center-aligned text, to prevent reps column jitter on every keystroke.
- Unicode minus **U+2212** (`−`) in visual copy. Never ASCII `-`.

**Chip label rules** (locks per QD MAJOR-2 + UX REV-5):
- `null` → `BW`
- `> 0` → `+15 kg` (leading `+`, space before unit)
- `< 0` → `Assist −20 kg` (the word "Assist" is the disambiguator, not the minus sign alone)

**Bottom sheet** (`BodyweightModifierSheet`, aligned with `RestBreakdownSheet` pattern per UX REV-8 — NOT SetTypeSheet):
- Three-mode segmented control at top: **Bodyweight** / **Added weight** / **Assisted**. The user never types a negative number. "Assisted" flips the sign internally on save.
- Under Added/Assisted: numeric stepper (0.5 / 1 / 2.5 / 5 kg quick-taps) + keyboard input. Respects user's weight unit (kg/lb). Unit conversion via `lib/units.ts`.
- `Bodyweight` mode disables the stepper and persists `null` on Done.
- First-run helper microcopy under the mode control: *"Added = belt, vest, or weight held. Assisted = band or machine helping you."* (small caption, no tutorial).
- Long-press the chip = keyboard-equivalent shortcut to set mode back to Bodyweight. **Acceptance test must assert long-press does NOT fire the set-type sheet** (collision avoidance with `SetRow.tsx:92` existing `onLongPressSetType` and `:222` half-step on weight).
- Explicit "Bodyweight only" button remains inside the sheet for discoverability (long-press alone is not sufficient).

**Accessibility** (locks per UX REV-5):
- `accessibilityLabel="Added 15 kilograms"` / `"Assisted, 20 kilograms"` / `"Bodyweight, no modifier"`.
- Screen reader never hears "hyphen" or "minus sign"; the mode word carries the semantic.
- Bottom-sheet segmented control fully keyboard-navigable on web.

#### 2. Smart defaults

- When logging a new set for a bodyweight exercise, pre-fill modifier from the **most recent completed set of the same exercise in the last 90 days**. If none, default to `null` (BW only).
- Warmup sets (set_type=warmup) default to `null` regardless of history.
- Smart default query (SQLite syntax — locks per QD MAJOR-R1-B): `SELECT bodyweight_modifier_kg FROM workout_sets WHERE exercise_id = ? AND set_type != 'warmup' AND completed = 1 AND completed_at > strftime('%s', datetime('now','-90 days')) * 1000 ORDER BY completed_at DESC LIMIT 1`. `completed_at` is stored as unix-ms integer (`schema.ts:82`), hence the `strftime × 1000`; precedent: `lib/db/photos.ts:95` uses `datetime('now', ...)` for timestamp math. Index `idx_workout_sets_exercise` already covers this query (`lib/db/migrations.ts:6-13`).
- Cached via React Query key `['bw-modifier-default', exerciseId]` so rapid `+Set` taps reuse the cache (no per-tap requery). **Invalidated explicitly** via `queryClient.invalidateQueries({ queryKey: ['bw-modifier-default', exerciseId] })` in `hooks/useSessionActions.ts` at set-complete and at modifier-write — this is the native React Query invalidation, separate from the `mutationVersion`/`useFocusRefetch` gate (BLD-367 pattern), which is a focus-refetch counter, NOT a cache invalidator (per techlead T-3).
- Pre-filled chip renders at full opacity — no muted styling. Tappability IS the "editable" signifier (UX REV-9). No toast ("we remembered your last modifier") — noisy.

#### 3. Exercise detail page (`components/session/ExerciseDrawerStats.tsx`, `app/exercise/[id].tsx`)

- **Best set** — currently shows "5 reps" for bodyweight. Change to **prefix only when modifier is non-null**: `"+20 kg × 5"` (added) / `"Assist −15 kg × 5"` (assisted). When modifier IS null, keep today's `"5 reps"` copy — do NOT prepend "BW". Rule: the modifier text EARNS its screen real estate only when present. (UX REV-6.)
- **Last session** — same treatment.
- **Estimated 1RM** — when `is_bodyweight && bodyweight_modifier_kg IS NOT NULL && user_bodyweight_kg` is known, compute **effective load** = `user_bodyweight_kg + bodyweight_modifier_kg` (modifier may be negative). Floor at 0 (fully-deloaded assisted sets). Apply existing Epley formula. When `user_bodyweight_kg` is unknown, hide the e1RM line AND show a single-tap CTA "Set bodyweight → Profile" deep-link so the feature isn't a dead-end for new users (UX designer approved; QD nit). When the user has never logged a modifier on this exercise, the line is hidden (unchanged from today).

#### 4. PR Dashboard (`lib/db/pr-dashboard.ts`)

Today, bodyweight PRs = max-reps PRs. Extend:

- **Weighted bodyweight PR** — for a bodyweight exercise, the max non-null `bodyweight_modifier_kg` value (signed) at any rep count ≥ 1 is a PR. Track separately from rep PRs.
- PR delta formatting (UX REV-7 polish):
  - First-ever weighted set on a bodyweight exercise → `"First weighted: +N kg"` (not `"+BW+Nkg"` — avoids double-plus)
  - Assisted improvement (e.g., −30 → −15) → `"Assistance reduced by 15 kg"`
  - Added-weight PR (e.g., +10 → +15) → `"+5 kg"`
  - Sign-crossing (e.g., Assist −5 → Added +5) → `"From Assist −5 kg → Added +5 kg"` (the mode-label framing from UX prevents "+10" from reading as an arithmetic regression).
- PR celebration (`hooks/usePRCelebration.ts`) triggers on weighted bodyweight PRs using the same existing celebration. Rate-limited once per exercise per session (BLD-400 convention).

#### 5. CSV export / backup

- **CSV**: add a new column `bodyweight_modifier_kg` (signed number or empty). Round-trip-safe for external-tool importers (Hevy/Strong use a similar shape). Column header order: append at end for backward compat. Old CSVs re-imported: the column is missing → treated as null → no change.
- **JSON backup**: include the new column in the `workout_sets` payload. `lib/db/backup.ts` serializer must be updated; existing restore code should ignore unknown fields already (defensive).
- README: document the new column with a one-liner ("Signed load modifier on bodyweight exercises: positive = added weight, negative = assistance").

### Scope

**In Scope:**
- Additive column `workout_sets.bodyweight_modifier_kg REAL DEFAULT NULL` via 3-file pattern (tables.ts DDL + migrations.ts `addColumnIfMissing` + schema.ts drizzle def)
- SetRow column-swap (replace `WeightPicker` with `BodyweightModifierChip` in `pickerCol` for bodyweight exercises)
- `ExerciseGroupCard` column header: `LOAD` when `is_bodyweight`, `KG`/`LB` otherwise
- `BodyweightModifierSheet` with 3-mode segmented control (Bodyweight / Added / Assisted) + stepper, modeled on `RestBreakdownSheet` pattern
- Smart-default pre-fill from last completed set (React Query cached)
- ExerciseDrawerStats "best set" / "last session" displays with mode-labeled prefix only when modifier non-null
- Effective-load e1RM when bodyweight is known; "Set bodyweight → Profile" CTA when unknown
- PR dashboard: weighted bodyweight PR tracking + delta strings (new-dimension, reduction, crossing)
- PR celebration trigger for weighted bodyweight PRs (rate-limited)
- CSV export: append `bodyweight_modifier_kg` column; JSON backup: include the new field
- Playwright visual baselines: 5 states (BW, +5, +37.5, −25, BW-after-long-press) × 3 viewports (320/375/430dp) = 15 PNGs in `e2e/scenarios/bw-modifier.spec.ts` (per UX REV-11, BLD-535 pattern, masked MM:SS)
- Acceptance tests (Jest) for all data paths including long-press/set-type non-collision
- Historical-data audit query run and published in PR description before merge (see Risk below)

**Out of Scope:**
- Semantic overload of `weight` column (explicitly rejected — would silently corrupt 6 production volume/PR queries that don't gate on `is_bodyweight`: session-stats.ts:119, exercise-history.ts:44, achievements.ts:58/70, weekly-summary.ts:119/148, monthly-report.ts:119/148)
- Per-attachment tracking (rope vs bar — separate future feature)
- Template-level modifier plans (e.g., "plan a pull-up session with +10kg") — templates seed reps; modifier is logged per session
- Extending volume aggregates to include weighted-BW volume in session-stats/weekly/monthly — follow-up issue (volume for BW exercises remains 0 today; no regression, no new complexity)
- Importing/exporting from external apps that use different conventions

### Technical Approach

**Data layer** (`lib/db/`) — canonical 3-file additive-column pattern (BLD-461 precedent; no drizzle-kit migration generator exists in this project — verified `package.json` has no `db:generate` script and no `drizzle/` output dir):

1. **`lib/db/tables.ts`** — add `bodyweight_modifier_kg REAL DEFAULT NULL` to the `CREATE TABLE IF NOT EXISTS workout_sets` DDL (line 101-120 area) for fresh installs.
2. **`lib/db/migrations.ts`** — add `await addColumnIfMissing(database, "workout_sets", "bodyweight_modifier_kg", "REAL DEFAULT NULL");` to the `// workout_sets table` block (alongside existing `addColumnIfMissing` calls at lines 50–58). `addColumnIfMissing` is idempotent; safe on fresh and upgraded DBs.
3. **`lib/db/schema.ts`** — add `bodyweight_modifier_kg: real("bodyweight_modifier_kg"),` to the `workoutSets` sqliteTable definition (after line 90, before `}, (table) => [`) for drizzle type-safety.

**Type `REAL`** (matches existing `weight REAL`, `rpe REAL`). No `NUMERIC` anywhere.

**Defensive write invariant** (locks per techlead MAJOR T-2): introduce a new helper `updateSetBodyweightModifier(setId: string, modifierKg: number | null)` in `lib/db/session-sets.ts`. Implementation:
```ts
// SELECT e.equipment FROM exercises e JOIN workout_sets ws ON ws.exercise_id = e.id WHERE ws.id = ?
// if (equipment !== 'bodyweight' && modifierKg != null) throw new Error('bodyweight_modifier_kg only valid on bodyweight exercises')
// else: UPDATE workout_sets SET bodyweight_modifier_kg = ? WHERE id = ?
```
One extra SELECT per modifier write (fires only on sheet-close, not per keystroke — negligible). `updateSet(id, weight, reps, ...)` is **NOT** widened to accept the modifier; the invariant stays localized. SQLite CHECK constraints cannot express this cross-table rule without triggers (triggers are not used anywhere in this codebase — verified), so a follow-up CHECK is not viable. The previous Risk-table CHECK row is removed in R2.

- Add `lib/bodyweight.ts` helper module: `formatBodyweightLoad(modifierKg, unit)` → `"BW"` / `"+15 kg"` / `"Assist −20 kg"`, kg/lb conversion via `lib/units.ts`, U+2212 (`−`), `"Assist"` prefix for negative values. `resolveEffectiveLoad(modifierKg, userBodyweightKg)` → `max(0, userBodyweightKg + modifierKg)` or `null` when bodyweight unknown. **Normalizes `+0` / `−0` → `null`** at the helper boundary (belt-and-braces alongside the sheet-level normalization).
- Add `getLastBodyweightModifier(exerciseId)` query in `lib/db/session-sets.ts` with the SQLite 90-day window described in §2 above.
- Extend `lib/db/pr-dashboard.ts`:
  - `getWeightedBodyweightPRs()` — **ONE aggregate query** (not per-exercise; locks per techlead MAJOR T-1) mirroring `getAllTimeBests` (`pr-dashboard.ts:280-340`): a single `SELECT ... FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id WHERE e.equipment = 'bodyweight' AND ws.bodyweight_modifier_kg IS NOT NULL GROUP BY ws.exercise_id` returning `MAX(bodyweight_modifier_kg) AS best_added` and `MAX(bodyweight_modifier_kg) FILTER (WHERE bodyweight_modifier_kg < 0) AS best_assisted` (least-negative = best). Use `ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY bodyweight_modifier_kg DESC)` sub-join for the "best set" row if needed. No per-exercise loop; no N+1.
  - Merge rule with existing `getAllTimeBests` bodyweight branch: weighted-BW PR **augments** the existing bodyweight result row (same exercise stays in bodyweight section with modifier PR alongside its rep PR). Exercise does NOT move to the weighted section. Dedup via the existing `weightedIds` Set pattern (line 338-364).
- Extend `lib/db/exercise-history.ts` `LastSession` type with optional `bodyweight_modifier_kg: number | null`.
- **Historical-data audit before merge** (locks per QD MAJOR-1, fixed classifier per QD BLOCKER-R1 / techlead T-1): run in PR description
  ```sql
  SELECT COUNT(*) FROM workout_sets ws JOIN exercises e ON ws.exercise_id = e.id
  WHERE e.equipment = 'bodyweight' AND ws.weight IS NOT NULL AND ws.weight != 0;
  ```
  If N = 0 → document and proceed. If N > 0 → either null them in the migration or surface a one-shot "Review: N past bodyweight sets have weight data" toast with a deep-link; decision made in PR, not silent reinterpretation.

**UI layer** (`components/session/`, `app/exercise/`)
- `SetRow.tsx`: conditional render — when `is_bodyweight`, `pickerCol` renders `BodyweightModifierChip` instead of `WeightPicker`. Row geometry unchanged.
- New component: `components/session/BodyweightModifierChip.tsx` — outlined rounded-rect, `minWidth:84`, `minHeight:44`, `hitSlop:8`, `tabular-nums`. Uses `formatBodyweightLoad`.
- New component: `components/session/BodyweightModifierSheet.tsx` — mirrors `RestBreakdownSheet` architecture (NOT `SetTypeSheet`): 3-mode segmented control + stepper. First-run caption text.
- `ExerciseGroupCard.tsx`: column header `LOAD` vs `KG`/`LB` based on `group.is_bodyweight` (already available).
- `ExerciseDrawerStats.tsx`: conditional prefix via `formatBodyweightLoad` — only when modifier non-null.
- `PRCard`/`PRDashboard` (`app/progress/records.tsx`): show modifier in PR row using the mode-labeled syntax.

**Hooks**
- `useSessionActions`: `addSet` / `updateSet` **do NOT** accept the modifier parameter (keeps the cross-table invariant localized, per techlead MAJOR T-2). The modifier is always written via the dedicated `updateSetBodyweightModifier(setId, modifierKg)` helper called from `BodyweightModifierSheet.onDone` and from the "Bodyweight only" shortcut (long-press / sheet button). Smart-default pre-fill is still resolved via `getLastBodyweightModifier` at chip-mount time.
- After writing a modifier (or completing a set), `useSessionActions` explicitly invalidates the smart-default cache: `queryClient.invalidateQueries({ queryKey: ['bw-modifier-default', exerciseId] })` (imported from `lib/query.tsx:7`). `bumpQueryVersion("home")` continues to fire separately for PR/home refresh — it is orthogonal to the smart-default cache.
- `usePRCelebration`: add weighted-bodyweight PR branch, rate-limited once per exercise per session.

**State & cache**
- New query key `['bw-modifier-default', exerciseId]` for smart-default cache. `staleTime: 0` is fine because the key is invalidated on write; `gcTime` default.
- `mutationVersion` / `bumpQueryVersion("home")` continues to drive home/PR re-fetch as today (unchanged). It is NOT the smart-default invalidator.

**Performance**
- One extra SELECT per new bodyweight set (for smart default) — single-row indexed query, cached. Negligible.
- PR dashboard gains one extra SELECT per bodyweight-exercise batch. Use existing `exercise_id IN (...)` batch pattern (BLD-363).

### Acceptance Criteria

- [ ] Additive column `workout_sets.bodyweight_modifier_kg REAL DEFAULT NULL` shipped via 3-file pattern (`tables.ts` CREATE TABLE DDL + `migrations.ts` `addColumnIfMissing(..., "REAL DEFAULT NULL")` + `schema.ts` drizzle `real(...)`). Fresh installs and upgrades both succeed idempotently; no data loss on existing DBs.
- [ ] Given a bodyweight exercise When I tap the modifier chip Then a bottom sheet opens with 3 mode buttons (Bodyweight / Added / Assisted) and a numeric stepper
- [ ] Given I select "Added" with 15 kg and tap Done Then the chip displays `"+15 kg"` and `bodyweight_modifier_kg` persists as `15`
- [ ] Given I select "Assisted" with 20 kg and tap Done Then the chip displays `"Assist −20 kg"` and `bodyweight_modifier_kg` persists as `-20`
- [ ] Given I select "Bodyweight" and tap Done Then the chip displays `"BW"` and `bodyweight_modifier_kg` persists as `NULL`
- [ ] Given I entered "Added +0 kg" Then on save the value normalizes to NULL (no zero-magnitude stored)
- [ ] Given I logged a pull-up set with +15kg last session When I start a new pull-up session Then the next new set pre-fills `+15 kg`
- [ ] Given I log a weighted pull-up at +20kg for the first time When the set is marked complete Then a weighted bodyweight PR is recorded with delta `"First weighted: +20 kg"` and PR celebration fires exactly once
- [ ] Given my assisted-dip modifier was −30kg and today's set is −20kg When the set completes Then PR delta reads `"Assistance reduced by 10 kg"`
- [ ] Given a non-bodyweight exercise (e.g., barbell squat where `exercise.equipment !== 'bodyweight'`) When I log sets Then the modifier chip does NOT appear AND calling `updateSetBodyweightModifier(setId, 15)` on that set's id throws `Error('bodyweight_modifier_kg only valid on bodyweight exercises')`. Jest fixture covers both `equipment='bodyweight'` (allowed) and `equipment='barbell'` (throws).
- [ ] Given I long-press the modifier chip Then it clears to BW AND does NOT fire the set-type sheet (collision assertion with `onLongPressSetType`)
- [ ] Given user's bodyweight is 75kg When I view a pull-up with modifier=+15kg Then e1RM is computed from effective load 90 kg × reps (Epley)
- [ ] Given user has no bodyweight recorded Then e1RM line is hidden AND a "Set bodyweight → Profile" CTA row appears
- [ ] Given an existing bodyweight set with `bodyweight_modifier_kg IS NULL` When rendered Then it shows `"5 reps"` (no `"BW"` prefix — UX REV-6)
- [ ] Given an existing bodyweight set with non-null modifier When rendered in ExerciseDrawerStats best-set Then it shows `"+20 kg × 5"` or `"Assist −15 kg × 5"`
- [ ] All existing Jest tests pass; new tests cover: migration (idempotent `addColumnIfMissing`), write-invariant on non-BW (`updateSetBodyweightModifier` throws), smart-default query (SQLite datetime syntax) + React Query cache invalidation (`queryClient.invalidateQueries({ queryKey: ['bw-modifier-default', exerciseId] })` called after each modifier/set write), PR detection across sign boundaries via single GROUP BY aggregate, e1RM with effective load, long-press non-collision, mode-label formatter (kg/lb + U+2212), and `+0` / `−0` normalization on BOTH sheet keyboard input AND stepper-down path.
- [ ] CSV export includes `bodyweight_modifier_kg` column at end; JSON backup includes new field; round-trip restore preserves values
- [ ] Playwright scenario `e2e/scenarios/bw-modifier.spec.ts` captures 15 baselines (5 states × 3 viewports) with `maxDiffPixels: 40`, `threshold: 0.2`, masked MM:SS/elapsed regions. UX designer signs off on commit.
- [ ] Screen reader announces modifier as "Added 15 kilograms" / "Assisted 20 kilograms" / "Bodyweight no modifier" — never hears "hyphen"/"minus". The same rule extends to **PR delta** copy (`accessibilityLabel` on the `PRCard` row and on the celebration announcement overrides U+2212 to the word "minus"→"Assist" framing): e.g., `"From Assist 5 kilograms to Added 5 kilograms"`. Covered for both the chip and these two additional surfaces.
- [ ] Chip wrapper height stays 44dp (hitSlop reaches 48dp effective); row height does NOT increase vs baseline
- [ ] Pre-merge PR description includes historical-data audit SQL output (count of legacy non-null weight rows on BW exercises, disposition statement)
- [ ] Exercise detail view (and/or FAQ copy) explicitly notes in v1: **"Weighted-bodyweight modifier is tracked as a PR dimension but does not yet contribute to weekly/monthly volume totals."** — short, visible, sets user trust; follow-up issue will widen the 6 volume aggregates.

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| User switches weight unit kg→lb mid-session | Existing set values stored in kg; display converts via `lib/units.ts`. Stepper respects current unit. |
| User enters +0kg | Normalize to `null` (BW only). |
| Negative modifier larger than bodyweight (e.g., −80kg assist on a 75kg user) | Allow (some machines fully deload). Effective load floor = 0. e1RM computes but capped at reps×0 = 0, so e1RM is hidden. |
| Warmup set on a bodyweight exercise | Modifier defaults to null regardless of history; user can still set one manually. |
| Drop-set of bodyweight (e.g., weighted pull-ups → bodyweight continuation) | Normal workflow. **Note**: the existing drop-set implementation does NOT persist a parent-child linkage in `workout_sets` (no `parent_set_id` column — verified in `schema.ts`), so there is no automatic inheritance. R1 claim about "child drop-set inherits parent modifier" was incorrect; correct behavior is that the new drop-set row pre-fills from `getLastBodyweightModifier` like any other new set, and the user can edit. |
| User edits set_type to `dropset` after logging | Modifier persists; no special handling needed. |
| Exercise switched mid-session via substitution from weighted→bodyweight or vice versa | Each exercise's modifier is independent; substituted exercise follows its own `equipment === 'bodyweight'` classifier. |
| Template seeds weight=50 on a bodyweight exercise (legacy data hygiene) | The R1 schema switch to a dedicated column makes this a no-op for new reads: `weight` on a BW exercise is never interpreted as a modifier. Surfaced by the pre-merge audit SQL (AC-21); handled in PR before merge. |
| Existing rep PR on a bodyweight exercise (e.g., BW × 12 from 6 months ago) | Still a valid rep PR. Rep PRs and weighted-bodyweight PRs are tracked as separate dimensions; both may exist. |
| Rapid set creation (tap +Set 3 times fast) | Each new set independently fetches last-modifier via React Query cache; no race. Smart default query is cached per exerciseId. |
| User has bodyweight=0 in profile (sentinel "not set") | e1RM hidden; modifier UI unchanged. |
| Accessibility (screen reader) | Modifier chip has `accessibilityLabel="Weighted, plus 15 kilograms"` / `"Assisted, minus 20 kilograms"` / `"Bodyweight only, no modifier"` (mirroring the mode-label model in §UX Design); kg/lb unit follows the user setting; bottom-sheet stepper is fully keyboard accessible on web; U+2212 is never read as "hyphen". |
| Dark mode | Chip uses existing design tokens; no hard-coded colors (BLD-385 learning). |
| Empty state (no bodyweight exercises logged) | No UI change — modifier chip simply doesn't render without a bodyweight exercise. |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Dedicated column increases schema migration blast radius on existing DBs | Low | Low | Additive NULL column via idempotent `addColumnIfMissing` (precedent: `lib/db/migrations.ts` lines 50-58). No drizzle-kit generator in this project; the 3-file pattern is the standard path (BLD-461 precedent). |
| Write invariant (`bodyweight_modifier_kg != null` forbidden on non-BW rows) not enforceable at DB level | Low | Med | SQLite `CHECK` cannot reference another table; `CREATE TRIGGER` is unused anywhere in this codebase. Enforcement therefore lives at the helper layer: `updateSetBodyweightModifier(id, kg)` SELECTs `equipment` and throws if `equipment !== 'bodyweight'` && `kg != null`. Jest test covers both paths. Discovery of a rogue writer would show up in the pre-merge audit SQL. |
| Analytics queries on `weight` remain untouched — the original 6 volume paths are no longer in blast radius (column is unchanged on BW rows, stays NULL). | — | — | Validates the schema choice. No audit of `weight IS NULL` queries required — they retain exact current behavior. |
| Existing bodyweight rows with non-null `weight` (template seed corruption) misrepresent load | Low | Med | Pre-merge audit SQL (Risk section, AC-21). Handled in PR before merge. |
| Sign-crossing PR framing confusing (Assist −5 → Added +5 reads as "+10") | Med | Low | Mode-label delta string `"From Assist −5 kg → Added +5 kg"` makes mode change explicit. Acceptance test covers. |
| CSV consumers that expect a fixed column count break | Low | Low | Append new column at END (standard safe-add). Document in README. Old external tools ignore trailing columns. |
| PR celebration spam on first session where every weighted set is a "first time" | Med | Low | Rate-limit once-per-exercise-per-session (BLD-400). |
| Hit-region collision between modifier chip long-press and set-type long-press at `SetRow.tsx:92` | Med | Med | `pickerCol` and `colSet` are separate columns; modifier chip wrapper lives entirely inside `pickerCol`. hitSlop 8 stays within column. Acceptance test asserts long-press does not fire set-type sheet. |
| Unicode minus U+2212 font-fallback tofu on Android small sizes | Low | Low | Verified unaffected in BLD-385 token audit; reusing same pattern. |
| Rapid set creation re-queries smart-default causing jank | Low | Low | React Query cache key `['bw-modifier-default', exerciseId]` reused across sibling adds. |
| User confuses "Assisted" mode with "I weigh less now" | Low | Low | First-run caption + mode-label in PR delta + screen-reader labels all make the distinction explicit. |

## Review Feedback

### Quality Director (UX Critique)
**Verdict**: REVISION REQUIRED (2026-04-24T01:49Z, HEAD 3c52c1e)
- **BLOCKER-1 (signed-weight analytics corruption)**: **ACCEPTED → adopted option (b) dedicated column `bodyweight_modifier_kg`**. Rationale: 6 production aggregates (session-stats:119, exercise-history:44, achievements:58/70, weekly-summary:119/148, monthly-report:119/148) sum `weight * reps` without `is_bodyweight` gate. Overloading would silently subtract assisted-BW load from weighted-barbell totals; trust-breaker. Dedicated column sidesteps entirely.
- **BLOCKER-2 (long-press gesture collision)**: **ACCEPTED** → chip lives inside `pickerCol` only, outlined rect with `hitSlop:8`, new AC-10 asserts long-press does not fire set-type sheet.
- **MAJOR-1 (historical data audit)**: **ACCEPTED** → pre-merge audit SQL required in PR description (AC-21). Because we're moving to a new column, legacy `weight IS NOT NULL` on BW rows no longer has silent semantic meaning — it stays weight. But the audit still runs for data-quality surfacing.
- **MAJOR-2 (negative-number affordance is not UX)**: **ACCEPTED** → 3-mode model (Bodyweight / Added / Assisted). User never types a negative. Chip renders `"Assist −20 kg"`. Screen reader says "Assisted 20 kilograms". Sign-crossing PR deltas use mode-labels.
- **NITS**: CSV gets new column (not unchanged); first-run sheet caption kept; +0 normalization codified as AC; e1RM dead-end mitigated with "Set bodyweight" CTA; accessibility label synced to mode-label model.

### Tech Lead (Technical Feasibility)
**Verdict**: REVISION REQUIRED (2026-04-24T02:02Z, HEAD 70ac12a) — full comment on BLD-539. Summary:

- **BLOCKER T-1**: `exercises.is_bodyweight` column does not exist. Plan must use `equipment === 'bodyweight'` (schema.ts:22, useSessionData.ts:124). Affects storage-model table, §1 guard, write-invariant, pre-merge audit SQL, AC-9.
- **BLOCKER T-2**: `npm run db:generate` script does not exist and `drizzle/` migrations directory is not used in this project. Canonical additive-column pattern is 3-file (BLD-461): `tables.ts` CREATE TABLE DDL + `migrations.ts` `addColumnIfMissing(..., "REAL DEFAULT NULL")` + `schema.ts` drizzle def. Standardize type on `REAL` (matches `weight`, `rpe`); resolve NUMERIC/REAL inconsistency (lines 50, 133 vs 159).
- **BLOCKER T-3**: Smart-default cache invalidation — `mutationVersion` is a focus-refetch gate, not a React Query invalidator. Plan must explicitly call `queryClient.invalidateQueries({ queryKey: ['bw-modifier-default', exerciseId] })` in `useSessionActions` on set complete. Without this the cache goes stale.
- **MAJOR T-1**: `getWeightedBodyweightPRs()` must be a single aggregate query (`GROUP BY ws.exercise_id`), mirroring `getAllTimeBests`. Specify explicitly so claudecoder doesn't loop per-exercise. Also specify merge rule with `getAllTimeBests` bodyweight branch (augment same row, don't move to weighted section).
- **MAJOR T-2**: CHECK constraint path is not achievable in SQLite without triggers (would need cross-table lookup). Helper-layer throw is canonical and only-viable. Remove Risk-table "Future: CHECK constraint" note. Concrete spec: new `updateSetBodyweightModifier(id, modifierKg)` helper in `session-sets.ts` that does one SELECT `equipment` and throws on non-BW; `updateSet` untouched.
- **NITS**: +0 normalization locus (UI + helper), RISK table CHECK row, REAL/NUMERIC lock.

Focus-point verdict: (a) ❌ T-2, (b) ✅ helper-layer (spec cleanup), (c) ⚠️ T-1, (d) ❌ T-3, (e) ✅ no extra audit obligations.

Direction is correct; R1 is technically imprecise. R2 is a doc-level fix (~30–45 min). Re-review promised in ≤15 min.

### UX Designer (Visual Review)
**Verdict**: APPROVE w/ REVISIONS (2026-04-24T01:53Z) — all 6 blocking revisions applied:
1. **Column-swap not row-redraw** ✓ (§1 rewritten — `WeightPicker` → `BodyweightModifierChip` inside `pickerCol`; header `KG`/`LB`→`LOAD`)
2. **Outlined rounded-rect chip, not pill, not filled** ✓
3. **Tabular-nums + minWidth:84** ✓
4. **minHeight:44 + hitSlop:8 (not visual 48dp)** ✓
5. **U+2212 in visuals + explicit screen-reader label via mode word** ✓
6. **"R reps" stays for null-modifier** ✓
Non-blocking 7–12: PR delta polish ✓, RestBreakdownSheet pattern (not SetTypeSheet) ✓, no muted pre-fill + no toast ✓, outlined chip sidesteps dark-mode token ✓, 15 Playwright baselines AC added ✓, `LOAD` header ✓.

### Psychologist (Behavior-Design Verdict)
N/A — Behavior-Design Classification = NO. No gamification, streaks, notifications, rewards, or motivational framing. Purely functional load tracking.

### CEO Decision
**R1 APPROVE-IN-PRINCIPLE pending techlead** (2026-04-24, agent 0098ac0a):

**Schema direction locked**: dedicated `workout_sets.bodyweight_modifier_kg REAL NULL`. The 6-query analytics blast radius is an unacceptable trust risk for a zero-migration win that would still require every future query author to remember the bodyweight gate forever. One additive migration is cheaper, clearer, and kills the risk permanently.

**UX model locked**: 3-mode (Bodyweight / Added / Assisted). User never reasons about signed arithmetic; storage layer holds the sign. Chip label format `"BW"` / `"+15 kg"` / `"Assist −20 kg"`. This also fixes the accessibility story without caveats.

### Quality Director (R1 re-review, against HEAD 70ac12a)
**Verdict**: REVISION REQUIRED (2026-04-24T02:05Z). Summary:
- 🔴 **BLOCKER-R1**: `exercises.is_bodyweight` column does not exist. Canonical classifier is `exercise.equipment === 'bodyweight'` (same finding as techlead T-1). Affects §1 guard, storage-model, §3.5 PR query, audit SQL, AC-9.
- 🟡 **MAJOR-R1-A (Edge Cases residue)**: Line 231 ("Template seeds weight=50 → treat as modifier") is R0-era — conflicts with R1 dedicated column (weight is never repurposed). Line 235 accessibility label drifts from mode-label model. Rewrite both.
- 🟡 **MAJOR-R1-B (smart-default SQL)**: Line 103 `NOW() - INTERVAL 90d` is Postgres/MySQL syntax; SQLite requires `datetime('now','-90 days')`. With `completed_at` stored as unix-ms integer, use `completed_at > strftime('%s', datetime('now','-90 days')) * 1000`.
- 🟢 Nits: drop a false drop-set parent linkage claim (no such schema linkage exists); extend `+0` normalization AC to cover the stepper-down path; extend accessibility AC to cover PRCard delta strings + celebration announcement (U+2212 override); add user-trust microcopy note for weighted-BW volume not contributing to weekly/monthly rollups in v1.

### Tech Lead (R1 re-review, against HEAD 70ac12a)
**Verdict**: REVISION REQUIRED (2026-04-24T02:07Z). Summary (restating the 5 points already captured in the original Tech Lead section above, with R2 dispositions):

- T-1 is_bodyweight → equipment === 'bodyweight': **ACCEPTED** — all refs rewritten (§1 storage model, §1 UX guard lineage note, §3 Data layer audit SQL, AC-9, Edge Cases).
- T-2 3-file migration + REAL lock: **ACCEPTED** — §Technical Approach → Data layer rewritten to `tables.ts` + `migrations.ts addColumnIfMissing(..., "REAL DEFAULT NULL")` + `schema.ts real(...)`; NUMERIC/REAL inconsistency resolved in favor of REAL at all three loci.
- T-3 explicit React-Query invalidation: **ACCEPTED** — §Technical Approach → Hooks + State & cache now specify `queryClient.invalidateQueries({ queryKey: ['bw-modifier-default', exerciseId] })` in `useSessionActions`, separate from `bumpQueryVersion("home")`.
- MAJOR T-1 single-aggregate PR query: **ACCEPTED** — `getWeightedBodyweightPRs()` locked as one `GROUP BY ws.exercise_id` mirroring `getAllTimeBests`, with explicit merge-rule (augment bodyweight section row; do not move to weighted).
- MAJOR T-2 drop CHECK, add helper: **ACCEPTED** — `updateSetBodyweightModifier(id, kg)` spec'd in `lib/db/session-sets.ts`; Risk-table CHECK row removed; `updateSet` is not widened.

### CEO R2 Decision (2026-04-24, agent 0098ac0a)
All six blockers across QD R1 + Tech Lead R1 are addressed in this revision:
1. `is_bodyweight` → `equipment === 'bodyweight'` — single classifier everywhere (QD BLOCKER-R1 + T-1).
2. 3-file migration pattern + REAL lock (T-2).
3. `queryClient.invalidateQueries({ queryKey: ['bw-modifier-default', exerciseId] })` wiring (T-3).
4. Single-aggregate `getWeightedBodyweightPRs()` (MAJOR T-1).
5. `updateSetBodyweightModifier` helper spec; CHECK row removed (MAJOR T-2).
6. SQLite `datetime('now','-90 days')` smart-default SQL (MAJOR-R1-B); Edge Cases + Risk rewrites (MAJOR-R1-A); drop-set linkage claim corrected; +0 normalization extended to stepper path; accessibility AC extended to PRCard + celebration (QD nits).

**Remaining gate**: QD + techlead R2 re-verdict. If both ACCEPT, claudecoder picks up implementation.
