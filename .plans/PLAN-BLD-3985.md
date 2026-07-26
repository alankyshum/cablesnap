# Feature Plan: Band-Resistance Logging (color/tension)

**Issue**: BLD-3985  **Author**: CEO  **Date**: 2026-07-26
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Research Source
- **Origin:** Reddit r/homegym, r/bodyweightfitness 2026 threads on resistance-band tracking apps (SmartWorkout, Powermove, GymPanda) — surfaced via daily product research routine (BLD-3812).
- **Pain point observed:** Band athletes cannot meaningfully log "load" because generic apps only accept numeric weight. They think in band color/tension (e.g., "red band", "black + green stacked") and want to record the resistance used per set and see progression over time. Apps that support this differentiate on it.
- **Frequency:** Recurring theme across multiple 2026 threads and multiple band-specific apps built to fill the gap — not a one-off.

## Problem Statement
CableSnap treats resistance bands as an equipment category (`lib/types.ts` → `"band"`) but has no first-class way to log the *resistance* of a band set. Band users must either fake a weight number or leave load blank, losing progression tracking — the core value of a tracker. This is squarely in CableSnap's cable/bodyweight/home-gym niche and privacy-first, offline-first philosophy (no cloud needed to store a personal band library).

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely functional data-logging capability. No streaks, notifications, rewards, social, or motivational framing introduced. Progression *display* reuses existing history views (no new nudges). If review disagrees, escalate to psychologist.

## User Stories
- As a band user, I want to log which band(s)/tension I used for a set so my set has a real, comparable load.
- As a band user, I want to define my own band library (label + optional lbs-equivalent) once and reuse it.
- As a band user, I want to see progression across sessions using band resistance the same way weighted users see weight.

## Proposed Solution
### Overview
Add an optional per-set band-resistance value for exercises whose equipment is `band`. Users pick from a personal band library (labelled entries, e.g. "Red — ~30lb"). Stacking supported (multiple bands → summed lbs-equivalent when all have values). Falls back gracefully to a free-text label when no lbs-equivalent is set.

### UX Design
- In the active-session Set row, when the exercise equipment is `band`, the weight input is augmented (not replaced) with a band-picker chip.
- Tapping the chip opens a sheet listing the user's band library with quick add/select; multi-select for stacking.
- Empty state: "No bands yet — add your first band" with a single-tap add (label required, lbs-equivalent optional).
- A11y: picker rows have accessible labels including label + lbs-equivalent; color is never the sole differentiator (label text carries meaning).
- Error/empty: if user selects bands but none have lbs-equivalents, load displays as the concatenated label ("Red + Green"); progression charts group by identical band-set signature.

### Technical Approach
- **Data model:** new `bands` table (id, label, lbs_equivalent NULLABLE, color_hint NULLABLE, created_at). New nullable column(s) on the per-set row to reference selected band ids (JSON array of ids) — reuse existing per-set extension column pattern (see `lib/types.ts` BLD-768 grip-variant precedent, `lib/db/migrations.ts` addColumnIfMissing).
- **Load resolution:** when band ids present and all have lbs_equivalent → numeric load = sum; else load is symbolic (label signature) used for grouping only.
- **Deps:** none new. Reuses expo/SQLite stack.
- **Perf/storage:** trivial — a handful of rows per user; JSON id array per set is small.
- **Migration:** additive only, backward compatible; existing sets unaffected.

## Scope
**In:** band library CRUD (min: add/select/delete), per-set band selection for `band` exercises, load resolution (sum when all lbs known), progression grouping by band signature, import/export round-trip of new fields.
**Out:** auto-detecting band brands, force-curve modeling, per-rep tension, band-specific 1RM formulas, sharing libraries between users.

## Acceptance Criteria
- [ ] Given a `band` exercise in an active session, When I open the set row, Then a band picker chip is shown alongside the weight input.
- [ ] Given no bands defined, When I open the band picker, Then I see an empty state and can add a band with a required label and optional lbs-equivalent.
- [ ] Given I select two bands each with lbs-equivalent, When the set is saved, Then the set's numeric load equals the sum, and history shows it.
- [ ] Given I select bands without lbs-equivalents, When the set is saved, Then the set displays the concatenated label and progression groups identical signatures together.
- [ ] Given existing data, When migration runs, Then no existing sets/weights are altered (backward compatible).
- [ ] Import/export preserves band library and per-set band references (round-trip test).
- [ ] PR passes all tests with no regressions; no new lint warnings.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty | No bands defined → empty state with add CTA; set saveable with no band (blank load). |
| Large | 20+ bands in library → picker scrolls, remains performant. |
| Offline/error | Fully offline; band lib is local SQLite. No network path. |
| Mixed | Some selected bands have lbs-equiv, some don't → treat load as symbolic (label signature), do not partial-sum. |
| A11y | Screen reader announces label + lbs-equivalent; color hint never sole signal. |
| Non-band exercise | Band picker not shown; weight input unchanged. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Load semantics confusion (symbolic vs numeric) | Med | Med | Clear rule: numeric only when ALL selected bands have lbs-equiv; else symbolic. Cover with tests. |
| Migration regression | Low | High | Additive columns + addColumnIfMissing; migration test asserts existing rows untouched. |
| Scope creep into force-curve modeling | Med | Low | Explicit Out-of-scope; label + optional lbs only. |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO (confirm during review)
### CEO Decision
_Pending_
