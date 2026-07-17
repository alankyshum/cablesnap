# Feature Plan: Per-Gym Cable Stack Profiles

**Issue**: BLD-3410  **Author**: CEO  **Date**: 2026-07-17
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Problem Statement
Cable machines vary in weight-stack increments (e.g. 5 lb vs 10 lb vs 7.5 kg plates),
starting/effective load, and pulley ratios across gyms and equipment brands. A user who
logs "50 on the cable row" at Gym A is not lifting the same resistance as "50" at Gym B.
CableSnap currently treats every logged weight as an absolute number, so cable exercises
silently corrupt cross-session progression analytics (e1RM trends, PRs, volume). This is a
structural blind spot in generic trackers (Strong, Hevy, JEFIT all store cable weight as a
bare number). It is squarely in CableSnap's cable/bodyweight niche and privacy-first
philosophy — profiles live entirely on-device.

## Behavior-Design Classification (MANDATORY)
Does this shape user behavior? (see §3.2 trigger list)
- [ ] **YES**
- [x] **NO** — purely functional data-integrity feature. No streaks, notifications,
  gamification, rewards, or motivational framing. It changes how a weight number is
  *interpreted and displayed*, not how the user is nudged to behave.

## User Stories
- As a lifter who trains at multiple gyms, I want to tag which gym a cable set was logged
  at so my progression charts compare like-for-like loads.
- As a user, I want to record a cable machine's stack increment and starting weight once so
  the app can round my entries to valid stack values and flag impossible loads.
- As a privacy-conscious user, I want these profiles stored locally with no account required.

## Proposed Solution
### Overview
Introduce an optional lightweight "Gym" entity and per-gym "cable stack profile"
(increment + base offset). When logging a cable-category exercise, the user may attach the
active gym; the weight stepper snaps to that gym's stack increments. Analytics gain an
optional "normalize by gym" toggle so cross-gym trends are comparable.

### UX Design
- **Active gym selector**: a small chip in the workout header (default "Unspecified").
  One tap to switch; remembers last-used gym. Fully skippable — feature is invisible until
  the user opts in by creating a gym.
- **Gym management screen** (Settings → Gyms): add/edit/delete a gym with name and one or
  more cable stack profiles (label, increment, base weight, unit).
- **Weight stepper**: when a cable exercise is logged with an active gym that has a stack
  profile, the +/- stepper snaps to increment values; manual entry shows a subtle
  "not a valid stack weight" hint (non-blocking).
- **Empty state**: no gyms defined → behavior identical to today (absolute numbers).
- **A11y**: chip and steppers have accessibilityLabels; hint uses role=text, not color-only.

### Technical Approach
- **Data model** (SQLite, idempotent `ALTER TABLE ... ADD COLUMN` guarded by
  `PRAGMA table_info`, per BLD-376 learning):
  - New `gyms` table: `id, name, created_at`.
  - New `cable_stack_profiles` table: `id, gym_id FK, label, increment_kg, base_kg`.
    Store canonical in kg; convert at display per existing unit setting.
  - `sets` table: add nullable `gym_id` column (bodyweight/absolute sets keep NULL — mirrors
    BLD-447 weight=null convention).
- **Queries**: dedicated new queries for gym CRUD and gym-filtered analytics; do NOT
  repurpose existing set queries (BLD-460 decision). Widen existing batched fetches where
  a gym join is cheap (BLD-456 pattern) rather than adding a separate round-trip.
- **Normalization**: "normalize by gym" is a pure post-fetch JS transform over already-loaded
  set rows — no denormalized cache columns (BLD-432 decision).
- **Perf**: gym data is tiny (handful of rows); no FlashList impact.

## Scope
**In:**
- Gym entity CRUD + cable stack profile CRUD (local only).
- Optional active-gym tagging on cable-category sets.
- Stepper snapping + non-blocking invalid-weight hint.
- Optional "normalize by gym" analytics toggle (charts scoped to a single gym).

**Out:**
- Cloud sync / shared gym database / crowd-sourced machine specs.
- Pulley-ratio / leverage modeling (treat stack number as effective load).
- Auto-detection of gym via GPS/location.
- Non-cable equipment profiles (barbell/dumbbell unaffected).

## Acceptance Criteria
- [ ] Given no gyms defined, When logging any set, Then UI and stored data are identical to
  current behavior (feature fully invisible).
- [ ] Given a gym with a 5 kg stack profile is active, When I tap + on a cable set weight
  stepper, Then the value increments by 5 kg from the profile base.
- [ ] Given a gym is active, When I log a cable set, Then the set row persists `gym_id`.
- [ ] Given sets logged at two different gyms, When "normalize by gym" is on and Gym A is
  selected, Then progression charts include only Gym-A cable sets.
- [ ] Migration is idempotent — running it twice does not error.
- [ ] PR passes all tests with no regressions.
- [ ] No new lint warnings.

## Headless Verification Path (device/manual ACs)
| Device/Manual AC | Risk it covers | Headless proxy |
|------------------|----------------|----------------|
| Stepper snaps correctly on-device | Rounding/increment math wrong | Unit tests on the snap/round pure function across increments (2.5/5/7.5/10) and unit conversions |
| Migration runs on real DB | Schema corruption on upgrade | In-memory SQLite migration test run twice asserting idempotency + column presence via PRAGMA |
| Chip/stepper a11y on device | Screen-reader gaps | Component test asserting accessibilityLabel presence and non-color-only hint |
No AC requires physical hardware; all risks have headless proxies.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Empty (no gyms) | Absolute-number behavior, feature hidden |
| Gym deleted while sets reference it | Sets keep historical `gym_id`; deletion soft-guards or nulls with confirmation (decide in impl, must not orphan analytics) |
| Manual weight not on stack increment | Non-blocking hint; value still saved as entered |
| Unit switch (kg↔lb) | Profiles stored in kg, displayed/rounded in active unit |
| Same-numbered set at two gyms | Treated as distinct effective loads under normalization |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Feature adds friction for single-gym users | Med | Med | Fully opt-in; zero UI until a gym is created |
| Scope creep into crowd-sourced machine DB | Med | High | Explicitly out of scope; local-only |
| Analytics normalization confuses users | Low | Med | Off by default; clear label + tooltip |
| Deleting a gym orphans historical data | Low | High | Preserve `gym_id` on sets; guard deletion |

## Review Feedback
### Quality Director (UX)
_Pending_
### Tech Lead (Feasibility)
_Pending_
### Psychologist (Behavior-Design)
N/A — Classification = NO
### CEO Decision
_Pending_
