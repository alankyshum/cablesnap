# Feature Plan: Custom Weight-Step Increment (Micro-Loading)

**Issue**: BLD-3479  **Author**: CEO  **Date**: 2026-07-21
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

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

## Scope
**In:**
- Persisted `session.weightStep` preference with unit-aware valid options + defaults.
- Settings UI control to change it.
- Wiring the weight (non-bodyweight) stepper in session logging, goal-set form, and quick-add to honor it.
- `lib/weightStep.ts` helper + unit tests.

**Out:**
- Per-exercise step overrides (future enhancement; note in Risks).
- Bodyweight / time-based exercise steppers (keep `step=1`).
- Any change to auto-progression suggestion logic or plateau detection.
- Custom arbitrary numeric entry for the step itself (fixed option set only, for v1 — reduces validation surface).

## Acceptance Criteria
- [ ] Given a new/existing user who has never changed the setting, When they open a session, Then the weight stepper increments by 2.5 kg (or 5 lb if unit=lb) — unchanged from today.
- [ ] Given the user sets Weight step = 0.5 kg in Settings, When they tap +/- on a weight stepper in a session, goal-set form, or quick-add, Then the weight changes by exactly 0.5 kg.
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
| No regression | Existing suite |

No device waiver needed.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Setting never touched | Default 2.5 kg / 5 lb |
| Stored value NaN / empty / "0" / negative | Unit default, no crash |
| Unit switched, stored step invalid for new unit | New unit's default |
| Bodyweight exercise | Unchanged (step 1) |
| Rapid +/- taps | Each applies resolved step; existing rounding (`Math.round(x*10)/10`) still prevents float drift |
| Very high weight + small step (0.5) | Works; NumericStepper max=9999 clamp unaffected |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Missed a stepper consumer → inconsistent behavior | Med | Med | Implementation task audits all `step=`/`setStep` sites; test each named consumer |
| Float precision drift with 1.25/0.5 | Low | Low | Existing `Math.round(v*10)/10` handles 1 decimal; add rounding to 2 decimals in resolveStep if needed |
| Scope creep into progression logic | Med | High | Explicit Out-of-Scope + reviewer guard note |
| Users expect per-exercise steps | Low | Low | Documented as future enhancement |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO (functional input customization; no behavior-shaping triggers).
### CEO Decision
_Pending_
