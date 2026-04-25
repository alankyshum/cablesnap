# Feature Plan: Hydration tracking on Nutrition tab

**Issue**: BLD-599  **Author**: CEO  **Date**: 2026-04-25
**Status**: DRAFT → IN_REVIEW (rev 2 — folded QD + Tech Lead feedback)

## Problem Statement

CableSnap is a "workout & macro tracker." The macro/nutrition side currently logs food (calories + protein/carbs/fat), meal templates, and macro targets — but does not track water intake. Hydration is one of the most commonly logged nutrition metrics in mainstream macro apps (MyFitnessPal, Cronometer, MacroFactor). Users cannot record cups/bottles of water against a daily goal in CableSnap today.

This plan adds first-class hydration logging without introducing any behavior-shaping mechanics (no streaks, no reminders, no rewards, no re-engagement, no progress nudges). It is a pure functional gap fill on the macro side.

Source: BLD-598 product-evolution heartbeat. Macro side audit shows `lib/db/nutrition.ts`, `lib/db/meal-templates.ts`, `lib/db/nutrition-progress.ts`, but `grep -r water|hydration` returns no domain matches (only `useState` "hydration" referring to React state hydration in `PreferencesCard.tsx`).

## Behavior-Design Classification (MANDATORY)

Apply the §3.2 trigger list:

| Trigger | Present? | Notes |
|---|---|---|
| gamification | NO | No XP, levels, badges. |
| streaks | NO | No consecutive-day counters. |
| notifications/reminders | NO | No push or in-app reminders. |
| onboarding | NO | Existing settings flow only. |
| rewards | NO | No celebratory/animation reward on log. |
| motivational progress visualizations | NO | A static bar/ring showing today's total vs goal is purely informational, not motivational. No "almost there!" copy, no goal-overrun celebrations. |
| social/leaderboard | NO | None. |
| habit loops | NO | Not designed as a habit-forming loop. |
| goal-setting/commitments | NO | A configurable daily volume is a unit preference, not a behavioral commitment device. |
| motivational copy | NO | Plain factual labels only. |
| identity framing | NO | None. |
| re-engagement of lapsed users | NO | No notifications, no auto-popup. |

**Classification: NO.** Psychologist review N/A.

Hard exclusions to preserve this classification (must remain out of scope):
- No celebratory animation when target is hit.
- No "you missed yesterday" or comparative shame copy.
- No notifications or scheduled reminders.
- No streak counter on hydration.
- No daily auto-popup of a hydration card.
- No badge or achievement on the bottom tab.

If any of these are added in implementation, classification flips to YES and psychologist review becomes mandatory before merge.

## User Stories

- As a user logging my nutrition, I want to record cups of water I drink so I can see my daily fluid intake alongside my macros.
- As a user, I want quick-tap buttons for common amounts (e.g., 250 / 500 / 750 ml) so logging takes one tap.
- As a user, I want to set my preferred unit (ml or fl oz) and daily goal so the display matches my preferences.
- As a user, I want to undo or edit a log entry if I tap the wrong amount.
- As a user, I want today's total visible on the Nutrition tab without an extra screen.

## Proposed Solution

### Overview

Add a "Water" section to the Nutrition tab list header, beneath the macro totals. The section shows:
- Today's total (e.g., "1,250 / 2,000 ml") and a thin progress bar.
- Three quick-tap chips for the user's three configured preset volumes.
- A small "+" button opening a sheet for custom volumes.
- Tap on the section header (label/total area) opens a day detail showing today's individual entries with edit/delete. (Long-press is reserved for nothing on the header — tap is the single primary gesture, consistent with `MealSectionHeader.tsx`.)

A new `water_logs` table stores entries scoped to the user's local calendar day. Settings tab gains a "Hydration" preferences row (unit + daily goal + 3 preset volumes).

### UX Design

**Nutrition tab list header (extends `NutritionListHeader.tsx`):**
- New row below macro totals, label "Water".
- Today total line: `1,250 / 2,000 ml` (or `42 / 67 fl oz` if unit = oz).
- Thin horizontal bar (1.0 = goal). Bar caps visually at 100% but text continues to count past goal (e.g., `2,250 / 2,000 ml` is allowed; bar at 100% width, no overflow color/celebration).
- Three preset chips, e.g. `+250 ml`, `+500 ml`, `+750 ml`. Tap inserts a row with `source = 'quick'`.
- Trailing icon button "+" opens a bottom sheet with a numeric input + unit; submit creates a `source = 'custom'` row.
- Tap on the section header (label/total/bar area, NOT the chips) opens day detail. No long-press on the header.
- Bar fill color is **static neutral** for all values, both below and above goal — no color change past 100%, no celebratory tint. (Color change past goal would flip behavior-design classification to YES.)
- Quick-chip tap affordance: rely on RN `Pressable` default pressed-state flash + the bar/total animating to its new value as the sole feedback. **No haptics, no toast, no checkmark, no celebration.** This is a pure perceptual affordance, not a reward signal.

**Day detail screen (`app/nutrition/water.tsx`):**
- Top: today's total + goal + bar (same visual as header). Entries listed **newest-first** (matches `FoodLogCard` ordering).
- List of today's entries (time, amount, source). Two paths only:
  - **Swipe-left → Delete** (matches `FoodLogCard`).
  - **Tap row → edit sheet (with Delete button)** as the secondary path.
  - **No long-press** on entries (drops the third path; reduces test surface and discoverability ambiguity).
- "Add" button opens custom-amount sheet.

**Settings (`components/settings/PreferencesCard.tsx` or a new `HydrationCard.tsx`):**
- Unit toggle: `ml` / `fl oz`.
- Daily goal input: number with active unit suffix; default 2000 ml / 67 fl oz.
- Three preset buttons editable: numbers stored in user units, default 250/500/750 ml or 8/16/24 fl oz.
- "Reset to defaults" button.

**A11y:**
- All chips have `accessibilityLabel="Log {n} {unit} of water"`.
- Progress bar exposes `accessibilityRole="progressbar"` with `accessibilityValue={{min:0,max:goal,now:total}}`. On RN-Web, fall back to ARIA progressbar attrs (`role="progressbar"` + `aria-valuemin/max/now`) if the RN role is not honored by the responsive web build.
- Header "tap → day detail" gesture is announced via `accessibilityLabel="Open hydration day detail"` + `accessibilityRole="button"`.
- Delete is reachable via tap → edit sheet → "Delete" (no swipe-only path).
- Tap targets ≥44dp.

**Empty / error states:**
- No entries today → bar at 0, total reads `0 / {goal} {unit}`. No motivational copy.
- DB write failure → toast "Couldn't save water log. Try again." Entry is not added optimistically beyond the in-flight async; on failure UI rolls back.

### Technical Approach

**Schema — hand-rolled imperative SQL (NOT Drizzle-generated):**

CableSnap migrations live in `lib/db/tables.ts` (`createCoreTables` / `createExtensionTables`) called from `lib/db/migrations.ts`. Drizzle is used only as a typed query builder. Implementer must:

1. Add this DDL block to `createExtensionTables` in `lib/db/tables.ts`:
   ```sql
   CREATE TABLE IF NOT EXISTS water_logs (
     id TEXT PRIMARY KEY,
     date_key TEXT NOT NULL,         -- 'YYYY-MM-DD' in user's local TZ at insert time (matches formatDateKey output naming)
     amount_ml INTEGER NOT NULL,     -- canonical storage in ml; conversion at display
     logged_at INTEGER NOT NULL      -- ms epoch (also serves as audit trail; created_at dropped per Tech Lead suggestion)
   );
   CREATE INDEX IF NOT EXISTS idx_water_logs_date_key ON water_logs(date_key);
   ```
   - `created_at` column **dropped** for v1 (logged_at suffices; if edit-history is added later, that's a separate migration).
   - `source` column **dropped** for v1 (no UI differentiates quick vs custom; fewer surfaces to test).
   - Column named `date_key` (not `date_local`) for consistency with `formatDateKey` output naming.
2. Add `"water_logs"` to the `VALID_TABLES` allowlist at the top of `lib/db/tables.ts`.
3. Add a `sqliteTable("water_logs", { ... })` definition in `lib/db/schema.ts` so `lib/db/hydration.ts` can do typed CRUD via Drizzle.

Settings additions (existing key/value `app_settings` table; `lib/db/settings.ts` `setAppSetting(key, value)` is the API; values are TEXT — cast on read):
- `hydration.unit` = `'ml'|'fl_oz'` (default `'ml'`)
- `hydration.daily_goal_ml` = INTEGER-as-TEXT (default `'2000'`)
- `hydration.preset_1_ml` / `preset_2_ml` / `preset_3_ml` (defaults `'250'` / `'500'` / `'750'`)

Existing `components/settings/PreferencesCard.tsx` setting-row pattern is the model — follow it for the new HydrationCard.

**Architecture:**
- `lib/db/hydration.ts`: CRUD — `addWaterLog`, `deleteWaterLog`, `updateWaterLog`, `getWaterLogsForDate(dateKey)`, `getDailyTotalMl(dateKey)`. Day key derived via existing `lib/format.ts` → `formatDateKey(ts)` / `todayKey()`. (No new `lib/date-utils` module.)
- `lib/hydration-units.ts`: pure conversion `mlToOz`, `ozToMl`, `formatVolume(ml, unit)`. **Exports a named constant `MAX_SINGLE_ENTRY_ML = 5000`** so the WaterAmountSheet cap and tests share a single source of truth.
- **Data flow on the Nutrition tab uses `hooks/useNutritionData.ts`, NOT react-query.** That hook uses `useState` + `useFocusEffect` + a `load()` callback. Extend it to:
  - Add `getDailyTotalMl(dateKey)` and `getWaterLogsForDate(dateKey)` and `getAppSetting('hydration.daily_goal_ml')` etc. into the existing `Promise.all` next to `getDailyLogs / getDailySummary / getMacroTargets`.
  - Add `waterTotalMl`, `waterEntries`, `waterGoalMl`, `waterUnit`, `waterPresetsMl` to the hook's return shape.
  - Mutation handlers (`addWater`, `deleteWater`, `updateWater`) call existing `load()` afterward — matches the `remove` handler pattern at `hooks/useNutritionData.ts:49–55`.
- **Do NOT extend `loadHomeData`.** That feeds the workouts home screen (`app/(tabs)/index.tsx`), not the Nutrition tab. Source water totals from `useNutritionData` and pass `waterTotalMl` / `waterGoalMl` as new props to `NutritionListHeader`.
- New components: `components/nutrition/WaterSection.tsx`, `components/nutrition/WaterAmountSheet.tsx`, `components/nutrition/WaterDayList.tsx`. `WaterSection.tsx` carries a header comment that pastes the Hard Exclusions list verbatim (per QD condition).
- New route: `app/nutrition/water.tsx` (consistent with `app/nutrition/templates.tsx` placement).
- New settings card: `components/settings/HydrationCard.tsx` (separate from `PreferencesCard.tsx` for isolation).

**Performance:**
- Two indexed queries per nutrition-tab focus (sum + entries); negligible cost.
- Settings reads cached via existing settings hook.

**Storage:**
- ~25 bytes per entry × ≤20 entries/day = trivial.

**Dependencies:**
- No new npm packages; reuses existing bottom-sheet, drizzle, react-native-reanimated.

**Test budget:**
- Current baseline (per `scripts/audit-tests.sh` strict it/test counter): **1977**, ceiling **2100** (`MAX_TESTS` env-overridable).
- New test files (all under `__tests__/`):
  - `lib/hydration-units.test.ts` — `test.each` for ml↔oz round-trip + boundaries (~6–10 cases).
  - `lib/db/hydration.test.ts` — add/delete/update/getDailyTotal (~5–8 cases).
  - `components/water-section.test.tsx` — chip-tap renders new total + bar caps at 100% width + a11y label (~4–6 cases).
  - `acceptance/hydration-log.acceptance.test.tsx` — Acceptance #2 happy path (1–2 cases).
- **Hard cap: 25 new test cases** → post-PR ≤ 2002, well under 2100 ceiling.

**Out-of-scope (future):**
- Apple Health / Health Connect hydration write-back (separate ticket if requested).
- Weekly/monthly hydration trend chart (separate analytics ticket).
- CSV export of water logs (extend existing CSV export later).

## Scope

**In:**
- DB table + migration + drizzle schema + queries.
- Nutrition tab header water section with 3 quick chips + custom sheet.
- Day detail screen with edit/delete.
- Settings row for unit + goal + 3 presets.
- Unit conversion utilities (ml ↔ fl oz).
- Tests: unit (queries, conversion), component (header section render + chip taps), acceptance (log → see total update).

**Out:**
- Streaks, reminders, badges, animations on goal-hit (see Hard Exclusions).
- Health Connect / HealthKit write-back.
- Trend charts.
- Custom beverage types (coffee, tea — only "water" for v1).
- CSV import/export integration.
- Widgets / shortcuts.

## Acceptance Criteria

- [ ] Given an empty day, when the user opens the Nutrition tab, then the Water section shows `0 / {goal} {unit}` with a 0%-filled bar.
- [ ] Given a 250 ml chip preset, when the user taps it once, then a new `water_logs` row is persisted with `amount_ml = 250` and `date_key = todayKey()`, and the header total reflects the new value on the next render after `useNutritionData.load()` resolves. (No wall-clock budget pinned — jest fake timers cannot enforce real device latency.)
- [ ] Given the user's unit is `fl oz`, when amounts are displayed, then numbers show fl oz with one decimal where useful (e.g., `8.5 / 67 fl oz`).
- [ ] Given the user taps a preset 9 times, when total exceeds goal, then total reads the actual sum (e.g., `2,250 / 2,000 ml`), the bar caps at 100% width, the bar fill color is unchanged (static neutral), and no celebration animation, haptic, or toast fires.
- [ ] Given a logged entry, when the user opens the day detail and either swipes-left or taps the row and presses "Delete" in the edit sheet, then the entry is removed and totals refresh on the next `load()`.
- [ ] Given the user changes unit ml → fl oz in settings, when they return to the Nutrition tab, then existing entries display converted from stored ml.
- [ ] Given the user changes the daily goal, when the Nutrition tab re-renders, then the new goal is reflected in the total readout and bar denominator.
- [ ] Given a DB write failure, when the user taps a chip, then no entry persists, no total change is shown, and a toast surfaces the error.
- [ ] PR passes all tests with no regressions. Post-PR strict it/test count ≤ 2002 (baseline 1977 + ≤25 new), well under the 2100 audit ceiling.
- [ ] No new lint warnings.
- [ ] No new dependencies added to `package.json`.
- [ ] CHANGELOG.md updated under unreleased.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Day rolls over while user has nutrition tab open | New day starts at 0; old entries no longer count toward today. Achieved via `formatDateKey(Date.now())` re-derivation inside `useNutritionData`'s `load()` on every `useFocusEffect` re-run. |
| User in DST transition | `date_key` is computed via `lib/format.ts` `formatDateKey(ts)`; entries on either side of DST land in the wall-clock day. |
| User edits an entry from yesterday via day detail (future) | v1 only edits today; older days are read-only in v1 (out of scope for editing UI). |
| Negative or zero custom amount | Sheet rejects (`<=0`) with inline error "Enter an amount above 0." |
| Extremely large amount (e.g., 100,000 ml) | Sheet caps input at `MAX_SINGLE_ENTRY_ML` (5,000 ml) per single entry to prevent fat-finger; user can enter multiple. Cap exported from `lib/hydration-units.ts` so tests share it. |
| Unit change mid-session | Existing entries reflow display; stored ml unchanged. |
| Stored ml that was logged when daily goal was 1500, then goal raised to 2500 | Bar denominator uses CURRENT goal; historical day-detail also uses current goal (per simplicity for v1 — documented). |
| Sync collision (two rapid chip taps) | Each tap creates a separate row; idempotency unnecessary because each row is independent. |
| Migration on app upgrade with existing user data | New table is additive; DDL strictly `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` appended to `createExtensionTables` in `lib/db/tables.ts`. No risk to existing tables. |
| A11y: screen reader user | All chips and bar are labeled; reading order: total → bar → chips → custom. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Feature creep into streaks/badges from a future contributor | Medium | High (flips classification) | Hard Exclusions list above + a comment in `WaterSection.tsx` referencing this plan. |
| Test budget overrun (jest test count audit guard) | Low | Medium | Use `test.each` for unit conversion tests; one component test, one acceptance test only. |
| Migration ordering in hand-rolled SQL | Low | Medium | Append DDL to the **end** of `createExtensionTables` in `lib/db/tables.ts`; `IF NOT EXISTS` makes re-runs idempotent. Schema audit by techlead. |
| Unit drift between stored and displayed values | Low | Medium | Single conversion module `lib/hydration-units.ts`; unit tests cover ml↔oz round-trip. |
| Performance regression from extending `useNutritionData` `Promise.all` | Low | Low | Two extra indexed queries (sum + entries) settled in parallel with existing macro queries; no synchronous overhead. |

## Review Feedback

### Quality Director (UX)

**Verdict (rev 1): APPROVE WITH CONDITIONS** — folded into rev 2 of this plan as follows:

1. UX gesture contradiction — RESOLVED. Tap-on-header is the single primary gesture; long-press removed entirely from header.
2. Edit/delete paths collapsed to two — RESOLVED. Swipe-left → Delete + tap-row → edit sheet (with Delete). No long-press on entries.
3. File-path inaccuracies — RESOLVED. `lib/format.ts` referenced; `loadHomeData` removed in favor of `useNutritionData`; route placement confirmed.
4. Quick-chip affordance — RESOLVED. RN `Pressable` pressed-state + bar/total animation only; no haptic/toast/checkmark/celebration spelled out explicitly.
5. Bar past 100% — RESOLVED. Static neutral fill above and below goal; no color change.
6. Acceptance #2 wall-clock budget — RESOLVED. Reworded to "next render after `load()` resolves," no millisecond pin.
7. Migration safety — RESOLVED via Tech Lead correction (hand-rolled `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` appended to `createExtensionTables`).

Comment thread: BLD-599 QD comment 2026-04-25T02:18Z. Awaiting QD re-review for explicit APPROVED stamp on rev 2.

### Tech Lead (Feasibility)

**Verdict (rev 1): REQUEST CHANGES** — all 7 required corrections folded into rev 2 of this plan:

1. Hand-rolled migration in `lib/db/tables.ts` `createExtensionTables` + `VALID_TABLES` allowlist + `sqliteTable` in `lib/db/schema.ts` — RESOLVED (see Technical Approach §Schema).
2. Drop react-query for Nutrition tab — RESOLVED. `useNutritionData.ts` `Promise.all` extension specified.
3. `lib/format.ts` (not `lib/date-utils`) — RESOLVED everywhere.
4. Drop `loadHomeData` extension — RESOLVED. Water totals flow through `useNutritionData` → new props on `NutritionListHeader`.
5. Test budget pinned: baseline 1977, hard cap +25 new, post-PR ≤ 2002 — RESOLVED.
6. Acceptance #2 reworded — RESOLVED.
7. `setAppSetting`/TEXT storage cast-on-read pattern — RESOLVED.

Non-blocking suggestions also adopted: dropped `created_at`, dropped `source`, renamed `date_local` → `date_key`, centralized `MAX_SINGLE_ENTRY_ML = 5000` in `lib/hydration-units.ts`.

Comment thread: BLD-599 comment babf7279 (2026-04-25T02:31Z).

**Verdict (rev 2): APPROVED.** All 7 required corrections verified against the rev 2 plan body (commit d7a5539):
- §Technical Approach §Schema correctly cites hand-rolled DDL in `lib/db/tables.ts` `createExtensionTables` + `VALID_TABLES` allowlist + `sqliteTable` in `lib/db/schema.ts` ✅
- §Architecture extends `useNutritionData.ts` `Promise.all`/`load()`; no react-query ✅
- All `lib/format.ts` references; no `lib/date-utils` ✅
- `loadHomeData` extension removed; props flow through `NutritionListHeader` ✅
- Test budget pinned at +25 new (post-PR ≤ 2002) against 2100 ceiling ✅
- AC #2 reworded to "next render after `load()` resolves" ✅
- `setAppSetting` TEXT cast-on-read pattern documented ✅

Non-blocking suggestions all adopted: `created_at` dropped, `source` dropped, `date_local` → `date_key`, `MAX_SINGLE_ENTRY_ML = 5000` centralized.

No additional concerns. Cleared for implementation scoping.

### Psychologist (Behavior-Design)
N/A — Classification = NO. Plan explicitly excludes all behavior-design triggers (Hard Exclusions list above). If reviewers identify any added trigger, classification flips to YES and psychologist review is required before merge.

### CEO Decision
_Pending re-review of rev 2 by QD and Tech Lead._
