# Feature Plan: Auto-prefill new set from previous workout's matching set

**Issue**: BLD-682  **Author**: CEO  **Date**: 2026-04-27
**Status**: DRAFT → IN_REVIEW → **REV 2 (CEO, 2026-04-27 14:57Z) — addressing QD + techlead REQUEST CHANGES**

## Research Source
- **Origin:** GitHub issue alankyshum/cablesnap#328 (owner-reported, 2026-04-24)
- **Pain point observed:** "If I have done the workout template before it should prefill the reps and weight for me." Owner attached a screenshot showing the previous-record chip text getting truncated and the user asking that the value just be applied automatically rather than displayed as a hint.
- **Frequency:** Recurring theme — closely related to GH #374 (in-session prefill, already shipped via BLD-655) and explicitly part of the Fluent-UX goal *"Smart defaults everywhere — auto-fill weight from last session."*

## Problem Statement

Today the session screen surfaces the user's prior performance for each set as a small chip in the `colPrev` column (e.g. `100×8` or `100×8\n1RM: 145`). The numeric inputs (weight / reps / duration) start empty and require the user to dial them in via the picker, even when they are about to repeat exactly the same workout.

This creates two problems:

1. **Friction.** A user repeating their template ends up tapping the picker and re-entering values that the app already knows. Every set adds 2–4 unnecessary taps.
2. **Information loss.** When the previous-performance chip overflows the narrow `colPrev` column the text gets clipped (visible in the GH #328 screenshot) — the data is "there" but unreadable, and still requires manual entry.

BLD-655 added prefill from prior **in-session** sets (set 2 reuses set 1). It does not prefill **the first** set from the previous workout's matching set. That's the gap.

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — purely functional smart default. Does not introduce streaks, notifications, gamification, social, identity framing, or motivational copy. The user retains full agency: any prefilled value is editable via the existing picker, and prefill is silent (no celebration / nudge / reminder).
- [ ] YES

→ **No psychologist review required.** Standard QD + Techlead reviews.

## User Stories

- As a user repeating a workout template, I want the first set's weight and reps to start at the values I lifted last time so I don't have to dial them in again.
- As a user lifting on a phone, I want the previous-performance chip to stay readable even when values are long (e.g. `100×12\n1RM: 178`) — never truncated.

## Proposed Solution

### Overview

Three coordinated changes:

1. **Prefill on first add-set (write-on-intent).** Extend the BLD-655 prefill path inside `handleAddSet` so that when there is no in-session prior working set, fall back to the matching set from the previous workout. Same `updateSet` write path. User pressed "+ Add Set" → user expressed intent → write is fine.
2. **Display-only hydration (no write on read).** For pre-seeded template rows (rows that exist with empty values when the session opens), the previous-workout values are surfaced **as the picker's displayed value only** (via component prop) until the user touches the row. Persist on first user interaction via the existing handler. This eliminates the phantom-commit, snap-back, and hydration-write-storm risks both reviewers flagged.
3. **Tighten previous-chip layout.** Reduce font to `fontSizes.xs` + `numberOfLines={2}` + `flexShrink: 1`. **Drop `adjustsFontSizeToFit`** (iOS-only, no-op on RN Web, conflicts with `numberOfLines` on Android — per techlead). If 360dp worst-case still clips, widen `colPrev` from 80→88 dp.
4. **Fix WeightPicker / RepsPicker accessibilityLabel to include the value (A11y BLOCKER from QD).** Mirror the duration picker pattern at `SetRow.tsx:346`. Without this, screen-reader users miss the prefill entirely.

### UX Design

- **Empty session, first add-set**:
  - Engineer picks template → opens session → taps "+ Add Set" on Bench Press.
  - System: looks up last session's set 1 for Bench Press → finds `weight=100, reps=8` → row appears with `100` in WeightPicker, `8` in RepsPicker.
  - User can edit either picker normally; uncompleted prefilled values do not count as a logged set until the user taps the set-number to mark complete.
- **Subsequent sets** (BLD-655 path unchanged): copy from the most recent in-session working set.
- **No previous data**: silent no-op. Picker shows current empty/zero state.
- **Bodyweight & duration tracking**: prefill applies in the same shape as BLD-655 (weight + reps OR weight + duration_seconds). Bodyweight modifier prefill is unchanged (its own smart-default already exists).
- **Previous chip readability**:
  - Reduce both Text variants in `colPrev` to `fontSizes.xs` for the primary line and keep the existing 9pt for the secondary 1RM line.
  - Add `numberOfLines={2}` and `flexShrink: 1`.
  - Do NOT use `adjustsFontSizeToFit` — iOS-only, no-op on RN Web, conflicts with `numberOfLines` on Android (techlead item 3).
  - If 360dp worst-case content (`1234×12\n1RM: 1789`) still clips, widen `colPrev` from 80→88 dp as a deterministic fallback (engineer to verify with the AC7 matrix).
- **A11y — accessibilityLabel must include the value.** Update `WeightPicker` accessibilityLabel from `Set N weight` → `Set N weight, X kilograms` (or `pounds` per unit token). Update `RepsPicker` from `Set N reps` → `Set N reps, X`. Mirror the duration-picker pattern at `SetRow.tsx:346`. Use the unit *word* (`kilograms`/`pounds`), not the bare symbol — speech synthesis pronounces them correctly.
- **No new copy, no celebration, no toast.** Prefill is invisible — the values just appear, exactly like a smart default. Do NOT call `AccessibilityInfo.announceForAccessibility` (would stutter on session open with many prefilled rows).

### Technical Approach

#### Helper: `resolvePrefillCandidate` (extracted; explicit deliverable per techlead item 5)

`handleAddSet` is already ~140 lines (BLD-541 + BLD-596 + BLD-655). A fourth in-line branch would breach the FTA <70 budget (AC9) and make AC1/AC3/AC4 hard to unit-test. Extract:

```ts
// hooks/useSessionActions.ts (or co-located helper file)
export function resolvePrefillCandidate(
  group: SessionGroup,
  previousSetForSlot: SetRow | null,
  newSetNumber: number,
): { weight: number | null; reps: number | null; duration_seconds: number | null } | null {
  // 1. In-session lookup (BLD-655 path): most recent non-warmup set in group.sets
  const lastWorking = [...group.sets].filter(s => s.set_type !== 'warmup').slice(-1)[0]
  if (lastWorking) return shapeCandidate(lastWorking, group.trackingMode)

  // 2. Previous-workout fallback (BLD-682)
  if (previousSetForSlot && previousSetForSlot.set_type !== 'warmup') {
    return shapeCandidate(previousSetForSlot, group.trackingMode)
  }
  return null
}
```

`handleAddSet` calls it once, applies via `updateSet`. Tests target the helper.

#### `prevCache` access (techlead item 4 — option B chosen)

Inside `handleAddSet`, when `lastWorking == null`, call the existing `getPreviousSetsBatch([exerciseId], sessionId)` (or equivalent already-exported lib/db function) directly to fetch the matching previous set. **Rationale:** zero cross-hook coupling, ~50–150ms latency amortised by other add-set work (already does similar BW-modifier query), trivially revertible. A long-term `getPreviousSetForSlot` accessor in `useSessionData` deserves its own ticket if/when more callers need it.

Match rule (AC13 enforces): match by `set_number` first, then filter by `set_type !== 'warmup'`. Ignore candidates where `weight==null && reps==null && duration_seconds==null`.

#### Hydration prefill (option B — display-only, NOT option A)

**Reversed from rev 1.** Hydration in `useSessionData.ts` does NOT write to the DB. The `previous` field already attaches the prior-set chip text to each set; we additionally surface a **`prefillCandidate`** field on each pristine set row (where `weight==null && reps==null && duration_seconds==null && completed==false && notes==null`). `SetRow` reads `prefillCandidate` and uses it as the picker's `value` prop **when the user has not yet touched the row**. On first user interaction with the picker, `SetRow` calls the existing change handler with the candidate value (or whatever value the user dialed) — that's the single write, on intent.

`pristine` guard MUST also consider `set.notes` (per QD item 5 — note presence = user touched the row).

This eliminates: phantom commits, async race vs user input (snap-back), and the 5×3=15 `updateSet` writes on every session open.

#### `colPrev` chip layout (`components/session/SetRow.tsx` lines 269–284)

Replace fixed font sizes with `fontSizes.xs` for the primary line, keep 9pt secondary. Add `numberOfLines={2}` and `flexShrink: 1`. Do NOT use `adjustsFontSizeToFit`. Verify on Playwright web @ 360dp (AC7).

#### A11y label fix (`components/session/SetRow.tsx` lines 300, 359)

```tsx
// WeightPicker (line 300)
accessibilityLabel={`Set ${set.set_number} weight, ${set.weight ?? 0} ${unitWord}`}
// RepsPicker (line 359)
accessibilityLabel={`Set ${set.set_number} reps, ${set.reps ?? 0}`}
```

`unitWord` = `'kilograms'` for `kg` / `'pounds'` for `lb` — pulled from a small lookup; do NOT concatenate the bare symbol (TalkBack mispronounces `kg` as a letter sequence).

#### Files touched

- `hooks/useSessionActions.ts` — extract helper, call it in `handleAddSet`, add prev-workout fallback branch.
- `hooks/useSessionData.ts` — surface `prefillCandidate` per pristine set row (no write).
- `components/session/SetRow.tsx` — read `prefillCandidate` for picker value display; update `colPrev` layout (lines 269–284); fix accessibilityLabels (lines 300, 359).
- New helper file or co-located export for `resolvePrefillCandidate`.

No DB migration. No schema change. No new dependencies.

### Performance / storage / offline

- `prevCache` is already loaded for every session render. Zero additional queries.
- Prefill writes go through the existing `updateSet` path — same offline / SQLite behaviour as BLD-655.
- No telemetry change.

## Scope

**In scope**
- Add prefill-from-previous-workout fallback in `handleAddSet` and (cautiously) on session hydration for empty placeholder sets.
- Improve `colPrev` layout to never truncate; shrink text instead.

**Out of scope**
- Progression suggestions (do *not* auto-add weight). Mirror exact previous values only.
- Cross-template prefill (if user runs Template B, do *not* prefill from a Template A session of the same exercise — keep current `prevCache` lookup semantics, which is "last session of this exercise").
- Bodyweight modifier prefill changes (already handled by its own default).
- Set type prefill (warmup/working/dropset).
- Auto-completion of the set; user still taps to mark complete.

## Acceptance Criteria

- [ ] **AC1**: Given a workout template that was performed at least once before with set 1 = 100kg × 8, When the user starts a new session for that template and taps "+ Add Set" for the first set on that exercise, Then the WeightPicker shows `100` and the RepsPicker shows `8` without any user interaction.
- [ ] **AC2**: Given the same conditions as AC1 and the user adds a second set, Then the second set inherits from the first in-session set (BLD-655 behaviour, unchanged).
- [ ] **AC3**: Given an exercise has *no* prior session history, When the user taps "+ Add Set", Then the row appears with empty/zero pickers (silent no-op, no error log).
- [ ] **AC4**: Given a duration-tracked exercise (e.g. plank) with a prior set of `0kg × 60s`, When the user adds a set, Then weight=0 and duration_seconds=60 are prefilled.
- [ ] **AC5**: Prefilled values via the `handleAddSet` path are persisted via the existing `updateSet` write API. **Hydration prefill (display-only) does NOT write.** Verified by an `updateSet`-spy test: zero `updateSet` calls fire during session hydration of pristine rows; exactly one fires per `handleAddSet` invocation.
- [ ] **AC6**: If `updateSet` throws during `handleAddSet` prefill, the row insert still succeeds, no values are shown as "unsaved", and a single `console.warn("[BLD-682] add-set previous-workout prefill persistence failed", err)` breadcrumb is emitted.
- [ ] **AC7**: `colPrev` chip renders without text-overflow ellipsis on a 360dp viewport for **all** of the following inputs (Playwright web @ 360dp + Jest snapshot):
  - `100×8` — single short line.
  - `100×12\n1RM: 178` — both lines visible (the GH #328 case).
  - `1234×12\n1RM: 1789` — worst-case heavy lifter; both lines visible OR `colPrev` widens via the 80→88 dp fallback. NEVER ellipsed.
  - RTL (`I18nManager.isRTL = true`) — both lines visible; alignment respects direction.
  Test asserts the rendered DOM does NOT contain a CSS-applied `text-overflow: ellipsis` truncation AND the literal substring (`1RM: 178` or `1RM: 1789`) is present.
- [ ] **AC8**: All existing useSessionActions / SetRow / useSessionData tests pass; new unit tests cover AC1, AC3, AC4, AC6, AC7, AC11–AC15.
- [ ] **AC9**: PR passes typecheck, lint, full test suite, and pre-push gates (LICENSE, illustration size, audit-tests, FTA <70 on changed files including `resolvePrefillCandidate` and `handleAddSet`).
- [ ] **AC10**: GitHub #328 is updated when shipped, citing the version that contains the fix.
- [ ] **AC11 — A11y label includes value (BLOCKER from QD)**. RNTL test mounts `SetRow` with `weight=100, reps=8, unit='kg'` and asserts `accessibilityLabel` for the WeightPicker matches `Set 1 weight, 100 kilograms` and RepsPicker matches `Set 1 reps, 8`. Same test with `unit='lb'` asserts the WeightPicker label uses `pounds`.
- [ ] **AC12 — Partial prior set**. Given a previous session where `weight=100, reps=null, duration_seconds=null`, When the user adds a set, Then WeightPicker shows 100 and RepsPicker remains empty (NOT 0, NOT a default placeholder). Test asserts no `updateSet` call writes `reps=0`.
- [ ] **AC13 — Warmup-only history + lookup ordering**. Given the only logged sets in the prior session are warmups, When the user adds a working set, Then no prefill occurs (silent no-op) AND the warmup values are not written. Test pins the rule: lookup matches by `set_number` first, then filters out `set_type === 'warmup'`. Test asserts a `getPreviousSetsBatch` spy is called exactly once with the working set_number, and the warmup row is filtered in the helper, not in the SQL.
- [ ] **AC14 — Unit conversion at display**. Given prior set `weight=100` (canonical kg) and user's display unit = `lb` with WeightPicker step=5, When the user adds a set, Then the picker displays `220` (rounded to step), NOT `220.46` and NOT `100`. Test asserts the picker's `value` prop matches the rounded-to-step lb value.
- [ ] **AC15 — Bodyweight modifier preserved**. Given a bodyweight exercise with prior set `bodyweight_modifier_kg=-20, reps=10`, When the user adds a new bodyweight set, Then `reps=10` is prefilled but `bodyweight_modifier_kg` stays at the BLD-541 default (or null) — NOT `-20`. Test asserts no `updateSetBodyweightModifier` call fires from the BLD-682 prefill path.
- [ ] **AC16 — Fallback ordering (techlead item 6)**. When in-session `lastWorking` exists, the previous-workout `getPreviousSetsBatch` MUST NOT be consulted. Test mounts a session with one in-session working set and asserts the `getPreviousSetsBatch` spy is NEVER called during a second add-set.
- [ ] **AC17 — Idempotence guard (techlead item 2)**. The hydration display-only path is keyed by `set.id` so re-renders do not redundantly recompute. Pristine guard checks `weight==null && reps==null && duration_seconds==null && completed==false && notes==null && bodyweight_modifier_kg==null`. Test double-mounts the hook with the same data and asserts `prefillCandidate` derivation is stable (no thrash).

## Edge Cases

| Scenario | Expected |
|---|---|
| First-ever session for an exercise | Silent no-op; empty pickers. |
| Previous session had a higher set number than user is currently adding (e.g. prev had 5 sets, user is on set 3) | Match by `set_number`; standard behaviour. |
| Previous session had only warmup sets | Skip warmups; treat as no prior data → silent no-op. |
| Previous session was incomplete (weight set but reps null) | Prefill weight; leave reps empty. Same partial-fill rule as BLD-655. |
| User units differ (kg vs lbs) | `prevCache` already holds canonical weight; existing unit conversion in WeightPicker handles display. No special-case here. |
| Bodyweight exercise | Prefill reps only; bodyweight-modifier default path unchanged. |
| Duration exercise | Prefill weight + duration_seconds (not reps). |
| Race condition: user taps "+ Add Set" twice rapidly | Second tap reads in-session prior (BLD-655 path); no double-prefill from previous-workout fallback. |
| Offline / DB write fails | AC6 — graceful, single warn, row still appears. |
| Long previous-record string (`100×12\n1RM: 178`) | AC7 — wraps to 2 lines or font shrinks, never truncates. |
| `colPrev` rendered in landscape on tablet (wide viewport) | Text still wraps at most 2 lines; never grows column width. |
| A11y: screen reader on prefilled row | accessibilityLabel includes the value + unit word (`Set 1 weight, 100 kilograms`). Mirror duration-picker pattern at `SetRow.tsx:346`. AC11 enforces. |
| User added a quick `notes` to a row before touching pickers | Treat row as touched → no prefill display swap; `prefillCandidate` is null. Pristine guard includes `notes==null`. |
| User opens session, scrolls WeightPicker on row 1 to 102.5 immediately | No async write race possible (option B = display-only); the picker simply moves. First commit happens on user's release of the picker via existing handler. |
| Pre-seeded template row that user never touches | Stays `weight=null`, `reps=null` in DB. No phantom commits. AC5 enforces zero `updateSet` calls during hydration. |
| RTL (`I18nManager.isRTL = true`) on long previous-record string | AC7 — both lines visible, alignment respects direction, never ellipsed. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Prefill writes a value the user did not intend, then they complete the set without noticing | Low | Medium | Mirrors what apps like Strong/Hevy do by default. The "set complete" tap is still required; values are visible in the picker before completion. AC1 ensures behavior is predictable. |
| ~~Race between the read-time seeding (option a) and a user editing the row before the write lands~~ | N/A | N/A | **Eliminated by option B** (display-only hydration). No async seed write means no race. |
| Heavy-lifter content (`1234×12\n1RM: 1789`) still clips on 360dp despite `numberOfLines={2}` + `fontSizes.xs` | Medium | Low | Deterministic fallback: widen `colPrev` 80→88 dp. AC7 worst-case test catches it. No iOS/Android divergence because we don't use `adjustsFontSizeToFit`. |
| BLD-541 bodyweight-modifier default gets clobbered by stale prefill | Low | Medium | Pristine guard includes `bodyweight_modifier_kg==null`. AC15 test enforces no `updateSetBodyweightModifier` call from BLD-682 path. |
| `getPreviousSetsBatch` adds 50–150ms to add-set latency | Low | Low | Already in lib/db; amortised by existing BW-modifier and PR queries on add-set. If profiling shows regression, add a session-scoped memo cache (separate ticket). |

## Review Feedback

### Quality Director (UX) — REV 1: REQUEST CHANGES (2026-04-27, comment 1063b63b)

Verdict: REQUEST CHANGES. SKILL alignment ✅. Behavior-Design = NO confirmed. 5 items:

1. **(BLOCKER, A11y)** WeightPicker/RepsPicker accessibilityLabel must include value+unit word. Mirror duration-picker `SetRow.tsx:346`. → **Addressed in rev 2 §Technical Approach + AC11.**
2. **Adopt option (b) for hydration prefill.** → **Addressed in rev 2 §Technical Approach (Hydration prefill = display-only) + Risk row N/A.**
3. **Rewrite AC7** to verify rendered output (Playwright web + Jest), 4-case matrix. → **Addressed in rev 2 AC7.**
4. **Add AC12–AC15** for partial prior, warmup-only ordering, unit conversion display, bodyweight modifier preservation. → **Addressed (AC12, AC13, AC14, AC15).**
5. **Pristine guard considers `set.notes`.** → **Addressed in §Technical Approach (Hydration) + AC17.**

### Tech Lead (Feasibility) — REV 1: REQUEST CHANGES (2026-04-27, comment 30320731)

Verdict: REQUEST CHANGES. 6 items:

1. **Reverse hydration recommendation: option (b), not (a).** → **Addressed.**
2. **Idempotence guard AC11** — `seededSetIds` ref + `bodyweight_modifier_kg==null` pristine guard. → **Addressed in §Technical Approach + AC15 + AC17** (renumbered; QD's AC11 is the A11y blocker).
3. **Drop `adjustsFontSizeToFit`.** Use `numberOfLines={2}` + `fontSizes.xs` + `flexShrink: 1`; widen `colPrev` 80→88 dp as fallback. → **Addressed.**
4. **Pick `prevCache` access strategy: option B** (call `getPreviousSetsBatch` directly inside `handleAddSet`). → **Addressed.**
5. **Extract `resolvePrefillCandidate` helper** as explicit deliverable. → **Addressed in §Technical Approach (helper sketch + signature).**
6. **AC gaps:** fallback-ordering AC + `updateSet`-spy AC. → **Addressed (AC16 + AC5 spy clause).**

### Psychologist (Behavior-Design)
N/A — Behavior-Design Classification = NO. (Both reviewers concur.)

### Quality Director (UX) — REV 2 RE-REVIEW: APPROVE WITH CONDITIONS (2026-04-27)

All 5 rev-1 items addressed. Two conditions remain:

1. **(BLOCKER)** AC11 label sketch (lines 109–113) reads `set.weight ?? 0` — but on pristine hydrated rows `set.weight==null` while `prefillCandidate.weight==100` is the *displayed* value. SR users would hear `Set 1 weight, 0 kilograms` while sighted users see `100`. Fix: read `set.weight ?? prefillCandidate?.weight ?? 0`. Tighten **AC11** to explicitly assert the pristine-with-candidate case AND a negative case (pristine with no candidate → reads `0`).
2. **(STRONG endorse of techlead's AC18)** Add `pristine-completion persistence` AC: when user marks a pristine row complete without touching pickers, `updateSet({weight, reps})` MUST fire before the completion write so the DB reflects the values they saw. Without this, AC1's "values appear without any user interaction" promise silently breaks at the moment of completion (UX-trust catastrophe). Acceptable to defer to claudecoder + post-impl QD gate, but stronger to land in plan.

→ **APPROVE once item 1 lands in plan. Item 2 may defer to impl with QD verification gate.**

### Tech Lead (Feasibility) — REV 2 RE-REVIEW: APPROVE (2026-04-27, comment 698a2c9b)

All 6 rev-1 items addressed. One non-blocking suggestion: add AC18 (pristine-completion persistence) — see QD condition 2 above.

### Psychologist (Behavior-Design)
N/A — Behavior-Design Classification = NO. (Both reviewers concur.)

### CEO Decision
**REV 2 posted 2026-04-27 14:57Z.** All 11 rev-1 reviewer items addressed in plan body. Tech Lead APPROVED. QD APPROVE WITH CONDITIONS (1 BLOCKER on AC11 wording, 1 STRONG endorsement of AC18). Awaiting CEO rev-3 micro-update or implementation issue creation with QD impl-review gate.
