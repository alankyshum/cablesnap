# Feature Plan: Per-Set Cable Variant Logging

**Issue**: BLD-767
**Author**: CEO
**Date**: 2026-04-28
**Status**: DRAFT → IN_REVIEW

## Research Source

- **Origin:** Daily Reddit research (BLD-766) — Perplexity sweep across r/fitness, r/homegym, r/bodyweightfitness, r/calisthenics, r/weightroom (2025–2026).
- **Pain point (verbatim themes):**
  - "Strong doesn't let me log if it's high pulley or low, ruins my lat pulldown progression tracking" (r/homegym, 2025).
  - "Hevy assumes plate-loaded, weight stack on my home gym cable doesn't match plate increments, app miscalculates 1RM" (r/fitness, 2026).
  - "Strong lumps all pull-ups together, no way to compare wide vs. close grip PRs without custom exercises that don't carry over" (r/calisthenics, 2025).
  - Workaround: Google Sheets / Airtable with dropdowns for pulley position, attachment, RPE.
- **Frequency:** Recurring theme across multiple subreddits — the top niche complaint for cable / home-gym users. Cross-validated against competitor-gap searches.

## Problem Statement

Cable machine workouts are highly **variant-sensitive**: the same exercise (e.g., Lat Pulldown) can be performed with a rope, straight bar, lat bar, V-bar, or single handle, at high / mid / low pulley positions. Each variant trains the same muscles but produces meaningfully different ROM, grip stress, and load curves — they are NOT directly comparable as a single progression line.

Today, CableSnap stores `attachment` and `mount_position` as **per-exercise** fields (immutable). A user logging "Lat Pulldown" today with a rope cannot record that this differs from last week's straight-bar session — it all gets averaged into one progression line, polluting analytics. Users either (a) create dozens of duplicate "custom" exercises like "Lat Pulldown — Rope — High" or (b) abandon the app for spreadsheets.

**Why now / why us:** CableSnap is named after cable machines. If we are not the best place to log cable work, we have no defensible niche. Strong, Hevy, JEFIT have ignored this for years — confirmed by Reddit threads where users beg for it. We can ship this in days because the data model already has the relevant types.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list)
- [ ] **YES** — triggers: …
- [x] **NO** — purely functional / data-tracking. No streaks, gamification, notifications, social features, motivational copy, identity framing, re-engagement loops, or commitment devices. It is a logging field, exactly like weight or reps.

→ **Psychologist review: NOT REQUIRED.**

## User Stories

- As a cable user, when I log a Lat Pulldown set, I want to record which **attachment** I used (rope / straight bar / V-bar / single handle / lat bar / ankle strap) so my progress graph shows separate lines per variant.
- As a home-gym user, I want to record **pulley position** (high / mid / low) per set so my cable-row vs. high-row analytics aren't mixed.
- As a returning user, I want the app to **default to my last-used variant** for that exercise so logging stays fast.
- As an analytics consumer, I want PR/strength graphs to optionally **filter by attachment + pulley** so "Lat Pulldown — Rope, High" is its own progression.
- As a casual user who doesn't care, I want this to be **invisible by default** — show variant only on cable exercises, never block flow.

## Proposed Solution

### Overview

Add two **optional** per-set columns to `workout_sets`:
- `attachment` (TEXT, nullable) — e.g., `rope`, `straight_bar`, `v_bar`, `single_handle`, `lat_bar`, `ankle_strap`, `none`.
- `pulley_position` (TEXT, nullable) — `high`, `mid`, `low`, `dual_high`, `dual_mid`, `dual_low`.

Inherit defaults from the exercise definition (`exercises.attachment`, `exercises.mount_position`); allow override per set; remember last-used per (user, exercise) for autofill.

Show inputs **only for exercises tagged as cable** (`equipment` includes "cable" OR exercise has non-null attachment in the definition table). Non-cable exercises see no UI change.

### UX Design

**Logging flow (additive, non-blocking):**
1. User taps an empty set row on a cable exercise.
2. Set row shows the existing weight × reps inputs PLUS a small chip group above showing the current attachment + pulley defaulted from "last session of this exercise" (fallback: exercise-definition default).
3. Tapping the chip opens a bottom-sheet with two pickers (attachment, pulley). Confirm closes the sheet; chip updates inline.
4. If the user does nothing, the set saves with the autofilled values — zero added taps for the common case.

**Empty / fallback state:** New install or first time logging an exercise → use exercise-definition defaults; chip displays in subdued styling indicating "default."

**Error state:** Invalid combination (e.g., "rope" with "ankle position") — no validation; we trust users. Just record what they say.

**Accessibility:**
- Chip has visible text label, not just icon (e.g., "Rope · High").
- Min touch target 44pt.
- Bottom-sheet pickers fully keyboard navigable on web; native sheet on iOS/Android with VoiceOver / TalkBack labels.
- Color is never the sole differentiator (matches CableSnap a11y conventions; see BLD-732 learnings).

**Analytics surface (initial scope = read-only filter):**
- Strength overview / PR pages get a **"Variant" filter dropdown** (default: "All variants"). Selecting a specific (attachment + pulley) tuple narrows the displayed progression line.
- Stretch goal (post-MVP, NOT in scope here): split graph showing one line per variant.

### Technical Approach

**Data model:**
```sql
ALTER TABLE workout_sets ADD COLUMN attachment TEXT DEFAULT NULL;
ALTER TABLE workout_sets ADD COLUMN pulley_position TEXT DEFAULT NULL;
```
Both nullable. NULL means "use exercise default" / "user did not specify" — preserves backward compat for all existing rows.

**Migration:** Use existing `addColumnIfMissing` pattern in `lib/db/migrations.ts` (consistent with prior `bodyweight_modifier_kg`, `set_type`, etc. — already a tested ALTER pattern).

**Schema:** Add to Drizzle schema (`lib/db/schema.ts`); regenerate types.

**Autofill source-of-truth chain (in order):**
1. User's last completed set of this exercise where `attachment IS NOT NULL`.
2. `exercises.attachment` / `exercises.mount_position` (existing per-exercise default).
3. NULL.

**Lookup query** uses existing `idx_workout_sets_session_exercise` index plus an `ORDER BY ws.id DESC LIMIT 1` filtered on the exercise — O(log n) on the index.

**UI components:**
- New `<CableVariantChip />` in `components/active-session/` (~80 LOC).
- Reuse existing bottom-sheet from `components/ui/`.
- Gate render on `exercise.equipment === 'cable'` OR `exercise.mount_position != null`.

**Performance:**
- Two extra TEXT columns per row, fully nullable — negligible storage impact.
- Autofill query is O(1) per exercise per session (run once on session-load and cache).
- Zero impact on existing analytics queries (they ignore the new columns until the variant filter is enabled).

**Storage / privacy:** Local SQLite only. Offline-first preserved. Open-source.

**Testing strategy:**
- Unit: migration adds columns; schema round-trip; autofill chain (last-set → exercise-def → null).
- Integration: insert set with variant; query by variant; backward compat (existing sets read with NULL variant).
- UI: chip renders only on cable exercises; bottom-sheet opens; default propagates.
- A11y: chip has accessible label; sheet is keyboard-navigable.

## Scope

**In scope (MVP):**
- DB migration: 2 new nullable columns on `workout_sets`.
- Schema + types update.
- Per-set autofill chain (last-set → exercise-default → null).
- `<CableVariantChip />` component on cable exercises in active-session.
- Bottom-sheet picker (attachment + pulley_position).
- "Variant filter" dropdown on PR Dashboard / Strength Overview that narrows by (attachment, pulley_position).
- Tests: unit + integration + a11y.

**Out of scope (deferred):**
- Multi-line graphs splitting variants automatically.
- Dual-cable cross-coordination (e.g., one-side high + one-side low setups). Phase 2.
- Importing/exporting variant data to/from other apps.
- Suggesting variant rotation ("you've done rope 3x this week, try V-bar"). That would be behavior-design — separate plan + psychologist review.
- Adding per-set fields to NON-cable exercises (e.g., bodyweight pull-up grip variations). Could come later as a separate "set-level variants" generalization, but explicitly out for v1.

## Acceptance Criteria

- [ ] Given a brand new install, when I migrate the DB, then `workout_sets.attachment` and `workout_sets.pulley_position` columns exist and default to NULL.
- [ ] Given an existing install with workout history, when migration runs, then all existing rows have NULL for both new columns and zero rows are altered or lost.
- [ ] Given a cable exercise (equipment = 'cable') in an active session, when I add a new set, then a CableVariantChip is visible above the set row showing the autofilled attachment + pulley.
- [ ] Given the autofill chain, when I have a previous set of this exercise with `attachment='rope'`, then a new set defaults to `rope`. When I have NO previous set but the exercise definition has `attachment='handle'`, then the new set defaults to `handle`. When neither exists, the chip shows "default" subdued styling and saves NULL.
- [ ] Given a NON-cable exercise (e.g., barbell back squat), when I add a set, then NO CableVariantChip is rendered.
- [ ] Given the variant filter on the PR Dashboard, when I select "Rope · High", then only sets matching `attachment='rope' AND pulley_position='high'` are shown in the progression line.
- [ ] PR passes all tests, no new lint warnings, typecheck passes.
- [ ] Migration is idempotent — re-running on an already-migrated DB is a no-op.
- [ ] No regression in existing PR Dashboard / Strength Overview queries (smoke test with seeded data).

## Edge Cases

| Scenario | Expected |
|---|---|
| Exercise definition has no attachment (e.g., new custom exercise) | Chip shows "—" subdued; saves NULL |
| User logs 50 sets — autofill perf | Single query per session-load, cached; no per-set DB hit |
| Existing user with months of history | All historical sets read with NULL variant; analytics unchanged until user opts into filter |
| Switching variant mid-session | Each set saves independently; no propagation |
| Migration on huge DB (10k+ sets) | ALTER ADD COLUMN with default NULL is O(1) in SQLite (rewrites only metadata) — verified pattern (BLD-732 learnings) |
| Web vs native | Bottom-sheet uses platform-native sheet; web fallback uses existing modal pattern |
| User unchecks variant chip | Saves NULL → falls back to exercise default in analytics |
| Filter selects (rope, high) but no matching sets exist | Empty-state message: "No sets logged with this variant yet" |
| A11y: screen reader user | Chip announces "Attachment: Rope. Pulley: High. Tap to change." |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration breaks existing DBs | Low | High | Use proven `addColumnIfMissing`; test on copy of seeded DB; rollback by ignoring columns (NULL-tolerant) |
| UI clutter on cable exercises | Medium | Medium | Show chip only when value differs from default OR on tap; subdued styling otherwise |
| Variant filter complicates analytics queries | Low | Medium | Filter is opt-in; default queries ignore variant columns |
| Users misuse field (typos, inconsistent values) | Low | Low | Use enum dropdown, not free text — controlled vocabulary |
| Scope creep into behavior-shaping (variant rotation suggestions) | Medium | Medium (psych gate) | Explicitly out-of-scope; future feature would re-plan |
| Performance: autofill query on session load | Low | Low | Single indexed query; cached per-session |
| Web platform divergence in bottom-sheet | Low | Medium | Reuse existing UI pattern proven in app |

## Implementation Plan (high-level — for techlead feasibility check)

1. **Migration & schema** (~30 min): add 2 columns + addColumnIfMissing call + Drizzle schema update.
2. **Autofill helper** (`lib/cable-variant.ts`, ~60 LOC + tests, ~45 min).
3. **`<CableVariantChip />` + bottom-sheet picker** (~150 LOC + tests, ~2 hr).
4. **Wire into active session** set rows (~40 LOC, ~30 min).
5. **PR Dashboard variant filter** (~80 LOC + 1 query helper, ~1.5 hr).
6. **Tests + a11y verification** (~1 hr).

Estimated total: ~6 engineer-hours. Single PR.

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
N/A — Classification = NO. No behavior-shaping triggers. Functional/data-tracking only.

### CEO Decision
_Pending_
