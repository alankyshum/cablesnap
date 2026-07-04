# Feature Plan: Double-Progression Suggestions (rep-range aware "Next:" pill)

**Issue**: BLD-2979 (parent research task: BLD-2978)
**Author**: CEO
**Date**: 2026-07-04
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

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

### Data flow (all wiring already exists except the range plumbing)

```
template_exercises.target_reps ("8-12")
      │  parseTemplateRepRange()  ← NEW pure helper (min & max)
      ▼
useSessionData.ts  ──►  suggest(recent, step, bw, repRange?)   ← extend signature
      ▼
Suggestion { type, weight, reps, reason }   ← type gains "weight_and_rep_reset"
      ▼
LastNextRow.tsx  "Next:" pill  (icons/label already handle weight & rep variants)
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

- **Zero new screens, zero new taps.** The "Next:" pill already renders weight and rep variants with up-arrow / equals icons (`LastNextRow.tsx`). The new `weight_and_rep_reset` case shows the new weight **and** the reset rep count (e.g. `Next: 22.5 kg × 8`) with the existing "increase" up-arrow treatment.
- **`SuggestionExplainerModal.tsx`** gains one short case explaining double progression: *"You hit the top of your 8–12 range, so we added 2.5 kg and reset you to 8 reps. Below the top, we build reps first."* Plain, factual, no motivational framing.
- **Reduce Motion / a11y:** no animation changes; the a11y label on the pill already announces the suggested weight/reps and gains the reset reps in the same pattern.
- **Empty/edge states:** no range → identical to today; degenerate range → identical to today.

### Technical Approach

- **Files touched (small, surgical):**
  - `lib/db/templates.ts` — add `parseTemplateRepRange` (pure, unit-tested).
  - `lib/rm.ts` — extend `Suggestion` type with `"weight_and_rep_reset"`; add optional 4th param `repRange?: {min:number;max:number} | null` to `suggest()`; add the double-progression branch **behind the range guard** so the linear path is byte-for-byte unchanged when `repRange` is absent.
  - `hooks/useSessionData.ts` — parse the range from the already-loaded `templateExercise.target_reps` (per set) and pass it into `suggest()`. Note: rep range is per-set-number; use the range for set 1 (or a documented aggregation) as the exercise-level range for the pill, matching how the single-target is already derived at line ~405.
  - `components/session/SuggestionExplainerModal.tsx` — one new explanation case.
  - `components/session/LastNextRow.tsx` — render the reset-reps variant (likely already covered by the rep-bearing branch; verify).
- **No schema migration.** `target_reps` already exists and is populated (default "8-12").
- **No new dependency.**
- **Performance:** the range parse is O(tokens) per exercise, already inside the existing suggestion map; negligible.
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
- [ ] GIVEN the same exercise with last session all sets completed at 20 kg × 12 (weakest set = 12 = range max) WHEN the session loads THEN the Next pill suggests **22.5 kg × 8** (`weight_and_rep_reset`) with reason "Hit 12 reps — add 2.5 and reset to 8".
- [ ] GIVEN a weighted exercise with **no** template range (or a single value like "10") WHEN the session loads THEN the suggestion is **byte-identical** to the current linear behavior (regression-locked by a test asserting the pre-change output).
- [ ] GIVEN a degenerate range "10-10" THEN linear fallback applies (never a rep decrease).
- [ ] GIVEN any set had RPE ≥ 9.5 THEN `maintain` still wins over the double-progression branch (guardrail priority preserved).
- [ ] GIVEN a bodyweight exercise THEN the existing `rep_increase` (max reps + 1) path is unchanged.
- [ ] `SuggestionExplainerModal` shows a correct, plain-language explanation for the new case.
- [ ] Tapping the Next pill in the reset case applies **weight AND reps** to all non-completed sets (consistent with existing apply-to-all behavior).
- [ ] PR passes all tests with no regressions; new unit tests cover the range parser and all four `suggest()` branches (rep-increase, reset, maintain-guardrails, no-range-linear).
- [ ] No new lint warnings; complexity within the repo's FTA cap (split helpers if needed, per prior `useRestTimer`/`suggest` refactors).

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
| Weakest set below max, others at max | `rep_increase` (uses the **min** across sets, so the weakest set gates the weight bump — conservative & correct) |
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
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_Pending — scoping verdict requested: confirm/reject the NON-behavioral classification above._

### CEO Decision
_Pending_
