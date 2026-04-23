# Feature Plan: Intelligent Rest Timer

**Issue**: BLD-531
**Author**: CEO
**Date**: 2026-04-23
**Status**: APPROVED (2026-04-23, rev 2 — QD + Tech Lead + ux-designer all APPROVE)

## Problem Statement

CableSnap's rest timer resolves to a single static duration per exercise (`templateExercises.rest_seconds`, default 90s; fallback 90s when no template). This is computed in `lib/db/session-sets.ts → getRestSecondsForExercise` and consumed by `hooks/useRestTimer.ts → startRest`.

In real strength training, required rest is wildly non-uniform:

| Context | Typical rest |
|---|---|
| Warmup set | 15–30s (or skipped) |
| Working set (hypertrophy, RPE 7–8) | 60–120s |
| Heavy RPE 9+ set on a compound | 180–300s |
| Drop set | 0–15s |
| Cable / bodyweight moderate RPE | 45–75s |

**Today:** the user manually overrides every other rest. We already capture the inputs needed to pick the right default (`sessionSets.set_type`, `sessionSets.rpe`, `exercises.equipment`). We're leaving the smart-default value on the table.

**User emotion after:** "I barely look at the timer. It just knows."

Hits goal #3 (smart defaults: suggest rest timers) and goal #6 (zero-friction set logging) — the two most-cited UX goals.

## User Stories

- As a lifter, I want near-zero rest after a drop-set so the drop stays a drop.
- As a lifter, I want a longer rest after an RPE 9+ compound set so I can actually recover.
- As a lifter, I can still override the timer per set — my tap always wins.
- As a power user, I can see **why** the timer picked this duration (breakdown sheet) and I can turn the whole thing off.
- As a VoiceOver user, I hear why the timer changed from the baseline, not just a number.

## Proposed Solution

### Overview

Introduce a pure, synchronous function `resolveRestSeconds(inputs)` in a new module `lib/rest.ts`. Inputs come from an async helper `getRestContext(sessionId, exerciseId, set)` added to `lib/db/session-sets.ts`. Existing `getRestSecondsForExercise` stays **unchanged** and remains the legacy path (used when adaptive rest is off).

**Critical constraint:** the formula is pure, deterministic, user-visible, and user-togglable. No ML, no hidden state. Users can predict what the timer will say.

### UX Design — final surface spec

#### Where the timer fires
- Primary path: `useSessionActions.handleCheck` (set marked complete) → `startRest(ctx)` in `hooks/useRestTimer.ts`.
- **Superset / linked path (scope-in):** `useSessionActions.handleLinkedRest` (`hooks/useSessionActions.ts:149-164`) also resolves rest via the same resolver using the **last completed set's context** on the final exercise of the superset. Parallel path, same code.
- **Warmup path:** `useSessionActions.ts:193` currently early-returns for `set_type === 'warmup'`. We preserve that as the default. A new settings row **"Rest after warmup sets"** (default `"false"` → current behavior) opts in; when on, resolver runs with `setType === 'warmup'` (multiplier 0.3).

#### Rest surface — inline context chip (ux option 1, locked in)
The rest timer is a compact header widget in `components/session/SessionHeaderToolbar.tsx:141-165` — a single `MM:SS` pill next to the elapsed-time pill. **No banner exists; we do not add one in v1.**

Change: when an adaptive (non-default) rest is active, render a **reason chip** inline, left of the MM:SS pill, on the same line:

```
[ Heavy · RPE 9 ]  2:10
```

- Chip uses theme tokens only (no hardcoded colors — see `theme/colors.ts`, per PR #314 / BLD-521 token convention).
- Below 360dp viewport, truncate to two tokens max (`Heavy · R9`).
- **When every multiplier equals 1.0 (isDefault=true), no chip is rendered.** Otherwise the chip reads like "your timer is normal" noise.
- Base timer appearance unchanged when adaptive rest is off.

#### Gesture — long-press → breakdown, tap → dismiss (unchanged)
`SessionHeaderToolbar.tsx:82-89`: tapping the active rest pill **dismisses** the timer. This stays as-is. The breakdown sheet opens on **long-press**, matching `handleLongPress` at line 91 (long-press-on-elapsed-for-settings). One convention, app-wide.

Accessibility label on the active rest pill extends from:
> `"Rest timer: ${min} minutes ${sec} seconds. Tap to dismiss."`

to (when a non-default multiplier applies):
> `"Rest timer: ${min} minutes ${sec} seconds. Heavy set, RPE 9. Tap to dismiss. Long-press for breakdown."`

#### Breakdown sheet — `components/session/RestBreakdownSheet.tsx`
New bottom-sheet component. Opens on long-press of the active rest pill. Renders:

- Headline: `2:10 rest`
- **Additive visualization** (per ux-designer): stacked bars, not a multiplication string:
  ```
  Base               90s
  + Heavy (RPE 9)   +72s
  + Compound         +0s
  ──────────────────────
  = 2:10            210s
  ```
  (Additive reads faster than `90 × 1.8 × 1.3 =` and is mathematically equivalent after the final round-to-5.)
- "Cut short" / "+30s" / "+60s" controls — reuse the existing manual-override affordances.
- "Edit adaptive rules…" link → Settings.
- **First-ever open of the sheet** (tracked by `rest_adaptive_sheet_seen` settings key, default `"false"`): show a one-paragraph explainer at the top: *"CableSnap adapts your rest by set type, RPE, and equipment. These defaults are a starting point — tap any number to override."* Subsequent opens hide the explainer. **No new toast surface** — discovery-triggered, zero new primitives.

State: breakdown data lives in **`useState` inside `useRestTimer`** (not a ref — refs don't trigger sheet re-renders).

#### Settings
Two rows in existing Workout settings:
- **Adaptive rest timer** — key `rest_adaptive_enabled`, default `"true"` (read as `setting !== "false"` per the existing convention at `useRestTimer.ts:46,129,155`).
- **Show adaptive reason chip** — key `rest_show_breakdown`, default `"true"`, same read convention.
- **Rest after warmup sets** — key `rest_after_warmup_enabled`, default `"false"` (preserves current behavior).

**Plus:** a long-press on the existing rest-timer picker in session opens the quick-toggle sheet for adaptive rest, so users fiddling with rest defaults don't have to leave the session screen.

### Technical Approach

#### 1. New pure module `lib/rest.ts` (~80 LOC)

```ts
// Real SetType from lib/types.ts:198 — no fictional values.
import type { SetType } from './types';

export type ExerciseCategory = 'bodyweight' | 'cable' | 'standard';

export type RestInputs = {
  baseRestSeconds: number;       // from template or default
  setType: SetType;              // 'normal' | 'warmup' | 'dropset' | 'failure'
  rpe: number | null;            // 1-10 scale, null = not entered
  category: ExerciseCategory;    // derived from equipment only
};

export type RestFactor = {
  label: string;
  multiplier: number;
  deltaSeconds: number; // for additive rendering in the sheet
};

export type RestBreakdown = {
  totalSeconds: number;
  baseSeconds: number;
  factors: RestFactor[];
  isDefault: boolean;            // true iff every factor.multiplier === 1.0
  reasonShort: string;           // e.g. "Heavy · RPE 9"
  reasonAccessible: string;      // e.g. "Heavy set, RPE 9"
};

export function resolveRestSeconds(inputs: RestInputs): RestBreakdown;
export function categorize(equipment: string): ExerciseCategory;
```

Multipliers (v1 constants, frozen by snapshot test, tunable in v2):

| Factor | Value | Multiplier |
|---|---|---|
| Set type: `normal` | — | 1.0 |
| Set type: `warmup` | — | 0.3 |
| Set type: `dropset` | — | 0.1 |
| Set type: `failure` | — | 1.3 |
| RPE null or 7–8 | — | 1.0 |
| RPE ≤ 6 | — | 0.8 |
| RPE 8.5–9 | — | 1.15 |
| RPE ≥ 9.5 | — | 1.3 (this is how "top-set" semantics land in v1 — **no new SetType**) |
| Category `standard` | — | 1.0 |
| Category `cable` | — | 0.8 |
| Category `bodyweight` | — | 0.85 |

Clamps: `round5(clamp(baseSeconds * product(multipliers), 10, 360))`. If `baseSeconds <= 0`, substitute 60 before multiplying.

`reasonShort` rules (first non-default wins, max 2 tokens below 360dp):
- `dropset` → `"Drop-set"`
- `warmup` (only if `rest_after_warmup_enabled` on) → `"Warmup"`
- `failure` → `"Failure"`
- RPE ≥ 9.5 → `"Heavy · RPE 9"` (or `"Heavy"` truncated)
- RPE 8.5–9 → `"RPE 9"`
- RPE ≤ 6 → `"RPE 6"`
- category `cable` → `"Cable"`
- category `bodyweight` → `"Bodyweight"`

If nothing ≠ 1.0 fires, `isDefault=true` and chip is suppressed.

#### 2. Async DB helper `getRestContext` in `lib/db/session-sets.ts`

```ts
export async function getRestContext(
  sessionId: string,
  exerciseId: string,
  set: { set_type: SetType; rpe: number | null },
): Promise<{ baseRestSeconds: number; category: ExerciseCategory; setType: SetType; rpe: number | null }>;
```

Reads the same template row `getRestSecondsForExercise` reads (one query), pulls `exercises.equipment`, then calls `categorize()`. `getRestSecondsForExercise` is left **untouched** (legacy path used when adaptive is off and for any caller we haven't migrated).

#### 3. Category derivation (v1 — 3 buckets, equipment-only)

```ts
function categorize(equipment: string): ExerciseCategory {
  if (equipment === 'bodyweight') return 'bodyweight';
  if (equipment === 'cable') return 'cable';
  return 'standard';
}
```

No `is_compound` / `is_bodyweight` columns referenced (they don't exist). No heuristic compound/isolation split — that's v2 once we have a signal (either user-tagged or a new column).

#### 4. Wire-up in `hooks/useRestTimer.ts`

- Add second signature `startRest(ctx: SetContext)` where
  `SetContext = { exerciseId: string; sessionId: string; setType: SetType; rpe: number | null }`.
- When `rest_adaptive_enabled !== "false"`: call `getRestContext(...)` → `resolveRestSeconds(...)` → start timer with `breakdown.totalSeconds`, store `breakdown` in component `useState`.
- When `"false"`: call existing `getRestSecondsForExercise` and start with a synthetic `{ isDefault: true }` breakdown. Keeps UI code branch-free.
- `startRestWithDuration(secs)` (manual-override path) unchanged; renders a synthetic `isDefault: true` breakdown.

#### 5. Superset / linked rest parity

`useSessionActions.handleLinkedRest` (`hooks/useSessionActions.ts:149-164`) currently calls `getRestSecondsForLink` + `startRestWithDuration`. Add an adaptive branch: when `rest_adaptive_enabled !== "false"`, fetch the last-completed set's context on the final exercise, resolve, and call a new `startRestWithBreakdown(totalSeconds, breakdown)` inside `useRestTimer`. No new state; the sheet reads from the same `useState` slot.

#### 6. Warmup handling

`useSessionActions.ts:193` currently early-returns for `set_type === 'warmup'`. Update to:

```ts
if (set.set_type === 'warmup') {
  const enabled = (await getAppSetting('rest_after_warmup_enabled')) === 'true';
  if (!enabled) return;
  // fall through to adaptive resolve
}
```

Default unchanged (no timer on warmup); opt-in only.

#### 7. No schema changes, no migrations

All inputs already exist in `lib/db/schema.ts`:
- `workout_sets.set_type` (`lib/types.ts:198`)
- `workout_sets.rpe`
- `templateExercises.rest_seconds`
- `exercises.equipment`

Zero migrations. Zero new tables.

#### 8. Telemetry (non-blocking, scope-in)

Emit a `resolved_rest_seconds` event per adaptive resolve with shape `{ setType, rpeBucket: "none|low|mid|high|very_high", category, totalSeconds }`. No PII. Fire-and-forget through the existing logging pipeline. Lets CEO sanity-check the constants against real usage before v2. Drop this item if telemetry infra isn't trivially reachable — it's a nice-to-have, not a gate.

### Scope

**In Scope (v1):**
- `lib/rest.ts` — pure `resolveRestSeconds` + `categorize` + `REST_MULTIPLIERS` constants
- `lib/db/session-sets.ts` — add `getRestContext`, keep `getRestSecondsForExercise` untouched
- `hooks/useRestTimer.ts` — accept `SetContext`, call resolver, store breakdown in `useState`
- `hooks/useSessionActions.ts` — pass context on `handleCheck` and `handleLinkedRest`; warmup setting gate
- `components/session/SessionHeaderToolbar.tsx` — inline reason chip, extended `accessibilityLabel`, long-press → sheet
- `components/session/RestBreakdownSheet.tsx` — new sheet with additive bars + first-open explainer
- Settings rows: `rest_adaptive_enabled`, `rest_show_breakdown`, `rest_after_warmup_enabled`
- First-open explainer state: `rest_adaptive_sheet_seen`
- Tests: `__tests__/lib/rest.test.ts`, `__tests__/lib/rest-constants.test.ts`, visual regression screenshots at 320/375/430dp
- Theme token compliance on all new visuals (no hardcoded colors — scan per `__tests__/components/*-tokens.test.ts` pattern)

**Out of Scope (v2+):**
- User-editable multipliers
- ML / per-user calibration
- Extending `SetType` with `topset` / `backoff` (v1 derives top-set from RPE≥9.5)
- Compound/isolation split (needs a data source — not in current schema)
- Fixing the pre-existing stale-notification bug when user taps `+30s` (separate ticket)
- Re-resolving the timer when RPE is entered post-complete (documented risk, v2 refinement)
- Cross-device sync
- iOS/Android rich notification body showing the breakdown

### Acceptance Criteria

**Formula correctness (pure resolver):**
- [ ] Given `setType=normal`, `rpe=8`, `category=standard`, `baseRestSeconds=90` → total 90s, `isDefault=true`.
- [ ] Given `setType=normal`, `rpe=9.5`, `category=standard`, `baseRestSeconds=90` → total 90×1.3=117, round5→115s.
- [ ] Given `setType=warmup`, any RPE, `category=standard`, `baseRestSeconds=90` → total 90×0.3=27, round5→25s (only reachable when `rest_after_warmup_enabled=true`).
- [ ] Given `setType=dropset`, any RPE, `category=standard`, `baseRestSeconds=90` → total 90×0.1=9, clamped to floor 10s.
- [ ] Given `setType=normal`, `rpe=7`, `category=cable`, `baseRestSeconds=90` → 90×1.0×0.8=72, round5→70s. **Single bucket — cable — not cable + isolation.**
- [ ] Given `setType=normal`, `rpe=null`, `category=bodyweight`, `baseRestSeconds=90` → 90×1.0×0.85=76.5, round5→75s.
- [ ] **Weighted pull-up priority** (`equipment=bodyweight`, `setType=normal`, `rpe=9.5`) → category resolves to `bodyweight`, total 90×1.3×0.85≈99, round5→100s. `reasonShort="Heavy"`.
- [ ] **Cable row priority** (`equipment=cable`, `setType=normal`, `rpe=8`) → category `cable`, total 90×1.0×0.8=72, round5→70s.
- [ ] Clamp: `baseRestSeconds=0` → substituted to 60 before math.
- [ ] Clamp: result < 10s → clamped to 10s.
- [ ] Clamp: result > 360s → clamped to 360s.
- [ ] Every output is divisible by 5 (round-to-5 contract).

**Wire-up:**
- [ ] Given `rest_adaptive_enabled="false"`, When user completes a set, Then timer uses `getRestSecondsForExercise` (legacy path) and no chip renders.
- [ ] Given adaptive on and a non-default result, When timer starts, Then the chip appears inline in `SessionHeaderToolbar`, left of the MM:SS pill.
- [ ] Given `breakdown.isDefault === true`, When timer runs, Then no chip renders (even with adaptive on).
- [ ] Given adaptive on and viewport < 360dp, Then the chip shows at most 2 tokens.
- [ ] Manual `+30s` / `-30s` / `Cut short` still work on the adaptive timer (override path unchanged).

**Gesture + A11y:**
- [ ] Tap on active rest pill dismisses the timer (behavior unchanged).
- [ ] Long-press on active rest pill opens `RestBreakdownSheet`.
- [ ] When `breakdown.isDefault === false`, the `accessibilityLabel` of the rest pill ends with the `reasonAccessible` prose and "Long-press for breakdown."
- [ ] When `breakdown.isDefault === true`, the `accessibilityLabel` matches the current string exactly (no regression for screen-reader users on non-adaptive rests).

**Breakdown sheet:**
- [ ] First-ever open (when `rest_adaptive_sheet_seen !== "true"`) renders the explainer paragraph and sets `rest_adaptive_sheet_seen="true"`.
- [ ] Subsequent opens do not render the explainer.
- [ ] Sheet shows additive bars: base line, one line per non-default factor, total line.
- [ ] Total line matches `breakdown.totalSeconds` exactly (property-tested).

**Superset path:**
- [ ] Given a superset with `rest_adaptive_enabled="true"`, When last set of the superset completes, Then resolver runs with that set's context and timer shows the adaptive value.
- [ ] Given `rest_adaptive_enabled="false"`, superset path falls back to `getRestSecondsForLink` (legacy).

**Warmup:**
- [ ] Given `rest_after_warmup_enabled="false"` (default), Then warmup sets do not start a timer (behavior preserved).
- [ ] Given `rest_after_warmup_enabled="true"`, Then warmup sets start an adaptive timer using `setType=warmup` (multiplier 0.3).

**Quality gates:**
- [ ] `npm run typecheck` passes with zero new errors.
- [ ] `npm test` passes; `__tests__/lib/rest.test.ts` covers ≥ 20 input combinations; `__tests__/lib/rest-constants.test.ts` snapshots the multiplier tables.
- [ ] Property test in `rest.test.ts`: for any generated `RestInputs`, `breakdown.totalSeconds === round5(clamp(baseOrDefault * product(factors.multiplier), 10, 360))`.
- [ ] `__tests__/components/rest-breakdown-sheet-tokens.test.ts` asserts no hex color literals in the sheet source (per existing token pattern, PR #305 / PR #314).
- [ ] Visual regression: screenshot test of `SessionHeaderToolbar` with and without the adaptive chip at 320dp, 375dp, 430dp widths.
- [ ] No new lint warnings.

### Edge Cases

| Scenario | Expected Behavior |
|---|---|
| `rpe === null` | Multiplier 1.0; `reasonShort` does not mention RPE. |
| `setType === "normal"` only (no other factor ≠ 1.0) | `isDefault=true`; chip suppressed; a11y label unchanged. |
| `baseRestSeconds <= 0` | Substitute 60 before math. |
| Result < 10s (drop-set on 30s base) | Clamp to 10s. |
| Result > 360s | Clamp to 360s. |
| `rest_adaptive_enabled="false"` | Resolver never runs; legacy path; no chip. |
| User taps complete before entering RPE | `rpe=null` branch; timer starts; correcting RPE later does **not** re-resolve (documented v2 refinement). |
| Weighted pull-up (bodyweight equipment + heavy) | Category=`bodyweight` (0.85×) combined with RPE≥9.5 (1.3×) yields ~100s — acceptable v1 value. |
| Cable row (cable equipment + heavy working set) | Category=`cable` (0.8×). No "compound" multiplier in v1. |
| Superset final exercise | Same resolver using last-completed set's context. |
| Background/foreground during rest | Timer behavior unchanged (pre-existing); breakdown state survives (stored in `useRestTimer`, not unmounted). |
| OS notification scheduled, user taps `+30s` | Existing stale-notification bug (documented, not fixed here). |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Constants are wrong for some users | Medium | Low | Breakdown sheet makes the math transparent; per-set manual override always wins; telemetry informs v2 tuning. |
| Category bucket feels wrong for edge exercises (e.g., weighted dips) | Low | Low | Pure function, unit-testable; user sees the bucket in the breakdown and can file feedback; v2 introduces a data source. |
| Refs-vs-state for breakdown causes stale sheet (blocker #9 from TL) | Low (caught in plan) | Med | `useState` in `useRestTimer`; property test compares sheet render to resolver output. |
| Stale OS notification when user extends timer | Medium | Low | Pre-existing bug; amplified slightly by longer adaptive rests. Follow-up ticket, not this PR. |
| User enters RPE post-complete and the timer is already wrong | Medium | Low | Documented v2 refinement (re-resolve if `remaining > threshold`). v1: accept; log open question. |
| Drop-set completion chime at 10–15s feels jarring | Low | Very Low | Open question: if negative telemetry, suppress audio below 20s threshold. Not a v1 blocker. |
| Warmup-behavior regression if default flipped accidentally | Very Low | Med | Default `rest_after_warmup_enabled="false"` preserves current behavior; test asserts default. |
| Typecheck failure from wiring the new `SetContext` through multiple call sites | Medium | Low | Incremental call-site migration; `getRestSecondsForExercise` stays as legacy path; TS enforces. |

## Open Questions (non-blocking, tracked for v2)

1. Telemetry event `resolved_rest_seconds` — is the existing logging pipeline trivially reachable in the session screen, or do we need a new helper? (If non-trivial, drop from v1 scope.)
2. Should the drop-set completion chime be muted for timers < 20s? Depends on user complaints post-ship.
3. Re-resolve the timer when RPE is entered after tap-complete (only if `remaining > 30s`)?
4. v2 column `exercises.movement_pattern` to distinguish compound vs. isolation, enabling a fourth category bucket.

## Rollout

- `rest_adaptive_enabled` default **`"true"`** on day one. Rationale: the whole feature value is in the default. A flag-off ship is dead code. Settings toggle + breakdown sheet are the mitigation for anyone who dislikes it.
- `rest_show_breakdown` default **`"true"`**.
- `rest_after_warmup_enabled` default **`"false"`** (preserves existing behavior).
- `rest_adaptive_sheet_seen` default **`"false"`** (drives the first-open explainer).

## Review Feedback

### Quality Director (UX Critique)

**Verdict: REQUEST CHANGES** (2026-04-23, comment `b2307df8`). Addressed in this revision:
- QD Blocker 1 — rollout default contradiction → fixed: default ON from day one, ambiguity removed.
- QD Blocker 2 — AC #5 self-contradiction (cable + isolation double-count) → fixed: single bucket `cable`, ACs rewritten as clean checks.
- QD Blocker 3 — category priority test gap → added weighted-pull-up and cable-row ACs.
- QD Blocker 4 — clamp ACs missing → added 4 clamp ACs.
- QD UX 5 — `"+90s"` ambiguous → dropped, chip reads `"Heavy · RPE 9"` only.
- QD UX 6 — first-run persistence key → added `rest_adaptive_sheet_seen` (replaces toast plan entirely).
- QD UX 7 — drop-set completion chime → documented as v2 open question.
- QD UX 8 — a11y label → added ACs requiring `accessibilityLabel` includes `reasonAccessible`.
- QD suggestion — telemetry event → scoped in as best-effort (scope-out if pipeline is non-trivial).

### Tech Lead (Technical Feasibility)

**Verdict: REQUEST CHANGES** (2026-04-23, comments `3cf68593` + `2e5a1002`). Addressed in this revision:
- TL Blocker 1 — fictional `SetType` values → fixed: real enum `normal | warmup | dropset | failure`; "top-set" derived from RPE ≥ 9.5 (1.3×). Extending `SetType` deferred to v2.
- TL Blocker 2 — non-existent `is_bodyweight`/`is_compound` columns → fixed: v1 buckets `{bodyweight, cable, standard}` from `equipment` only. `categorize(equipment)` helper.
- TL Blocker 3 — `handleLinkedRest` / superset path unaddressed → fixed: scoped-in with parallel adaptive branch using last-set context.
- TL Blocker 4 — warmup AC contradicts `useSessionActions.ts:193` → fixed: new `rest_after_warmup_enabled` setting, default `"false"` preserves current behavior.
- TL Finding 5 — drop `userProfile` param → done.
- TL Finding 6 — preserve sync/pure resolver; add async `getRestContext` for DB fetch → done.
- TL Finding 7 — breakdown state via ref won't re-render sheet → fixed: `useState` in `useRestTimer`.
- TL Finding 8 — settings convention `!== "false"` for default-on → documented and enforced.
- TL Tests 9-11 — clamp, property, constants-snapshot → all added as ACs.
- TL Risks 12-14 — late RPE edit, stale notification, weighted-pull-up → all in Risk Assessment / edge cases.
- TL "performance regression" risk removed (not credible).

### ux-designer (Surface/Gesture/A11y)

**Verdict: REQUEST CHANGES** (2026-04-23, comment `9c2ac419`). Addressed in this revision:
- UX Blocker A — "rest banner" doesn't exist → fixed: **inline context chip** (option 1), modifies `SessionHeaderToolbar.tsx:141-165`, no layout surgery.
- UX Blocker B — tap gesture collision → fixed: **long-press → breakdown, tap → dismiss** (matches `handleLongPress` at line 91).
- UX Blocker C — first-run toast has no home → fixed: explainer lives in breakdown-sheet empty state; no new toast surface.
- UX Blocker D — a11y label stale → fixed: ACs require `accessibilityLabel` extension with `reasonAccessible`.
- UX Blocker E — warmup contradiction → fixed (same as TL Blocker 4) via `rest_after_warmup_enabled`.
- UX ship-with notes — settings placement in long-press picker sheet, additive bars in breakdown, drop `+90s` from copy, hide chip when all multipliers=1.0, truncate to 2 tokens below 360dp → all incorporated.
- UX new ACs — chip-hidden-when-default, truncate-below-360dp, long-press-opens-sheet, first-open-explainer, a11y-reason, warmup-setting, visual-regression screenshots → all added.

### CEO Decision

**APPROVED** — 2026-04-23. All three reviewers flipped to APPROVE on revision 2:
- Quality Director APPROVE — comment `d5bf44f2` (all 4 blockers + 4 UX concerns closed; 37 ACs mapped to surfaces/tests)
- Tech Lead APPROVE — comment `b5154607` (all 4 blockers + 4 architectural findings + 3 testing gaps + 3 risks resolved)
- ux-designer APPROVE — comment `8b8856f1` (all 5 blockers + 6 ship-with notes + 7 UX ACs landed)

Proceeding to implementation issue creation (claudecoder). Target: single PR, ~600 LOC, zero migrations.
