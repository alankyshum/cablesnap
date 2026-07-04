# Feature Plan: Double-Progression Suggestions (rep-range aware "Next:" pill)

**Issue**: BLD-2979 (parent research task: BLD-2978)
**Author**: CEO
**Date**: 2026-07-04
**Status**: APPROVED (psychologist + tech-lead + QD all cleared; QD re-review APPROVED/LGTM 2026-07-04 — implementation issue created)

## Research Source

- **Origin:** BLD-2978 daily product-evolution research (2026-07-04). Reddit + competitor analysis via `search-web.py` of Strong, Hevy, JEFIT, FitNotes, Setgraph.
- **Pain point observed (users' own words):**
  - Strong "does not provide a *nudge* for progressive overload... a major **missing feature** for serious lifters." Users "cannot periodize (increase loads / decrease reps over weeks)."
  - Users "switch to Hevy because it includes the missing **progressive overload** and periodization features."
  - Setgraph is recommended specifically for "efficient **progressive overload** tracking... easy to see your previous performance instantly."
- **Frequency:** Recurring theme across r/strongapp, r/fitness, r/xxfitness competitor threads — not a one-off rant. Progressive overload is the single most-cited "serious lifter" gap in the tracker category.

## Problem Statement

CableSnap already has a strong progression engine. `lib/rm.ts:suggest()` powers the in-session **"Next:" pill** and, for **weighted (non-bodyweight)** lifts, implements **linear progression**:

> If you completed all sets last session and your reps did not drop → suggest **+1 step** (2.5 kg / 5 lb).

The problem: **linear progression is the wrong default for most hypertrophy/accessory training and for cable + bodyweight-adjacent work** — the exact niche CableSnap targets. Adding 2.5 kg every session to a lateral raise or a cable fly is unsustainable within a handful of sessions. The scheme serious lifters actually want, and that competitors fail to deliver, is **double progression**:

> Within a target rep range (e.g. **8–12**): first **add reps** each session until you hit the **top** of the range on all sets. Only *then* **add weight** and **reset reps to the bottom** of the range.

CableSnap already stores the needed input — `template_exercises.target_reps` (default `"8-12"`) — and has a parser (`parseTemplateTargetReps`). But two gaps block double progression:

1. `parseTemplateTargetReps` extracts only the **first number** (the min), discarding the max. There is no range parser.
2. `suggest()` **never receives the rep range** — it is called `suggest(recent, derived, bw)` with only a global step and a bodyweight flag. So for weighted lifts it can only ever propose "same reps, +weight," never "same weight, +reps within range."

**User emotion today:** "The Next pill keeps telling me to add 2.5 kg to my cable curls every single session. That's not how curls work — I want to build up reps first."

**User emotion after:** "The Next pill knows my 8–12 range. It walks my reps up to 12, then bumps the weight and drops me back to 8. That's exactly how I'd program it myself."

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see AGENTS §3.2 trigger list)

- [x] **NO** — purely functional/informational. This changes the *math* behind an **existing, pull-based** suggestion control (the "Next:" pill the user must tap to apply). It adds **no** new trigger, notification, streak, reward, XP, social surface, goal-commitment, or motivational copy. The pill already exists, is already opt-in per-tap, and already explains itself via `SuggestionExplainerModal`. We are making an existing recommendation smarter, not introducing a new behavior loop.
- [ ] YES

> **Psychologist scoping check requested regardless.** Per AGENTS §3.2 ("when unsure whether a feature is behavior design, just ask — cheap"), the psychologist is asked to **confirm or reject this NON classification**. If they deem the rep-range walk-up a "progression/mastery" behavior surface that needs the full framework, we will run it. I assess the risk as low because the control is inert until tapped and carries no framing, streak, or loss language.

## User Stories

- As a hypertrophy/accessory lifter, I want the Next pill to walk my reps up within my target range before adding weight, so the suggestion is actually sustainable.
- As a cable/isolation lifter, I want progression that respects a rep range, because micro-loading a cable stack every session is not realistic.
- As a lifter who sets a rep range on a template, I want that range to *mean something* to the app's suggestions, not just be a static label.
- As a lifter with **no** template rep range (ad-hoc workout), I want the current linear behavior preserved — nothing should regress.

## Proposed Solution

### Overview

Teach `suggest()` about an optional **rep range** `{ min, max }`. When a range is present for a weighted lift, switch from linear to **double progression**. When no range is present, **preserve today's exact linear behavior** (full backward compatibility).

### Data flow (range plumbing + warmup filter are the net-new wiring)

```
template_exercises.target_reps ("8-12")
      │  parseTemplateRepRange()  ← NEW pure helper (min & max)
      ▼
useSessionData.ts  ──►  NEW getTemplateById() in steady-state load (null-guarded)
      │                 getRecentExerciseSetsBatch() ← NEW: also SELECT set_type
      ▼
suggest(recent, step, bw, repRange?)   ← extend signature; dispatch to suggestDouble()
      │                                   (working sets only; warmups excluded)
      ▼
Suggestion { type, weight, reps, reason }   ← type gains "weight_and_rep_reset"
      ▼
LastNextRow.tsx  ← formatNextLabel / formatNextA11y / applyNextFill ALL extended
SuggestionExplainerModal.tsx  ← add the double-progression explanation case
```

### Double-progression algorithm (weighted lifts, range present)

Given last session's attempted working sets, the parsed range `{min, max}`, and `step`:

1. **Guardrails first — unchanged priority order:**
   - RPE ≥ 9.5 on any set → `maintain` (reason: "RPE ≥ 9.5 — maintain"). *(existing)*
   - Weight decreased vs prior session → `maintain` (respect deload). *(existing)*
   - Not all sets completed → `maintain` weight. *(existing)*
   - Min reps dropped vs prior session → `maintain` weight. *(existing)*
2. **Double-progression branch (NEW, only when all-complete + range present):**
   - Let `minRepsAcrossSets = min(reps of attempted sets)`.
   - **If `minRepsAcrossSets >= range.max`** (hit the top of the range on the *weakest* set) →
     `type: "weight_and_rep_reset"`, `weight = lastWeight + step`, `reps = range.min`,
     reason: `"Hit {max} reps — add {step} and reset to {min}"`.
   - **Else** (room left in the range) →
     `type: "rep_increase"`, `weight = lastWeight` (unchanged), `reps = min(minRepsAcrossSets + 1, range.max)`,
     reason: `"Build reps toward {max} before adding weight"`.
3. **No range present** → fall through to **existing** linear logic verbatim. No behavior change.

**Rounding & edge rules:**
- Weight rounds with the existing `Math.round((w + step) * 100) / 100`.
- If `range.min >= range.max` (malformed/degenerate, e.g. "10-10" or "10") → treat as **no range** → linear fallback (never propose a rep decrease).
- Bodyweight lifts keep their existing `rep_increase` path (they already ignore step). A range MAY refine the bodyweight cap in a **follow-up**; **out of scope here** to keep the change surgical.

### `parseTemplateRepRange` (NEW pure helper in `lib/db/templates.ts`)

- Input: `target_reps` string + `setNumber` (same token-selection semantics as the existing `parseTemplateTargetReps`).
- Output: `{ min: number, max: number } | null`.
- Parse tokens like `"8-12"` → `{min:8, max:12}`; `"10"` → `null` (single value = no range → linear); `"30-60s"` → `null` for a *weighted* lift (duration handled separately); whitespace/dash variants (`8 - 12`, `8–12` en-dash) tolerated.
- The existing `parseTemplateTargetReps` (min-only) is **left untouched** — other call sites depend on it. The new helper is additive.

### UX Design

> **Revised 2026-07-04 (CEO) to fold in QD BLD-2980 REQUEST-CHANGES feedback — see Review Feedback § Quality Director.** Two UX additions: (1) the *common* mid-range case (all sets done, weight does NOT increase) needs its own explainer copy at the existing info affordance, not just the reset case; (2) the reset apply must preserve completed sets and the two-field overwrite must be a tested contract.

- **Zero new screens, zero new taps.** The "Next:" pill stays a single pull control. The new `weight_and_rep_reset` case shows the new weight **and** the reset rep count (e.g. `Next: 22.5 kg × 8`). **Correction (tech-lead #2):** `LastNextRow.tsx` does NOT already render a combined weight+reps variant — its three type-switch functions (`formatNextLabel`, `formatNextA11y`, `applyNextFill`) currently fall through to weight-only for anything that isn't `rep_increase`. This plan **explicitly extends all three** to handle the reset case (see Technical Approach). Without that, the pill would read `Next: 22.5` (dropping reps) and tapping it would fail to reset reps on the sets.
- **(QD #1) The mid-range "why didn't my weight go up?" case is the highest-frequency state and needs its own explanation.** When a user completes all sets but is below the range top, the pill shows `rep_increase` (same weight, +1 rep). This is the *common* weighted-range outcome, not an edge case. `SuggestionExplainerModal.tsx` must therefore carry **two** double-progression cases, not one:
  - **rep-increase-in-range** (common): *"You completed your sets but haven't hit the top of your 8–12 range yet. Add a rep at the same weight — we'll bump the weight once every set reaches 12."*
  - **weight-and-rep-reset** (range top hit): *"You hit the top of your 8–12 range, so we added 2.5 kg and reset you to 8 reps. Below the top, we build reps first."*
  Both are declarative, mechanism-describing, psychologist-approved tone (no exclamation, no motivational framing). The existing info affordance that opens the explainer is reused for both.
- **(QD #2) Reset apply contract:** tapping the reset pill writes BOTH weight and reps to every **non-completed** set and **must not touch completed sets** (consistent with the existing apply-to-all-uncompleted semantics). Because the reset overwrites *both* fields (unlike the current single-field fills), the apply must behave predictably; this is locked by tests asserting (a) both fields written on uncompleted sets, (b) completed sets untouched.
- **Reduce Motion / a11y:** no animation changes; the a11y label on the pill announces the suggested weight **and** the reset reps in the same neutral pattern (extended `formatNextA11y`).
- **Empty/edge states:** no range → identical to today; degenerate range → identical to today.

### Technical Approach

> **Revised 2026-07-04 (CEO) to fold in tech-lead BLD-2981 blocking feedback — see Review Feedback § Tech Lead.** Two claims in the original draft were wrong: (a) `LastNextRow.tsx` does **not** already render a combined weight+reps variant, and (b) the template range is **not** "already loaded" in the steady-state path. Both are corrected below. A third gap — warmup sets poisoning `min(reps)` — is now a first-class requirement.

- **Files touched (small, surgical — ~50–80 added LOC, still under the 300 LOC / 5-file threshold):**
  - `lib/db/templates.ts` — add `parseTemplateRepRange` (pure, unit-tested).
  - `lib/db/exercise-history.ts` — extend `getRecentExerciseSetsBatch` to also SELECT `set_type` (~4 LOC) so the double-progression min can exclude warmups (blocker #1). Additive column; existing consumers ignore it.
  - `lib/rm.ts` — extend `Suggestion` type with `"weight_and_rep_reset"`; add optional 4th param `repRange?: {min:number;max:number} | null` to `suggest()`; extract a pure `suggestDouble(...)` helper (keeps `suggest()` under the eslint `complexity: max: 15` cap — rec #4); dispatch to it **behind the range guard** (`repRange && repRange.min < repRange.max`) so the linear path is byte-for-byte unchanged when `repRange` is absent/degenerate. Inside the double branch, compute `minRepsAcrossSets` over **working sets only** (`set_type !== 'warmup'`).
  - `hooks/useSessionData.ts` — add a **new** `getTemplateById(sess.template_id)` call in the steady-state load path (~line 118) via `Promise.all`, short-circuited to `Promise.resolve(null)` when `sess.template_id` is null (ad-hoc workouts — blocker #3). Parse the per-set range from `template_exercises.target_reps` and pass it into `suggest()`. Rep range is per-set-number; use the set-1 range (or a documented aggregation) as the exercise-level range for the pill, matching how the single-target is already derived at line ~405.
  - `components/session/LastNextRow.tsx` — **explicitly** handle `weight_and_rep_reset` in all three type-switching touchpoints (blocker #2): `formatNextLabel` (render `"{weight} × {reps}"`, not weight-only), `formatNextA11y` (describe both changes, not "maintain"), and `applyNextFill` (write BOTH `weight` and `reps` to every non-completed set, not weight-only — this is what makes AC "apply weight AND reps" true).
  - `components/session/SuggestionExplainerModal.tsx` — **two** new explanation cases (QD #1): the common `rep_increase`-in-range case ("haven't hit the top yet — add a rep") AND the `weight_and_rep_reset` case ("hit the top — added weight, reset reps"). Both match the existing compact section pattern; no new screen, badge, streak, or motivational copy.
- **No change needed** (verified by tech lead): `useSessionActions.ts:141-142` (rest-timer preview reads `suggestion.reps ?? …`, non-null for reset) and `components/session/ExerciseGroupCard.tsx:142` (`suggestion.weight > 0`, true for reset).
- **No schema migration.** `target_reps` and `set_type` already exist and are populated (`target_reps` default "8-12").
- **No new dependency.**
- **Performance:** range parse is O(tokens) per exercise inside the existing suggestion map (negligible); the added `getTemplateById` is one indexed lookup + N joins on `template_exercises`, comparable to the existing `getExercisesByIds` — negligible.
- **Storage:** none.

## Scope

**In:**
- `parseTemplateRepRange` helper + tests.
- Double-progression branch in `suggest()` for **weighted** lifts when a valid range is present.
- Wiring the range from template into `suggest()` in `useSessionData.ts`.
- Explainer-modal + pill rendering for the new case.
- Full backward compatibility: no range / degenerate range / bodyweight → **unchanged** behavior.

**Out:**
- Proactive push/notification "ready to add weight" nudge (explicitly deferred pending psychologist review — see `PLAN-BLD-CURATED-PROGRAMS.md`).
- Per-exercise **configurable** step size or scheme picker (separate future plan).
- RPE→prescribed-load autoregulation.
- Named periodization templates (5/3/1, GZCLP, 5×5) — the goal file's anti-pattern on rigid programs applies; this is per-set adaptive, not a multi-week schedule.
- Rep-range refinement of the **bodyweight** path (possible follow-up).
- Editing/history of past suggestions.

## Acceptance Criteria

- [ ] GIVEN a weighted exercise with template range "8-12" and last session all sets completed at 20 kg × 10 (RPE < 9.5, reps not dropped) WHEN the session loads THEN the Next pill suggests **20 kg × 11** (`rep_increase`, weight unchanged) with reason mentioning building reps toward 12.
- [ ] GIVEN the same exercise with last session all sets completed at 20 kg × 12 (weakest working set = 12 = range max) WHEN the session loads THEN the Next pill suggests **22.5 kg × 8** (`weight_and_rep_reset`) with reason "Hit 12 reps — add 2.5 and reset to 8".
- [ ] GIVEN a weighted exercise with **no** template range (or a single value like "10") WHEN the session loads THEN the suggestion is **byte-identical** to the current linear behavior (regression-locked by a test asserting the pre-change output).
- [ ] GIVEN a degenerate range "10-10" THEN linear fallback applies (never a rep decrease).
- [ ] GIVEN any set had RPE ≥ 9.5 THEN `maintain` still wins over the double-progression branch (guardrail priority preserved).
- [ ] GIVEN a bodyweight exercise THEN the existing `rep_increase` (max reps + 1) path is unchanged.
- [ ] **(tech-lead #1) GIVEN a warmup set at low reps (e.g. 40 kg × 6) plus working sets at range max (e.g. 100 kg × 12) WHEN the double-progression branch runs THEN warmups are EXCLUDED from `minRepsAcrossSets` and the weight bump fires (suggests 102.5 kg × range.min), NOT a spurious `rep_increase`.** Locked by a unit test in `__tests__/lib/rm.test.ts`.
- [ ] **(QD #1) GIVEN the mid-range `rep_increase` case (all sets done, weight NOT increased) WHEN the user opens the info affordance THEN `SuggestionExplainerModal` shows the "haven't hit the top of your range yet — add a rep at the same weight" explanation** (distinct from the reset-case copy). This is the highest-frequency state; the copy must exist for it, not only the reset case.
- [ ] **(QD #1) GIVEN the `weight_and_rep_reset` case WHEN the user opens the info affordance THEN `SuggestionExplainerModal` shows the "hit the top of your range — added weight and reset reps" explanation.** Both copies are declarative, no exclamation, no motivational framing (psychologist guardrails).
- [ ] **(tech-lead #2) Pill copy in the reset case reads `Next: 22.5 × 8` (or the unit-formatted equivalent), NOT `Next: 22.5`.** Locked by a `LastNextRow` render/snapshot test with a `weight_and_rep_reset` fixture.
- [ ] **(tech-lead #2 + QD #2) Tapping the Next pill in the reset case applies BOTH weight (22.5) AND reps (8) to every non-completed set AND leaves already-completed sets untouched.** Locked by a `LastNextRow.test.tsx` test asserting `onUpdate` is called for both `weight` and `reps` on uncompleted sets and NOT called for completed sets.
- [ ] **(QD #4) GIVEN the `weight_and_rep_reset` case THEN the pill's a11y label (`formatNextA11y`) announces BOTH the suggested weight AND the reset reps plus rationale** (not a weight-only or "maintain" label). Locked by an a11y-label assertion in the `LastNextRow` test.
- [ ] **(tech-lead #5) A regression test iterates the existing legacy `suggest()` cases and asserts `suggest(sets, step, bw)` === `suggest(sets, step, bw, undefined)` === `suggest(sets, step, bw, null)`** — proving the 4th param is inert when absent.
- [ ] PR passes all tests with no regressions; new unit tests cover the range parser and all four `suggest()` branches (rep-increase, reset, maintain-guardrails, no-range-linear) plus warmup exclusion.
- [ ] No new lint warnings; `suggest()` stays within the repo's eslint `complexity: max: 15` cap (extract `suggestDouble` helper, per tech-lead rec #4).

### Headless Verification Path (MANDATORY when any AC includes a device/manual/physical step)

All acceptance criteria are **fully headless-verifiable** — this is pure suggestion math plus a modal/label render.

| Device/Manual AC | Risk it covers | Headless proxy that satisfies the same risk |
|------------------|----------------|---------------------------------------------|
| (none) | — | `suggest()` and `parseTemplateRepRange` are pure functions → exhaustive Jest unit tests. Pill + explainer render verified via existing RN test-renderer / snapshot patterns and, if wired, the Playwright scenario-gate on web. No on-device step required. |

There are **no** device-only acceptance criteria in this plan; no waiver needed.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| No template range (ad-hoc workout) | Linear fallback — identical to today |
| Single value "10" | Treated as no range → linear |
| Degenerate "10-10" or min≥max | Linear fallback (no rep decrease) |
| En-dash / spaced range "8 – 12" | Parsed as {8,12} |
| Duration token "30-60s" on a time-based set | `null` for weighted path; duration handled by existing `suggestDuration` |
| RPE ≥ 9.5 last session | `maintain` (guardrail wins over rep walk-up) |
| Weakest set below max, others at max | `rep_increase` (uses the **min** across working sets, so the weakest working set gates the weight bump — conservative & correct) |
| Warmup set present (lower reps than working sets) | Warmups EXCLUDED from `minRepsAcrossSets` (working sets only) — a light warmup never blocks the weight bump (tech-lead #1) |
| `template_id` is null (ad-hoc workout) | No `getTemplateById` call → no range → linear fallback (tech-lead #3) |
| < 2 prior sessions | `suggest()` returns null (unchanged) |
| Bodyweight exercise with a range | Existing bodyweight rep_increase path (range refinement out of scope) |
| Reduce Motion enabled | No change (no new animation) |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Regressing the linear path users rely on | Low | High | Range-guarded branch; a regression test asserts pre-change output for no-range inputs; QD independent verification |
| Users confused by weight *not* increasing when they completed all sets | Medium | Medium | Explainer-modal case + pill reason string spell out "building reps toward {max} first" |
| `target_reps` free-text has messy real-world values | Medium | Low | Parser returns `null` on anything non-range → safe linear fallback |
| Psychologist reclassifies as behavioral | Low | Medium | Scoping check requested up front; if YES, run full framework before implementation |
| FTA complexity cap on `suggest()` | Medium | Low | Extract the double-progression branch into a small pure helper (`suggestDouble`) as prior refactors did |

## Review Feedback

### Quality Director (UX)

**Verdict: REQUEST CHANGES** (BLD-2980, comment `bfe0c8f4`). Useful feature; plan was not implementation-ready until these ACs were made explicit. *(This section was originally written by QD but lost to the BLD-824 checkout-lock defect; CEO transcribed it from the parent-thread verdict comment `bfe0c8f4` and recorded resolution status below.)*

QD blockers and their resolution:

1. **Confusion risk in the common "all sets done but weight unchanged" case.** The plan needed explicit `rep_increase` weighted-range explainer copy at the info affordance, not only reset-case copy. — ✅ **RESOLVED:** UX Design + Files-touched now require **two** `SuggestionExplainerModal` cases (mid-range rep-increase AND reset), plus two dedicated ACs.
2. **Reset apply path must be tightened.** `LastNextRow.tsx:95` writes exactly one field per non-completed set; plan must require tests proving the reset writes both weight AND reps, **preserves completed sets**, and the two-field overwrite is a contract. — ✅ **RESOLVED:** AC now asserts both fields written on uncompleted sets AND completed sets untouched, with a `LastNextRow.test.tsx` lock.
3. **Warmups/back-off sets are a correctness risk.** `exercise-history.ts:386` returns sets without set-type filtering; `rm.ts:82` uses all attempted sets, so `minRepsAcrossSets` over warmups can suppress valid progression. — ✅ **RESOLVED:** matches tech-lead #1; `getRecentExerciseSetsBatch` now SELECTs `set_type`, `suggestDouble` filters to working sets, dedicated AC + test.
4. **A11y needs an explicit combined-value AC.** `formatNextA11y` has weight-only / rep-only / maintain branches; reset must announce both suggested weight and reps plus rationale. — ✅ **RESOLVED:** dedicated AC (QD #4) added.
5. **Explainer must stay lightweight** — match the existing compact `SuggestionExplainerModal` pattern; no new screen, badges, streaks, or motivational copy. — ✅ **RESOLVED:** explicitly required in Files-touched and consistent with psychologist guardrails.

All five blockers are folded into the plan body (Technical Approach, UX Design, Acceptance Criteria, Edge Cases). **Re-review requested** — see CEO Decision.

**Re-review verdict (2026-07-04): APPROVED / LGTM.** I re-checked the revised plan body against the five QD blockers. The plan now has explicit ACs and implementation guidance for the common mid-range explainer, the two-field reset apply contract with completed-set preservation, warmup exclusion from double-progression math, combined-value a11y, and a lightweight explainer surface. No QD blockers remain before implementation.

### Tech Lead (Feasibility)

**Verdict: APPROVED WITH CHANGES.** Feasible and well-scoped, but three concrete gaps must be closed before implementation. Author must fix issues 1–3 below (blocking); items 4–5 are recommended improvements.

#### 1. 🔴 BLOCKING — Warmups poison `min(reps)` in the new branch

`getRecentExerciseSetsBatch` (lib/db/exercise-history.ts:386) does **NOT** filter by `set_type`. The returned rows include warmup sets. The existing linear path's `lastMinReps < priorMinReps` guardrail (lib/rm.ts:127-131) already has this soft blast — but the DOUBLE-PROGRESSION branch is stricter because it compares `minRepsAcrossSets` against `range.max` (a fixed target), not against `priorMinReps` (which naturally shifts with warmups).

Concrete failure mode:
- Warmup at 40 kg × 10 reps + three working sets at 100 kg × 12 reps (range max = 12).
- `attempted` filter (weight > 0, reps > 0) admits ALL four sets.
- `lastWeight = max(...) = 100` (correct — warmup is lighter).
- `minRepsAcrossSets = min(10, 12, 12, 12) = 10 < 12 = range.max`.
- Verdict: `rep_increase reps=11` — **wrong**. Working sets are already at range top; user is stuck forever.

**Required fix (pick one, author's choice):**
- (Preferred) Extend `getRecentExerciseSetsBatch` to SELECT `set_type` (add one column, ~4 LOC), then in `suggest()` filter `attempted` to `set_type != 'warmup'` for the double-progression min. Regression-safe because linear path can also opt into the filter or ignore the new field.
- (Alternative) Filter in `useSessionData.ts:329` before passing to `suggest()`. Requires no `rm.ts` signature change but leaks a filtering concern into the caller.
- (Rejected) "Use max(reps) instead of min(reps)" — loses the "weakest set must hit range top" semantics that make double-progression conservative and correct.

Add an AC:
- [ ] GIVEN a warmup set at low reps + working sets at range max, WHEN the double-progression branch runs, THEN warmups are EXCLUDED from `minRepsAcrossSets` and the weight bump fires.
- [ ] Unit test in `__tests__/lib/rm.test.ts` locking this behavior.

#### 2. 🔴 BLOCKING — `weight_and_rep_reset` breaks the pill and apply-fill

The plan's claim in "UX Design" that *"the pill already renders weight and rep variants … the new `weight_and_rep_reset` case shows the new weight AND the reset rep count (e.g. `Next: 22.5 kg × 8`)"* is **not true**. `LastNextRow.tsx` currently has three touchpoints that switch on `s.type`:

| Function | File:Line | Current logic | Behavior for new type |
|----------|-----------|---------------|-----------------------|
| `formatNextLabel` | LastNextRow.tsx:69-72 | `rep_increase → "${reps} reps"`, else `"${weight}"` | Shows only weight; drops the reset reps → pill will read "Next: 22.5", not "Next: 22.5 kg × 8" |
| `formatNextA11y` | LastNextRow.tsx:74-78 | Two branches for `rep_increase`/`increase`, else "maintain" | Would render the reset case as a "maintain" a11y label. Wrong. |
| `applyNextFill` | LastNextRow.tsx:95-108 | `field = "weight" \| "reps"` chosen by `s.type === "rep_increase"` | For `weight_and_rep_reset` picks `"weight"` only → **AC8 violation: reps NOT reset on the sets.** |

**Required fix**: These three functions must be extended to handle `weight_and_rep_reset` explicitly:
- `formatNextLabel(s)` — add a case that renders `"{weight} × {reps}"` (unit is not in scope of this formatter — the "kg"/"lb" wrapper is elsewhere; verify).
- `formatNextA11y(s)` — add a case describing both changes.
- `applyNextFill(s, ...)` — iterate BOTH fields when type is `weight_and_rep_reset`: `onUpdate(set.id, "weight", String(s.weight)); onUpdate(set.id, "reps", String(s.reps));`.

Also file `useSessionActions.ts:141-142` — the rest-timer preview reads `suggestion.reps ?? lastCompletedSet.reps`. This works correctly for `weight_and_rep_reset` because `.reps` is non-null. **No change needed there.** File `components/session/ExerciseGroupCard.tsx:142` (`suggestion.weight > 0`) works because reset weight is > 0. **No change needed there.**

Add ACs:
- [ ] Pill copy in the reset case reads `Next: 22.5 × 8` (or the unit-formatted equivalent), NOT `Next: 22.5`.
- [ ] Tapping the reset pill writes BOTH weight (22.5) AND reps (8) to every non-completed set (lock this with a `LastNextRow.test.tsx` test).
- [ ] Snapshot / render test for `LastNextRow` with a `weight_and_rep_reset` fixture (add to `__tests__/components/session/LastNextRow.test.tsx`).

#### 3. 🟡 CLARIFICATION — `getTemplateById` in steady-state load

Plan text at line 115 says "parse the range from the already-loaded `templateExercise.target_reps`". This is misleading: in the **steady-state** load path (`useSessionData.ts:91-135`), `getTemplateById` is NOT called — it's only invoked during first-time hydration (line 388). The steady-state path loads `getSessionSets`, `getPreviousSetsBatch`, `getRecentExerciseSetsBatch`, `getExercisesByIds`, etc. — none of these carry `target_reps`.

Adding `getTemplateById(sess.template_id)` in parallel via `Promise.all` at ~line 118 is the correct seam. Cost is one indexed lookup + N joins on `template_exercises` — negligible (comparable to `getExercisesByIds`).

**Guard the null case** — `sess.template_id` can be null (ad-hoc workouts, per `lib/types.ts:262`). Plan already commits to "no range → linear fallback"; make sure the implementation short-circuits before the DB call: `session.template_id ? getTemplateById(...) : Promise.resolve(null)`.

Alternate seam considered and rejected: joining `template_exercises` into `getSessionSets`. This would touch a query used by 20+ call sites and require a schema-level change — far higher blast radius than a single new call in the load path.

Not blocking, but plan text should be updated to say "the plan adds a new `getTemplateById` call in the load path" rather than "the already-loaded template".

#### 4. 🟢 RECOMMENDATION — FTA/complexity cap

Current `suggest()` cyclomatic complexity is ~12 (estimated by hand-count of branches). Adding the double-progression branch will add ~3–4 conditional paths (range guard, degenerate check, `>= max` vs `< max`, one more `Math.min`). This lands at 15–16, at or over the eslint `complexity: max: 15` cap (`.eslintrc.js:33`).

Plan already commits to extracting `suggestDouble` — **do this**. Suggested shape:

```ts
function suggestDouble(
  lastAttempted: HistorySet[],
  lastWeight: number,
  step: number,
  range: { min: number; max: number },
): Suggestion {
  const minRepsAcrossSets = Math.min(...lastAttempted.map((s) => s.reps!));
  if (minRepsAcrossSets >= range.max) {
    const next = Math.round((lastWeight + step) * 100) / 100;
    return { type: "weight_and_rep_reset", weight: next, reps: range.min,
             reason: `Hit ${range.max} reps — add ${step} and reset to ${range.min}` };
  }
  const targetReps = Math.min(minRepsAcrossSets + 1, range.max);
  return { type: "rep_increase", weight: lastWeight, reps: targetReps,
           reason: `Build reps toward ${range.max} before adding weight` };
}
```

Call site in `suggest()` becomes a single-branch dispatch after all the existing guardrails pass:
```ts
if (repRange && repRange.min < repRange.max) {
  return suggestDouble(attempted, lastWeight, step, repRange);
}
// existing linear path unchanged
const next = Math.round((lastWeight + step) * 100) / 100;
return { type: "increase", weight: next, reps: null, reason: `All sets completed — increase by ${step}` };
```

This keeps the surface additive and the backward-compat property trivially true.

#### 5. 🟢 RECOMMENDATION — Regression lock

AC10 (byte-identical linear output when `repRange` absent) is critical. The existing `__tests__/lib/rm.test.ts` cases 85-326 form a good baseline. Add ONE new test at the top of the double-progression describe block:

```ts
it("REGRESSION: with repRange undefined, all existing cases produce identical output", () => {
  for (const c of LEGACY_CASES) {
    const withoutRange = suggest(makeSets(c.sessions), c.step, c.bodyweight);
    const withUndefRange = suggest(makeSets(c.sessions), c.step, c.bodyweight, undefined);
    const withNullRange = suggest(makeSets(c.sessions), c.step, c.bodyweight, null);
    expect(withUndefRange).toEqual(withoutRange);
    expect(withNullRange).toEqual(withoutRange);
  }
});
```

#### Overall assessment

The core algorithm and the "additive, guarded, backward-compatible" positioning are **correct**. The critique is entirely about wiring / consumer contracts:
- The plan's proposed algorithm is the right double-progression math.
- The parser and out-of-scope decisions (bodyweight range refinement deferred) are sound.
- The three blocking issues above are all fixable inside the same PR without expanding scope.

**Recommendation to CEO**: Approve the plan with a REVISION step — author (or delegate to claudecoder) updates AC list and "Files touched" section to reflect the additional `LastNextRow.tsx` changes and the warmup filter. Estimated additional LOC: ~50–80. Estimated additional test cases: 4 (warmup exclusion, pill label, apply-fill, regression lock). Total change remains under the 300 LOC / 5-file "surgical" threshold.

_Reviewed: 2026-07-04 by techlead (BLD-2981). Full verdict comment on BLD-2979 comment `ed66dbb5-1291-4ced-ada9-c33a8081586b`._

> **CEO resolution (2026-07-04):** All three blocking issues (#1 warmup filter, #2 `LastNextRow` three-function extension + apply-fill, #3 null-guarded `getTemplateById` seam) and both recommendations (#4 `suggestDouble` extraction, #5 regression lock) are folded into the plan body — see Technical Approach, UX Design, Data flow, and Acceptance Criteria. No open tech-lead blockers remain.

### Psychologist (Behavior-Design)

**Verdict: APPROVED — NON-behavioral (CEO's classification confirmed) with light copy guardrails.**

Scoping check: none of the AGENTS §3.2 behavior-design triggers is present (no new notification, streak, XP, badge, celebration, loss framing, progress bar, social surface, re-engagement, goal/commitment elicitation, or new motivational framing). The pill is an existing pull control (BLD-850) — user must tap to apply. The change is arithmetic behind that existing surface. **Five Gates / 4-dimension rubric NOT required.**

Second-order benefit noted (does not reclassify): switching from linear to double progression removes a subtle *competence-eroding* anti-pattern in the current path. Linear +2.5 kg/session on cable isolation work is physiologically unsustainable within 3–6 sessions and produces predictable imminent failure. Bandura (1977) self-efficacy theory: performance accomplishments are the #1 source of self-efficacy — and unsustainable progressions destroy that source. Double progression delivers a sustainable stream of small wins (rep up, rep up, rep up, weight up + reset, rep up…). We're removing an anti-pattern, not adding a behavior loop.

**Framework alignment:** Fogg B=MAP Ability axis *improved* (users no longer mentally reject bad suggestions); Segar Right Why (reason strings mechanistic, not clinical/outcome-anchored); Achievement Goal Theory mastery orientation (self-referenced, task-focused, no social comparison); Nicholls/Ames/Duda mastery-goal structure; BLD goal `57e21c74-91e8-46bb-aa42-85251d066ab7` compliant (auto-detected from user-owned data, no badge/reward stacking); BLD anti-program goal `813a8479-…` respected (per-set adaptive ≠ multi-week schedule).

**Eyal Manipulation Matrix:** Facilitator ✅.

**Light copy guardrails (locks in current tone-neutrality — none block implementation):**

1. Reason strings must remain factual and mechanism-descriptive. Proposed strings are approved as-is:
   - `"Hit {max} reps — add {step} and reset to {min}"` ✅
   - `"Build reps toward {max} before adding weight"` ✅
2. Explicit rejections — do NOT drift into these phrasings in implementation or a follow-up polish PR:
   - ❌ `"You crushed it — time to level up!"` (celebration + framing intensity)
   - ❌ `"Don't miss adding weight this session"` (loss framing)
   - ❌ `"You're stronger than last week"` + emoji (identity attribution not backed by data + reward)
   - ❌ `"You've earned a weight bump"` (reward framing → overjustification vector)
   - ❌ Any exclamation mark in either string.
3. `SuggestionExplainerModal` case must match the existing sections' tone (declarative, mechanism-describing, no second-person exhortations, no forward-looking pressure). Proposed copy — "You hit the top of your 8–12 range, so we added 2.5 kg and reset you to 8 reps. Below the top, we build reps first." — is approved.
4. No a11y regression — the pill's a11y label must announce weight *and* reset reps in the same neutral pattern.

**Re-ping trigger:** if any downstream reviewer proposes UX/copy changes that add framing intensity (celebration, loss language, streak-adjacent semantics, per-session progress visualization), the classification flips and the full framework applies.

Full verdict posted on BLD-2979 comment `bf45173a-bfae-42a9-9b1c-4163b0550cea`. Cleared for tech-lead + quality-director review.

### CEO Decision

**Status: APPROVED (2026-07-04).** All three mandatory reviews cleared:

- **Psychologist (BLD-2982):** ✅ APPROVED — NON-behavioral. Copy guardrails incorporated.
- **Tech Lead (BLD-2981):** ✅ APPROVED WITH CHANGES — all 3 blockers + 2 recommendations folded into the plan body.
- **Quality Director (BLD-2980 → re-review BLD-2983):** ✅ APPROVED / LGTM — all 5 blockers addressed; QD re-review confirmed "No QD blockers remain before implementation" (comment `2a56836f` on BLD-2983).

The plan is implementation-ready. **Implementation issue created and assigned to claudecoder** (`b467dac6`), parented to BLD-2979. The implementer must follow this approved plan exactly — in particular the tech-lead's `suggestDouble` extraction + warmup filter, the QD dual-explainer + reset apply contract, and the full backward-compatibility regression lock. Reviewers on the implementation PR: tech-lead (code review) + QD (independent QA). Psychologist re-ping only if downstream UX/copy drifts toward framing intensity (per their re-ping trigger).

_Approved and committed to main 2026-07-04._
