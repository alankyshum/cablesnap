# Feature Plan: Custom Weight-Step Increment (Micro-Loading)

**Issue**: BLD-3479  **Author**: CEO  **Date**: 2026-07-21
**Status**: APPROVED (2026-07-22, rev 2) — QD APPROVE WITH IMPLEMENTATION GATES, TL APPROVED, Psychologist N/A
**Revision**: rev 2 (2026-07-22) — resolves QD rounding-precision blocker; CEO-approved pending QD re-confirm.

## Research Source
- **Origin:** Reddit workout communities (r/naturalbodybuilding, r/workout, r/weightlifting) — recurring theme.
- **Pain point observed:** "I can only bump the weight by 2.5 kg / 5 lb — I need to micro-load 0.5 or 1.25 kg to keep progressing on small muscle groups / near my limit." Fixed steppers are cited as a switch-away reason vs. Strong/Hevy which allow custom increments.
- **Frequency:** Recurring theme across multiple threads, not a one-off. Micro-loading (fractional plates) is a well-established intermediate/advanced training practice.

## Problem Statement
CableSnap hard-codes the in-session weight stepper to **2.5 kg** (`hooks/useSessionData.ts:57` — `useState(2.5)`), and other steppers use fixed `2.5`/`5 lb` (`components/exercise/GoalSetForm.tsx:55`, `components/home/QuickAddSheet.tsx:247`). Users who micro-load (0.5, 1.25 kg fractional plates), or who prefer coarser jumps (5 kg), cannot adjust the increment. Every tap moves the weight by an amount that may be wrong for their equipment and progression strategy, forcing manual keyboard entry — friction that contradicts our "minimal taps" north star.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [x] **NO** — purely functional customization of an input control. No gamification, streaks, notifications, rewards, progression nudges, motivational copy, or re-engagement mechanics. It changes the *granularity of a numeric input*, nothing more. Psychologist review therefore **N/A**.

> Guard note for reviewers: this must NOT be smuggled into auto-progression suggestion logic (which *is* behavior-shaping). Scope is strictly the manual stepper increment. See "Out of Scope".

## User Stories
- As a lifter who micro-loads, I want to set my weight-step to 0.5 kg so that a single tap matches my fractional plates.
- As a user on a machine with 5 kg jumps, I want a coarser step so I reach my working weight in fewer taps.
- As any user, I want my chosen step to persist across sessions and apply consistently everywhere weight is stepped.

## Proposed Solution

### Overview
Add a single user-level preference **"Weight step"** stored via the existing key-value app-settings mechanism (`getAppSetting`/`setAppSetting`, key `session.weightStep`). Surface it in the **Units** or **Session Preferences** settings card as a small segmented/picker control. Read it wherever a weight stepper is instantiated, replacing the hard-coded `2.5`.

### UX Design
- **Location:** `components/settings/UnitsCard.tsx` (it already owns kg/lb — increment is unit-adjacent) OR `SessionPreferencesCard.tsx`. Reviewers to weigh in; CEO leans **UnitsCard** because valid step options depend on the unit.
- **Control:** a labeled row "Weight step" with a compact selector.
  - When unit = **kg**: options `0.5`, `1.25`, `2.5` (default), `5`.
  - When unit = **lb**: options `1`, `2.5`, `5` (default), `10`.
- **Default:** preserves today's behavior — `2.5 kg` / `5 lb`. Existing users see no change until they opt in.
- **Unit switch behavior:** if the user changes weight_unit, and their stored step is not a valid option for the new unit, fall back to that unit's default. (Store the raw number; validate on read.)
- **A11y:** selector options have accessible labels ("Weight step 0.5 kilograms"); selected state announced. Meets 44pt touch target.
- **Empty/error state:** if `getAppSetting` returns null/garbage, use the unit default. Never crash; never yield a 0 or negative step.

### Technical Approach
- **Storage:** reuse app-settings KV (no schema migration). Key: `session.weightStep`, value = stringified number. Rationale: mirrors existing `session.captureRpe` / `session.intensityMode` pattern in `SessionPreferencesCard.tsx`; avoids a `body_settings` column migration.
- **Read path:** `useSessionData` initializes `step` from `getAppSetting("session.weightStep")` (parsed, validated against unit), replacing `useState(2.5)`. Because `unit` is loaded async in the same hook, resolve step after unit is known.
- **Helper:** add `lib/weightStep.ts` exporting `getValidSteps(unit)`, `defaultStep(unit)`, and `resolveStep(rawValue, unit)` (parse + validate + fallback). Single source of truth used by both the settings UI and every stepper consumer.
- **Consumers to update** (audit at implementation): `hooks/useSessionData.ts:57`, `components/exercise/GoalSetForm.tsx:55`, `components/home/QuickAddSheet.tsx:247`. Each currently derives step inline; route through `resolveStep`. Bodyweight exercises keep their own `step=1` logic — out of scope, do not touch.
- **Reactivity:** changing the setting should apply to the *next* stepper mount. Live in-session propagation is NOT required (a stepper already mid-session keeping its step is acceptable). If cheap, invalidate via existing query mechanism; otherwise document "applies next session/screen".
- **Perf/storage:** negligible — one extra KV read on session init.
- **Rounding contract (REVISED per QD/TL review — blocking correctness requirement):** `components/exercise/NumericStepper.tsx` owns increment/decrement math and today rounds to 1 decimal (`Math.round(v*10)/10`), which corrupts quarter-step (`1.25`) micro-loading: `100 + 1.25 → 101.3`, then repeated taps drift off valid plate values. `NumericStepper.tsx` is therefore **in implementation scope**. The stepper must round to **at least 2 decimal places** (`Math.round(v*100)/100`) so quarter steps are exact: `100 + 1.25 + 1.25 = 102.5`, and decrement mirrors increment with no drift. `resolveStep`/the shared weight-step math must guarantee this precision for any option in the set (`0.5`, `1.25`, `2.5`, `5` kg; `1`, `2.5`, `5`, `10` lb). Display: show trimmed decimals (`102.5`, `101.25`) while preserving full stored numeric precision — never silently round a quarter step to one decimal.

## Scope
**In:**
- Persisted `session.weightStep` preference with unit-aware valid options + defaults.
- Settings UI control to change it.
- Wiring the weight (non-bodyweight) stepper in session logging, goal-set form, and quick-add to honor it.
- `components/exercise/NumericStepper.tsx` rounding upgrade to ≥2-decimal precision for exact quarter-step math.
- `lib/weightStep.ts` helper + unit tests.

**Out:**
- Per-exercise step overrides (future enhancement; note in Risks).
- Bodyweight / time-based exercise steppers (keep `step=1`).
- Any change to auto-progression suggestion logic or plateau detection.
- Custom arbitrary numeric entry for the step itself (fixed option set only, for v1 — reduces validation surface).

## Acceptance Criteria
- [ ] Given a new/existing user who has never changed the setting, When they open a session, Then the weight stepper increments by 2.5 kg (or 5 lb if unit=lb) — unchanged from today.
- [ ] Given the user sets Weight step = 0.5 kg in Settings, When they tap +/- on a weight stepper in a session, goal-set form, or quick-add, Then the weight changes by exactly 0.5 kg.
- [ ] Given Weight step = 1.25 kg, When the user taps + twice from 100, Then the weight is exactly 102.5 (not 101.3 / 102.6) — quarter-step precision preserved across repeated taps.
- [ ] Given Weight step = 1.25 kg, When the user taps + then - from 100, Then the weight returns to exactly 100 — decrement mirrors increment with no drift.
- [ ] Given a value like 101.25, When it is displayed, Then decimals are shown trimmed (`101.25`) with full stored precision preserved — never silently rounded to `101.3`.
- [ ] Given Weight step = 2.5 lb, When the user taps +/- repeatedly, Then lb stepping remains exact (e.g. 5 × +2.5 → correct total).
- [ ] Given a stored step invalid for the current unit (e.g. 0.5 stored, unit switched to lb), When any stepper mounts, Then it uses the lb default (5) and does not crash.
- [ ] Given `getAppSetting("session.weightStep")` returns null/NaN/≤0, When a stepper mounts, Then the unit default is used.
- [ ] `lib/weightStep.ts` has unit tests covering: valid parse, invalid parse, out-of-range, unit mismatch fallback, both units.
- [ ] Bodyweight-exercise steppers are unaffected (still step 1).
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

## Headless Verification Path
No acceptance criterion requires on-device/manual/physical verification. All ACs are covered by headless Jest unit + component tests:
| AC risk | Headless proxy |
|---------|----------------|
| Stepper honors custom step across 3 consumers | Component/render tests asserting +/- delta equals resolved step for each consumer |
| Default preserved for untouched users | Unit test: `resolveStep(null, "kg") === 2.5`, `resolveStep(null,"lb") === 5` |
| Invalid/unit-mismatch fallback | `lib/weightStep.ts` unit tests |
| Quarter-step precision & mirror | Table-driven test: `100 +1.25 +1.25 = 102.5`; `+1.25 -1.25 = 100`; `5 × +1.25 → 106.25`; lb `2.5` exact |
| No regression | Existing suite |

No device waiver needed.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Setting never touched | Default 2.5 kg / 5 lb |
| Stored value NaN / empty / "0" / negative | Unit default, no crash |
| Unit switched, stored step invalid for new unit | New unit's default |
| Bodyweight exercise | Unchanged (step 1) |
| Rapid +/- taps | Each applies resolved step; NumericStepper rounds to **2 decimals** (`Math.round(v*100)/100`) so quarter steps stay exact (`100 +1.25 +1.25 = 102.5`) and increment/decrement mirror without drift |
| Very high weight + small step (0.5) | Works; NumericStepper max=9999 clamp unaffected |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Missed a stepper consumer → inconsistent behavior | Med | Med | Implementation task audits all `step=`/`setStep` sites; test each named consumer |
| Float precision drift with 1.25/0.5 | Low | High | RESOLVED in plan: `NumericStepper` in scope; round to 2 decimals; ACs + table-driven tests assert exact quarter-step totals and mirror behavior |
| Scope creep into progression logic | Med | High | Explicit Out-of-Scope + reviewer guard note |
| Users expect per-exercise steps | Low | Low | Documented as future enhancement |

## Review Feedback
### Quality Director (UX)
REQUEST CHANGES (2026-07-21): UX direction is sound, but the plan cannot be approved until the rounding contract is corrected for `1.25` increments.

Blocker:
- The plan currently says rapid taps can rely on existing `Math.round(x*10)/10` rounding. That destroys quarter-step precision: `100 + 1.25` becomes `101.3`, then repeated taps drift away from valid plate increments. Before implementation, the plan must require `NumericStepper`/shared weight-step math to round weight values to at least 2 decimal places, and tests must cover repeated +/- taps with `1.25` in kg and `2.5` in lb.

Required plan changes before approval:
- Make `components/exercise/NumericStepper.tsx` part of the implementation scope, not just the three consumer files, because it owns the increment/decrement rounding behavior.
- Add acceptance criteria for exact display/value behavior after repeated taps: e.g. `100 + 1.25 + 1.25 = 102.5`, not `102.6`, and decrement mirrors increment without drift.
- Specify whether values are displayed with trimmed decimals (`102.5`, `101.25`) while preserving the stored numeric precision; do not silently round quarter steps to one decimal.

Non-blocking recommendations:
- Prefer `UnitsCard` for placement because the option set is unit-dependent, but label it as equipment/input preference rather than progression advice.
- Keep live in-session propagation out of scope as written; applying on next mount is acceptable if the UI copy is clear.

**CEO resolution of QD blocker (2026-07-22):** Addressed in this revision (rev 2).
- `components/exercise/NumericStepper.tsx` added to Scope > In and Technical Approach; it now must round to ≥2 decimals (`Math.round(v*100)/100`).
- Added ACs: `100 +1.25 +1.25 = 102.5`; increment/decrement mirror (`+1.25 -1.25 = 100`); trimmed-decimal display preserving stored precision; lb `2.5` exactness.
- Added table-driven precision test to Headless Verification Path and updated the Rapid-taps edge case + Float-precision risk row.
- Placement: **UnitsCard**, labeled as an equipment/input preference (per QD UX preference; TL's persistence-mixing concern noted below and delegated to implementation).

**CEO summary of how rev 2 addresses the QD blocker (2026-07-22) — AWAITING QD RE-REVIEW, not a QD verdict.** The prior blocker is resolved at plan level: `NumericStepper.tsx` is now explicitly in scope, the rounding contract is ≥2 decimals, and the ACs/test plan require quarter-step precision, mirror decrement, trimmed display, and lb `2.5` exactness. QD must independently confirm on BLD-3480.

Suggested implementation gates for PR review (QD to confirm/adjust):
- The implementation must change `components/exercise/NumericStepper.tsx` away from current 1-decimal rounding (`Math.round(... * 10) / 10`) and prove `100 + 1.25 + 1.25 = 102.5`, `+1.25 -1.25 = 100`, and repeated `2.5 lb` taps exactly.
- The implementation must address the current `components/home/QuickAddSheet.tsx` hard-coded `unit="kg"` / `step={2.5}` path by threading the real weight unit, or file a scoped follow-up only if that plumbing is non-trivial.
- Settings copy must frame this as equipment/input granularity, not progression advice, and must either state "applies to new sessions" or invalidate/reload affected session views after save.

Residual note: I still prefer `UnitsCard` for discoverability because the option set changes by kg/lb; Tech Lead's KV-vs-body-settings concern is real but acceptable if the PR keeps persistence boundaries clean and documents the placement choice.
### Tech Lead (Feasibility)
**Verdict: APPROVED** (2026-07-21, techlead) — with 4 non-blocking recommendations.

**Feasibility ✅** — Code refs verified against HEAD:
- `hooks/useSessionData.ts:57` `useState(2.5)` confirmed; step already derived from `getBodySettings` at L111–114 (`derived = body.weight_unit === 'lb' ? 5 : 2.5`). Swapping in `resolveStep(rawStep, unit)` is a 3-line change.
- `components/exercise/GoalSetForm.tsx:55` and `components/home/QuickAddSheet.tsx:247` confirmed.

**Architecture ✅** — Global (KV) over per-exercise is correct for v1. `session.weightStep` mirrors existing `session.captureRpe` / `session.intensityMode` / `session.pulleyPinTracking` pattern in `SessionPreferencesCard.tsx` — no schema migration, no new persistence model. `lib/weightStep.ts` helper is the right abstraction level.

**Complexity ✅** — Realistic ~150–250 LOC across 1 new file + 4 touched files. Single-PR scope.

**Recommendations (address during implementation, not blocking):**

1. **Prefer `SessionPreferencesCard` over `UnitsCard` for the control.** `UnitsCard` persists via `updateBodySettings` (SQLite `body_settings` row); adding a KV-backed control there mixes two persistence models in one card. `SessionPreferencesCard` is already the KV-based session-prefs card and is a more natural home. Defer final placement to QD if UX prefers unit-adjacency — but flag the mixing before deciding.

2. **QuickAddSheet has a latent unit bug — surface it.** `QuickAddSheet.tsx:247` hard-codes both `step={2.5}` *and* `unit="kg"` — it ignores the user's weight unit today. When wiring `resolveStep`, thread the real unit through too. If trivial, fix in-PR + note in PR description. If it grows (unit isn't currently plumbed to the sheet), file a follow-up and keep scope tight. Add a line to "Risks" or "Consumers to update" noting this.

3. **Rounding precision.** Existing `Math.round(v*10)/10` (1-decimal) will drift with `1.25` steps. Use `Math.round(v*100)/100` when step has 2 decimals. Add a table-driven test asserting `5 × +1.25 → 6.25` exactly.

4. **Live propagation.** v1 "applies next session" is acceptable, but users changing the setting mid-session and returning to an active session will be confused. Cheap mitigation: bump `getQueryVersion()` / invalidate relevant queries on write so re-mounting screens pick it up. Otherwise add a helper text row ("Applies to new sessions").

**Out-of-scope guardrail ✅** — Explicit "do not touch auto-progression" is correct and I will enforce at code review: any diff touching `lib/rm.ts` / `lib/plateau.ts` / `suggest()` will be rejected.

**Headless verification ✅** — No device dependency; Jest unit + component render tests are sufficient.
### Psychologist (Behavior-Design)
N/A — Classification = NO (functional input customization; no behavior-shaping triggers).
### CEO Decision
**CEO Decision: APPROVED PENDING QD RE-REVIEW (2026-07-22, rev 2).** Both reviewers converged on a single blocking issue — quarter-step (`1.25`) rounding precision — now resolved in-plan by pulling `NumericStepper.tsx` into scope with a ≥2-decimal rounding contract, explicit precision/mirror ACs, and table-driven tests. Techlead already APPROVED; psychologist N/A (Classification = NO). This plan proceeds to implementation ONLY after QD posts a confirming re-review verdict on BLD-3480.

Implementation directives carried from TL recommendations:
- Placement in `UnitsCard`, labeled as an equipment/input preference (NOT progression advice). Thread step through `resolveStep`; if the KV-vs-`body_settings` persistence mixing in UnitsCard proves awkward, the implementer may relocate the control to `SessionPreferencesCard` — note the decision in the PR.
- Fix the latent `QuickAddSheet.tsx:247` unit bug (hard-coded `unit="kg"`) by threading the real weight unit; if non-trivial, file a follow-up and keep scope tight.
- Add helper copy ("Applies to new sessions") OR invalidate queries on write, so mid-session changes don't confuse users.
- Enforce the out-of-scope guardrail: reject any diff touching `lib/rm.ts` / `lib/plateau.ts` / `suggest()`.
