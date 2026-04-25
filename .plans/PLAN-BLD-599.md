# Feature Plan: Hydration tracking on Nutrition tab

**Issue**: BLD-599  **Author**: CEO  **Date**: 2026-04-25
**Status**: DRAFT → IN_REVIEW

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
- Tap on the section opens a day detail showing today's individual entries with edit/delete.

A new `water_logs` table stores entries scoped to the user's local calendar day. Settings tab gains a "Hydration" preferences row (unit + daily goal + 3 preset volumes).

### UX Design

**Nutrition tab list header (extends `NutritionListHeader.tsx`):**
- New row below macro totals, label "Water".
- Today total line: `1,250 / 2,000 ml` (or `42 / 67 fl oz` if unit = oz).
- Thin horizontal bar (1.0 = goal). Bar caps visually at 100% but text continues to count past goal (e.g., `2,250 / 2,000 ml` is allowed; bar at 100% width, no overflow color/celebration).
- Three preset chips, e.g. `+250 ml`, `+500 ml`, `+750 ml`. Tap inserts a row with `source = 'quick'`.
- Trailing icon button "+" opens a bottom sheet with a numeric input + unit; submit creates a `source = 'custom'` row.
- Long-press on the section opens day detail screen.

**Day detail screen (`app/nutrition/water.tsx`):**
- Top: today's total + goal + bar (same visual as header).
- List of today's entries (time, amount, source). Swipe-left or long-press → Delete; tap → edit amount in sheet.
- "Add" button opens custom-amount sheet.

**Settings (`components/settings/PreferencesCard.tsx` or a new `HydrationCard.tsx`):**
- Unit toggle: `ml` / `fl oz`.
- Daily goal input: number with active unit suffix; default 2000 ml / 67 fl oz.
- Three preset buttons editable: numbers stored in user units, default 250/500/750 ml or 8/16/24 fl oz.
- "Reset to defaults" button.

**A11y:**
- All chips have `accessibilityLabel="Log {n} {unit} of water"`.
- Progress bar exposes `accessibilityRole="progressbar"` with `accessibilityValue={{min:0,max:goal,now:total}}`.
- Long-press alternatives present (delete also offered via tap → edit sheet → "Delete").
- Tap targets ≥44dp.

**Empty / error states:**
- No entries today → bar at 0, total reads `0 / {goal} {unit}`. No motivational copy.
- DB write failure → toast "Couldn't save water log. Try again." Entry is not added optimistically beyond the in-flight async; on failure UI rolls back.

### Technical Approach

**Schema (new migration):**
```sql
CREATE TABLE water_logs (
  id TEXT PRIMARY KEY,
  date_local TEXT NOT NULL,         -- 'YYYY-MM-DD' in user's local TZ at insert time
  amount_ml INTEGER NOT NULL,       -- canonical storage in ml; conversion at display
  source TEXT NOT NULL CHECK(source IN ('quick','custom')),
  logged_at INTEGER NOT NULL,       -- ms epoch
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_water_logs_date_local ON water_logs(date_local);
```

Settings additions (existing key/value settings table):
- `hydration.unit` = `'ml'|'fl_oz'` (default `'ml'`)
- `hydration.daily_goal_ml` = INTEGER (default 2000)
- `hydration.preset_1_ml` / `preset_2_ml` / `preset_3_ml` (defaults 250/500/750)

**Architecture:**
- `lib/db/hydration.ts`: CRUD — `addWaterLog`, `deleteWaterLog`, `updateWaterLog`, `getWaterLogsForDate`, `getDailyTotalMl(dateLocal)`. Day key derived via existing `lib/date-utils` local-date helper.
- `lib/hydration-units.ts`: pure conversion `mlToOz`, `ozToMl`, `formatVolume(ml, unit)`.
- React Query keys: `["water","day", dateLocal]`. Invalidate on add/edit/delete.
- `loadHomeData` extension: include `today_water_ml` field; `NutritionListHeader` consumes it.
- New components: `components/nutrition/WaterSection.tsx`, `components/nutrition/WaterAmountSheet.tsx`, `components/nutrition/WaterDayList.tsx`.

**Performance:**
- Single indexed query per day; negligible cost.
- Settings reads cached via existing settings hook.

**Storage:**
- ~30 bytes per entry × ≤20 entries/day = trivial.

**Dependencies:**
- No new npm packages; reuses existing bottom-sheet, react-query, drizzle.

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
- [ ] Given a 250 ml chip preset, when the user taps it once, then `today_water_ml` increases by 250 and the header total updates within 200ms (one render cycle after the optimistic invalidation).
- [ ] Given the user's unit is `fl oz`, when amounts are displayed, then numbers show fl oz with one decimal where useful (e.g., `8.5 / 67 fl oz`).
- [ ] Given the user taps a preset 9 times, when total exceeds goal, then total reads the actual sum (e.g., `2,250 / 2,000 ml`) and the bar caps at 100% width with no celebration animation.
- [ ] Given a logged entry, when the user opens the day detail and long-presses (or taps → Delete in the edit sheet), then the entry is removed and totals refresh.
- [ ] Given the user changes unit ml → fl oz in settings, when they return to the Nutrition tab, then existing entries display converted from stored ml.
- [ ] Given the user changes the daily goal, when the Nutrition tab re-renders, then the new goal is reflected in the total readout and bar denominator.
- [ ] Given a DB write failure, when the user taps a chip, then no entry persists, no total change is shown, and a toast surfaces the error.
- [ ] PR passes all tests (~2230 baseline) with no regressions; new tests added for hydration unit/component/acceptance paths.
- [ ] No new lint warnings.
- [ ] No new dependencies added to `package.json`.
- [ ] CHANGELOG.md updated under unreleased.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Day rolls over while user has nutrition tab open | New day starts at 0; old entries no longer count toward today. Achieved via `date_local` re-derivation on focus. |
| User in DST transition | `date_local` is computed via existing local-day helper; entries on either side of DST land in the wall-clock day. |
| User edits an entry from yesterday via day detail (future) | v1 only edits today; older days are read-only in v1 (out of scope for editing UI). |
| Negative or zero custom amount | Sheet rejects (`<=0`) with inline error "Enter an amount above 0." |
| Extremely large amount (e.g., 100,000 ml) | Sheet caps input at 5,000 ml per single entry to prevent fat-finger; user can enter multiple. |
| Unit change mid-session | Existing entries reflow display; stored ml unchanged. |
| Stored ml that was logged when daily goal was 1500, then goal raised to 2500 | Bar denominator uses CURRENT goal; historical day-detail also uses current goal (per simplicity for v1 — documented). |
| Sync collision (two rapid chip taps) | Each tap creates a separate row; idempotency unnecessary because each row is independent. |
| Migration on app upgrade with existing user data | New table is additive; migration strictly `CREATE TABLE IF NOT EXISTS` + index. No risk to existing tables. |
| A11y: screen reader user | All chips and bar are labeled; reading order: total → bar → chips → custom. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Feature creep into streaks/badges from a future contributor | Medium | High (flips classification) | Hard Exclusions list above + a comment in `WaterSection.tsx` referencing this plan. |
| Test budget overrun (jest test count audit guard) | Low | Medium | Use `test.each` for unit conversion tests; one component test, one acceptance test only. |
| Migration ordering in Drizzle | Low | Medium | Append the new migration after existing ones; schema audit by techlead. |
| Unit drift between stored and displayed values | Low | Medium | Single conversion module `lib/hydration-units.ts`; unit tests cover ml↔oz round-trip. |
| Performance regression from adding new query to `loadHomeData` | Low | Low | Single SUM aggregate, indexed; rendered in existing list header without re-key. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)

**Verdict: REQUEST CHANGES** (minor — APPROVE once corrections below are folded into the plan). Concur with QD's APPROVE-WITH-CONDITIONS list. The plan's behavior-design discipline is sound; corrections are factual technical claims about the codebase.

Required plan corrections before scoping the implementation ticket:

1. **Migrations are NOT Drizzle-generated.** CableSnap uses hand-rolled `CREATE TABLE IF NOT EXISTS` SQL in `lib/db/tables.ts` (`createCoreTables` / `createExtensionTables`) called from `lib/db/migrations.ts`. Drizzle is only the typed query builder. Action: add the `water_logs` DDL block + index to `createExtensionTables`, add `"water_logs"` to the `VALID_TABLES` allowlist in `lib/db/tables.ts:5`, and add a `sqliteTable("water_logs", {...})` definition in `lib/db/schema.ts` for typed CRUD in `lib/db/hydration.ts`.
2. **Nutrition tab does NOT use react-query.** Drop the `["water","day", dateLocal]` query-key plan. Data flow is `hooks/useNutritionData.ts` (useState + useFocusEffect + `load()` callback). Extend `useNutritionData`'s `Promise.all` with `getWaterEntriesForDate` + `getDailyTotalMl` and return `waterTotalMl`/`waterEntries`/`waterGoalMl` from the hook. Mutation handlers call existing `load()` afterward (matches the `remove` handler at `useNutritionData.ts:49`).
3. **`lib/date-utils` does not exist** — use `lib/format.ts` → `formatDateKey(ts)` / `todayKey()`. (Already flagged by QD #3.)
4. **`loadHomeData` is the workout home loader, not the Nutrition tab loader.** Remove the "extend `loadHomeData` with `today_water_ml`" line. Source the water total from the extended `useNutritionData` instead.
5. **Test budget**: actual baseline (audit-tests.sh strict it/test counter) is **1977**, ceiling **2100** (env-overridable). Pin new tests at: 1 unit (`hydration-units` ~6–10 cases via `test.each`), 1 db (`db/hydration` ~5–8), 1 component (`water-section` ~4–6), 1 acceptance (~1–2). **Hard cap 25 new cases** → post-PR ≤ 2002, well under ceiling.
6. **Acceptance criterion #2 200 ms wall-clock budget**: unenforceable in jest. Reword to "header total reflects new value on the next render after `load()` resolves." (Concur with QD #6.)
7. **`app_settings` integration**: confirmed feasible. Use `setAppSetting(key, value)` from `lib/db/settings.ts` for `hydration.unit` / `hydration.daily_goal_ml` / `hydration.preset_{1,2,3}_ml` — values are TEXT (cast on read).

Confirmed feasible (no plan changes): additive migration shape, route placement at `app/nutrition/water.tsx`, no new dependencies, single conversion module, day-rollover via `useFocusEffect`-driven re-derivation.

Non-blocking suggestions: drop `created_at` (`logged_at` suffices for v1); drop `source` CHECK unless UI uses it; consider `date_key` naming over `date_local`; centralize the 5000 ml fat-finger cap as a named constant in `lib/hydration-units.ts` so tests share it.

Comment thread: BLD-599 comment babf7279 (2026-04-25T02:31Z).

### Psychologist (Behavior-Design)
N/A — Classification = NO. Plan explicitly excludes all behavior-design triggers (Hard Exclusions list above). If reviewers identify any added trigger, classification flips to YES and psychologist review is required before merge.

### CEO Decision
_Pending_
