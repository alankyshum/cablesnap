# Feature Plan: Intensity Metric Choice — log by RIR or RPE

**Issue**: BLD-2699 (parent product-evolution issue: BLD-2698)
**Author**: CEO
**Date**: 2026-07-03
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source

- **Origin:** Daily product-evolution research on BLD-2698. Reddit/community synthesis via `search-web.py` across r/fitness, r/naturalbodybuilding, r/weightlifting, r/strongapp, plus competitor-gap analysis (Strong/Hevy/Fitbod/Boostcamp/Liftosaur) — 2025–2026 threads.
- **Pain point observed:** Serious lifters increasingly program and autoregulate with **RIR (reps in reserve)** — "2 RIR", "leave 1 in the tank" — especially for hypertrophy and accessory/back-off work (Renaissance Periodization, many popular programs). They **do not consider RIR and RPE fully interchangeable in practice**: RIR is regarded as more precise in the 8–16 rep range and for accessories, while RPE captures holistic effort for top/heavy singles. Many lifters "want both mentally" — they think in RIR for back-off sets and RPE for top sets. Direct user-voice examples from the research:
  - *"I program everything in RIR. Every app makes me do the RPE→RIR math in my head. RPE 8 is 2 RIR, whatever — just let me log the number my program tells me."*
  - *"RIR and RPE aren't the same thing to me. I'll take RPE for my top single and RIR for my back-offs. No tracker lets me mix them."*
- **Frequency:** Recurring, not a one-off. RIR/RPE autoregulation is described as *the* primary intensity-tracking standard for modern programs in multiple 2026 "best tracker" threads. No single Reddit thread ranks it #1 as a missing feature (many trackers *have* RPE), but the specific gap — **"let me log in RIR, not just RPE"** — is a repeated, concrete complaint. CableSnap today has RPE only; **RIR is entirely absent** from the codebase (verified: zero matches for `rir`/`RIR`/`reps_in_reserve`).
- **Adjacent precedent:** CableSnap already ships a mature RPE subsystem (`lib/rpe.ts`, `components/session/RpeChipStrip.tsx`, `RpeSheet.tsx`, `workout_sets.rpe` column, adaptive-rest RPE buckets in `lib/rest.ts`). This plan **extends** that subsystem with a display/input vocabulary, rather than adding a new per-set data dimension. It follows the "let the user speak their own language" theme of prior smart-defaults work.

## Goal Alignment (transparency note)

The prior product goals *Fluent UX* and *Gamify fitness* are `cancelled`; *Frictionless workout tracking for cable & bodyweight enthusiasts* is marked `achieved`. The active company goal is `e4fa9312-…` — *Internal development productivity and engineering infrastructure*.

This proposal is deliberately framed to fit the active goal **and** the achieved product north star:

- **Frictionless-UX alignment (achieved goal's north star):** it removes an in-head unit-conversion tax (RPE↔RIR math) on every intensity-logged set for RIR-programmed lifters — squarely "smart defaults / minimal cognitive load."
- **Engineering-quality alignment (active goal):** the implementation is a small, well-isolated pure-function layer over an existing column with a typed `app_settings` accessor and a single source of truth for the RPE↔RIR mapping. It **adds no schema migration** and **no new per-set data**, so it increases code without increasing data-model risk. It is a low-blast-radius change with a high unit-test surface — the kind of confidence-preserving increment the active goal favors.

If the board would prefer to park product work until a new user-product goal is set, this plan can be moved to `backlog` after review with zero implementation cost sunk.

## Behavior-Design Classification (MANDATORY)

- [ ] **YES**
- [x] **NO** — purely functional. This is an intensity-**measurement vocabulary** preference. It contains no streaks, no rewards, no notifications, no onboarding hooks, no leaderboard/social, no habit loops, no goal-commitments, no motivational/loss-framing copy, no re-engagement of lapsed users, and no motivational progress visualizations. RIR and RPE are neutral training instruments describing proximity to momentary muscular failure. Displaying "2 RIR" instead of "RPE 8" does not shape behavior; it relabels an existing measurement.

Psychologist review: **N/A** (Classification = NO). Per §3.2, the CEO will still tag `@psychologist` for a one-line scoping confirmation that this is not behavior design, but implementation is not gated on it.

## Problem Statement

CableSnap lets a lifter rate each set's intensity on the **RPE (Rate of Perceived Exertion) 6–10** scale. That is the correct, well-built default. But a large and growing segment of serious lifters — particularly hypertrophy-focused and Renaissance-Periodization-influenced trainees — program and think in **RIR (Reps In Reserve)**: "do this set with 2 reps in reserve."

Today those users must convert in their head on every set: their program says "2 RIR," CableSnap asks for RPE, so they mentally compute RPE 8 and tap the "Hard (9)"... wait, no, RPE 8... and now they've fumbled the fast-logging flow the app is otherwise excellent at. The conversion is simple (RIR = 10 − RPE across the meaningful range) but doing it dozens of times per session is exactly the kind of friction CableSnap's north star exists to kill.

**User emotion today:** *"I love how fast CableSnap logs everything — except I program in RIR and I'm doing RPE math in my head on every single set. Just let me type the number my spreadsheet tells me."*

**User emotion after:** *"I flipped one switch in Settings and now every set asks me for RIR. It speaks my language. Zero math."*

This is a **friction-removal / accessibility-of-vocabulary** feature: same data, same analytics, same adaptive-rest behavior — the user just reads and enters it in the scale they already think in.

## User Stories

- As an RIR-programmed lifter, I want to log set intensity in **reps in reserve** so that I don't convert to RPE in my head on every set.
- As an RPE-native lifter, I want the app to **stay exactly as it is today** (RPE is the default; nothing changes unless I opt in).
- As a lifter who mixes scales, I want the app to **remember my preferred scale** and show it consistently everywhere intensity appears (session chips, precise sheet, set summaries, session detail, history).
- As a data-portability-conscious user, I want my exported data to be **unambiguous** regardless of which display scale I chose (the stored value and its scale must be self-describing on export/import).
- As a user switching my preference, I want **previously logged sets to re-display** in the new scale without any data change or loss.

## Proposed Solution

### Overview

Introduce a single app-level **intensity metric preference** — `rpe` (default) or `rir` — stored in the existing `app_settings` key-value table via a typed accessor. The underlying per-set storage is **unchanged**: `workout_sets.rpe` continues to hold the canonical RPE value (6.0–10.0, `real`). A pure mapping module converts between the canonical RPE value and the RIR display value; all intensity UI reads the preference and renders/collects in the chosen scale.

Design principle: **one canonical stored unit (RPE), one preference, one pure mapping**. We do **not** add a `rir` column, do **not** migrate data, and do **not** change adaptive-rest math (it keeps consuming the canonical RPE value).

### The RPE ↔ RIR mapping (single source of truth)

Standard, community-accepted mapping over CableSnap's supported RPE range 6.0–10.0:

| RPE (stored) | RIR (displayed) | Meaning |
|-------------|-----------------|---------|
| 10.0 | 0 | No reps left — momentary failure |
| 9.5 | 0.5 | ~half a rep left |
| 9.0 | 1 | 1 rep left |
| 8.5 | 1.5 | |
| 8.0 | 2 | 2 reps left |
| 7.5 | 2.5 | |
| 7.0 | 3 | 3 reps left |
| 6.5 | 3.5 | |
| 6.0 | 4 | 4+ reps left (floor of the scale) |

Formula: `RIR = 10 − RPE` (clamped to the supported RPE domain 6.0–10.0 → RIR 0–4, in 0.5 steps). The RIR scale is therefore **inverted** (lower RIR = harder) relative to RPE (higher RPE = harder). The color/severity semantics from `lib/rpe.ts` are preserved by mapping through the canonical RPE value, so "harder = advanced color" stays correct in both scales.

**Bounded scope decision:** CableSnap's RPE input is bounded at 6.0 today. We keep RIR bounded to the equivalent 0–4 range (not the theoretical 0–5+). This preserves parity with the existing RPE picker and avoids introducing input states that have no RPE equivalent. The RIR "4" chip carries a "4+" affordance in copy to acknowledge the floor. (Open question O3 asks reviewers to confirm this bound.)

### UX Design

**Where the preference lives:** Settings → Workout/Session preferences → "Intensity scale" segmented control: **[ RPE ] [ RIR ]**. Default `RPE`. One-line helper: *"Log how hard each set felt. RPE counts up (10 = max). RIR counts reps left (0 = failure)."*

**Session chip strip (the hot path):** `RpeChipStrip` today shows Easy(6) / Moderate(7.5) / Hard(9) / Max(10). When preference = RIR, the same four chips render as RIR values in intuitive (hardest-last) order, with matching effort labels:

| Effort label | RPE chip (today) | RIR chip (new) |
|--------------|------------------|----------------|
| Easy | 6 | 4 RIR |
| Moderate | 7.5 | 2.5 RIR |
| Hard | 9 | 1 RIR |
| Max | 10 | 0 RIR |

The chip **order stays visually identical** (Easy → Max, left to right) so muscle memory is preserved; only the numeral and unit label on each chip change. The component header/strip label switches "RPE"→"RIR".

**Precise sheet (`RpeSheet`):** long-press opens the precise picker. In RIR mode it presents 0–4 in 0.5 steps (inverted), labelled "RIR". Selecting a value stores the mapped canonical RPE.

**Set summary / previous-set display / session detail / history:** anywhere an intensity value is rendered (e.g. `@8`, RPE trend card label), it renders in the active scale with an explicit unit suffix (`RPE 8` or `2 RIR`) — never a bare number — to avoid ambiguity when the two scales share numerals (e.g. RPE 6 vs 6 RIR would be very different).

**Accessibility:**
- All chips keep the existing `radiogroup`/`radio` roles; a11y labels update to the active scale ("RIR 2, moderate", "RIR 0, max effort").
- Because RIR is inverted, the a11y label always includes the effort word ("2 RIR, moderate") so screen-reader users are never confused about direction.
- Non-color affordance: effort is conveyed by the text label + position, not color alone (CVD-safe), matching the existing RPE strip.
- Reduced-motion: unchanged (inherits existing strip behavior).

**Empty/neutral states:** if no intensity is logged, behavior is unchanged (chips unselected). Toggling the preference with no logged sets changes nothing but the labels.

**Switching preference with existing data:** flipping the toggle is instant and lossless — it re-renders stored RPE values in the new scale. No migration, no write, no confirmation dialog needed (nothing is mutated).

### Technical Approach

**Data model:** no schema change. `workout_sets.rpe` remains the single canonical store. Preference stored under `app_settings` key `intensity.metric` (values `"rpe"` | `"rir"`), included automatically in the `app_preferences` backup surface like other `app_settings` keys.

**New modules (small, pure, well-tested):**
1. `lib/intensity.ts` — the single source of truth:
   - `type IntensityMetric = "rpe" | "rir"`
   - `rpeToRir(rpe: number): number` and `rirToRpe(rir: number): number` (clamped, 0.5-step, domain-guarded)
   - `formatIntensity(rpeValue: number, metric: IntensityMetric): string` → `"RPE 8"` | `"2 RIR"`
   - `intensityChipSet(metric)` → the four labelled chips in the chosen scale (drives `RpeChipStrip`)
   - `intensityColor(rpeValue)` — delegates to existing `lib/rpe.ts` so severity/color stays canonical
2. `lib/db/intensity-settings.ts` — typed accessor over `app_settings` (mirrors `lib/db/training-day-settings.ts` and `macro-coach-settings.ts` exactly): `getIntensityMetric()`, `setIntensityMetric()`.
3. `hooks/useIntensityMetric.ts` — reactive read of the preference for components (invalidates on change like other settings hooks).

**Component changes (read the preference; no behavior change beyond labels):**
- `components/session/RpeChipStrip.tsx` — consume `intensityChipSet(metric)`; keep controlled RPE value contract (parent still stores canonical RPE). Rename displayed label; keep the `value`/`onChange` API in canonical RPE so **no upstream call site changes**.
- `components/session/RpeSheet.tsx` — render the active scale; convert on select.
- Any read-only intensity renderers (`lib/format.ts` intensity formatting, `TrendCards.tsx` RPE label, session detail set rows, summary `SetsCard`) — route through `formatIntensity`.

**Explicitly unchanged (guardrails):**
- `workout_sets.rpe` semantics, storage, and all writes.
- Adaptive rest (`lib/rest.ts`, `lib/rest-resolver.ts`) — keeps consuming canonical RPE buckets. RIR is a display concern only.
- CSV/JSON export of the per-set value stays keyed on the canonical RPE field; **the export must remain self-describing** (see AC on export). We do **not** rewrite historical exports into RIR.
- Achievements, e1RM, volume — untouched (they never read RPE for math beyond rest).

**Performance:** pure O(1) conversions; one extra cheap `app_settings` read cached via the settings hook. No new queries on the hot logging path (preference is read once and memoized, not per-set).

**Testing surface (high, cheap):** exhaustive table test of `rpeToRir`/`rirToRpe` round-trip across 6.0–10.0 in 0.5 steps; `formatIntensity` snapshot for both scales; chip-set generation test; a component test asserting `RpeChipStrip` renders RIR labels under preference = rir while still emitting canonical RPE via `onChange`; a backup round-trip test asserting `intensity.metric` survives export/import (mirrors the training-day-settings backup test).

## Scope

**In:**
- App-level `rpe | rir` preference (Settings segmented control), default `rpe`.
- Pure mapping + formatting module (`lib/intensity.ts`) as the single source of truth.
- Typed `app_settings` accessor + reactive hook.
- Scale-aware rendering in: session chip strip, precise sheet, set summary/detail, previous-set display, RPE trend label.
- Explicit unit suffix everywhere intensity is shown (no bare numerals).
- Preference included in backup/restore; export remains self-describing.
- Unit + component + backup round-trip tests.

**Out:**
- No new `rir` column or per-set scale storage (canonical stays RPE).
- No **per-set** scale override (this is an app-level preference, not a per-set toggle). Mixing RPE on some sets and RIR on others within one session is a possible future enhancement; explicitly deferred to keep blast radius small. (See Open Question O2.)
- No change to adaptive-rest math.
- No RIR-specific programming/autoregression features (e.g. "auto-suggest load to hit target RIR") — deferred.
- No change to the theoretical RIR range beyond the existing RPE 6–10 domain (RIR 0–4). (See O3.)
- No behavior-design / gamification.

## Acceptance Criteria

- [ ] **Default unchanged:** Given a user who never opens the new setting, When they log intensity anywhere, Then the app behaves exactly as today (RPE 6–10, existing chips/labels) with no visual or data change.
- [ ] **Toggle exists:** Given Settings, When the user opens Workout/Session preferences, Then an "Intensity scale [RPE][RIR]" segmented control is present with RPE preselected and a one-line explainer.
- [ ] **Chip relabel (RIR):** Given preference = RIR, When the session chip strip renders under a completed set, Then the four chips read `4 RIR / 2.5 RIR / 1 RIR / 0 RIR` (Easy→Max order preserved) and the strip label reads "RIR".
- [ ] **Canonical storage preserved:** Given preference = RIR, When the user taps "1 RIR", Then `workout_sets.rpe` is stored as `9.0` (mapped canonical RPE), verified via DB read — no `rir` column is written.
- [ ] **Precise sheet:** Given preference = RIR, When the user long-presses a chip, Then the precise sheet offers 0–4 in 0.5 steps labelled RIR, and selecting `2` stores canonical RPE `8.0`.
- [ ] **Lossless re-display on switch:** Given sets logged while preference = RPE (e.g. RPE 8), When the user switches preference to RIR, Then those sets re-display as `2 RIR` with no write to the DB and no value change (verified: `updated_at`/value unchanged).
- [ ] **Unambiguous rendering:** Given any screen that shows a set's intensity, When it renders, Then it shows an explicit unit suffix (`RPE 8` or `2 RIR`), never a bare number.
- [ ] **Round-trip mapping correctness:** `rpeToRir(rirToRpe(x)) === x` for all x in {0,0.5,…,4}, and `rirToRpe(rpeToRir(y)) === y` for all y in {6.0,6.5,…,10.0} — asserted by unit test.
- [ ] **Backup round-trip:** Given preference = RIR, When the user exports then imports a backup, Then `intensity.metric` is restored as `rir` (asserted by test, mirroring training-day-settings backup test).
- [ ] **Export self-describing:** Given a CSV/JSON export, Then per-set intensity remains keyed on the canonical RPE field (no silent RIR values written into an RPE-named field); scale is a display preference only, not an export-schema change.
- [ ] **Adaptive rest unaffected:** Given identical logged sets, When preference is RPE vs RIR, Then computed rest times are identical (adaptive rest reads canonical RPE) — asserted by test.
- [ ] **A11y:** Given a screen reader, When focus lands on an RIR chip, Then the label includes both value and effort word ("2 RIR, moderate"); effort is not conveyed by color alone.
- [ ] PR passes all tests with no regressions; no new lint warnings; typecheck clean.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No intensity logged on a set | Unchanged — chips unselected; toggling preference changes nothing but labels |
| Existing RPE data, user switches to RIR | Re-displays via mapping; **no DB write**, no value change |
| RPE value at domain floor (6.0) | Displays as "4 RIR" with "4+" affordance in chip copy |
| RPE value at ceiling (10.0) | Displays as "0 RIR" (failure) |
| Half-step values (RPE 7.5) | Displays as "2.5 RIR" |
| Backup made in RPE mode, restored on device set to RIR | Per-set canonical values intact; display follows the **restored** `intensity.metric` preference (which is included in the backup) |
| Backup from older app version without `intensity.metric` key | Accessor returns default `rpe`; no crash (typed accessor defaults, mirroring existing settings accessors) |
| Screen reader / CVD user | Effort word + position convey intensity; unit suffix always spoken; color is supplementary only |
| CSV import from Strong/Hevy (RPE column) | Unchanged — import maps to canonical RPE; display then follows local preference |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Numeral ambiguity (RPE 6 vs 6 RIR) confuses users reading old screenshots/history | Medium | Medium | Always render explicit unit suffix; never a bare number. AC enforces this. |
| Inverted scale (lower RIR = harder) causes color/severity bugs | Medium | Medium | Single source of truth: color always computed from canonical RPE via `lib/rpe.ts`; RIR is display-only. Round-trip + color tests. |
| Scope creep into per-set scale mixing or RIR-target autoregulation | Medium | Medium | Explicitly out of scope; documented as deferred (O2). App-level preference only. |
| A screen missed during rendering audit shows a bare/opposite number | Medium | Medium | Enumerate all intensity render sites in the implementation issue; grep for `rpe` render call sites; add a lint/test guard that intensity display routes through `formatIntensity`. |
| Export consumers assume the RPE field could contain RIR | Low | High | Canonical field stays RPE; AC forbids writing RIR into RPE-named fields; document in export schema. |
| Users expect RIR beyond 4 (5+ RIR for very easy sets) | Low | Low | Bounded to existing RPE 6–10 domain for parity; "4+" affordance. Revisit only if requested (O3). |

## Open Questions for Reviewers

- **O1 (QD):** Is the Settings segmented control the right home, or should the scale also be switchable inline from the session toolbox (`SessionToolboxSheet`) for discoverability? (Leaning: Settings only for v1 to minimize surface; toolbox shortcut deferrable.)
- **O2 (TL/QD):** Confirm app-level preference (not per-set scale) is the right v1 boundary. Per-set mixing is the theoretically "richest" behavior but multiplies UI/state complexity and export ambiguity. Recommend deferring.
- **O3 (TL):** Confirm bounding RIR to 0–4 (mirroring RPE 6–10). Extending to 5+ would require extending the RPE domain too, which touches the existing picker and adaptive-rest buckets — larger blast radius. Recommend keeping parity.
- **O4 (QD):** Numeral-ambiguity guard — is an always-on unit suffix sufficient, or do we also want a subtle scale badge on history/detail screens where old and new logs coexist?

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_Pending — Classification = NO; CEO will request a one-line scoping confirmation per §3.2. Not gating._

### CEO Decision
_Pending_
