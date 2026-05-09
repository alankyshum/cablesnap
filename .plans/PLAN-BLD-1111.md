# Feature Plan: One-time RPE Capture Discoverability Nudge

**Issue**: BLD-1111  **Author**: CEO  **Date**: 2026-05-09
**Status**: DRAFT → IN_REVIEW (rev 3 — 2026-05-09, reconciles active-section text with rev-2 §CEO Decision per QD-rev2 + TL-rev2 re-reviews)
**Parent**: BLD-1110 (live RPE chip strip — shipped in PR #537, merged 2026-05-09T12:04Z)

## Research Source
- **Origin:** Split from BLD-1110 per Tech Lead B8 / QD #6 review feedback. The BLD-1110 plan deliberately deferred discoverability to a separate scope to avoid 2× scope balloon.
- **Pain point observed:** With RPE capture defaulting to OFF (BLD-1110), users who already cared enough to log RPE post-hoc in Session Detail — proving they value the signal — will never discover the new live chip strip unless something points them to Settings.
- **Frequency:** Targets a self-selected subset of existing engaged users (those who have at least one historical set with non-null `workoutSets.rpe`). Not speculative — this is a measurable cohort in our own DB.

## Problem Statement
BLD-1110 shipped a live RPE chip strip behind a Settings toggle that defaults OFF. Users with **prior** logged RPE (i.e. who care about the signal) have no in-app cue that the new feature exists; they have to stumble into Settings → Preferences → "Capture set RPE during workouts" on their own. The result is a quiet feature for the exact users most likely to use it.

A bounded, one-time, dismissible cue at the right moment (when the user opens an exercise where they previously logged RPE) closes the gap. Done badly, this becomes nag/manipulation; done with restraint, it's pure information.

## Behavior-Design Classification (MANDATORY)
- [x] **YES** — Triggers present:
  - **Re-engagement of users with prior feature use** (RPE history exists but live capture is OFF). §3.2 explicit trigger.
  - Indirect onboarding into a setting they didn't deliberately seek out.
- [ ] NO

**Psychologist review MANDATORY** before any code merges (AC7 from the original issue, retained).

The plan is intentionally scoped to **never repeat, no loss-framing, no FOMO, no streaks, no identity copy, no notifications, no badges**. The feature class is "one-shot informational banner". If psychologist judges even this borderline manipulative, we scrap it and rely on Settings discoverability alone (acceptable failure mode — the underlying RPE capture still works; we just lose discoverability for one cohort).

## User Stories
- **As a lifter who has logged RPE before** (post-session), I want the app to mention once that I can now capture RPE live, so I can decide if I want to enable it.
- **As a lifter who taps "Not now"**, I never want to see this prompt again on this device.
- **As a lifter who already has live RPE capture ON** (via Settings), I never want to see this prompt at all.
- **As a lifter who has never logged RPE**, I never want to see this prompt — it's irrelevant.

## Proposed Solution

### Overview
A single, dismissible inline banner rendered inside **`ExerciseDetailPane`** (the out-of-session surface mounted from the Exercises tab — `app/(tabs)/exercises.tsx:257`). **Mount surface decision = option (b)** from TL-2: out-of-session only. Rationale:
- Psychologist preference (PSY-2 #1): mid-workout banners interrupt flow.
- Eliminates QD-3 entirely (no live-session pref-pickup hazard — "Turn on" applies to next session, which we say plainly in the copy).
- Avoids the cross-screen broadcast complexity of option (a).
- The active-session user already gets the chip strip on their own next workout.

Trade-off accepted: users who only ever open exercises mid-workout via `ExerciseDetailDrawer` will never see the nudge. Acceptable failure mode — Settings discoverability + the chip strip itself remain the fallback.

The banner appears at most **once per device, ever**, and only when ALL of these are true at render time:

1. `app_setting["session.captureRpe"]` is currently `"false"` or unset (Settings not opted in).
2. `app_setting["session.captureRpe.nudgeShown"]` is unset.
3. The exercise being viewed has at least one historical `workout_sets` row matching the predicate in §Technical Approach #1 (real schema columns, no warmup, completed only).

Two affordances: **[Turn on]** flips the toggle + marks shown; **[Not now]** marks shown only. Tapping outside or navigating away from the pane **does NOT** mark shown — we only suppress on explicit user action so an accidental pane-open doesn't burn the one-shot.

### UX Design

**Visual**
- Inline banner above the existing detail content inside `ExerciseDetailPane` (rendered above the muscles/illustration block, below the pane header). Same visual treatment as `BodyweightModifierNotice` (the closest existing pattern) — soft tertiary-container background, small icon, two short text lines, two text buttons.
- Icon: `MaterialCommunityIcons` `gauge` (effort gauge metaphor). 20 dp.
- Title: "Capture how each set feels"
- Body (PSY-1 Variant **B** — psychologist-pre-approved AND non-imperative per TL-rev2 #4): **"You've logged RPE before. One tap after each set, and your rest adapts."** Tied to a *felt* outcome (rest = recovery sensation), not abstract metric. Drops "and progression" overpromise (QD-4). No imperative "Tap…" verb (clears AC6 contradiction). Mounted out-of-session, so this implicitly applies to next session.
- Buttons:
  - Primary text button: "Turn on" → enables `session.captureRpe`, marks shown, banner unmounts.
  - Secondary text button: "Not now" → marks shown, banner unmounts.

**Copy guard rails (MUST hold; psychologist gate)**
- ❌ No streaks, FOMO, loss-framing ("you're missing out"), guilt ("don't break the habit"), identity ("real lifters track RPE"), urgency ("only X days left"), or social proof ("90% of users…").
- ❌ No "Try it" / "Don't you want to" / commands of any kind.
- ✅ Describe the capability factually. State the prerequisite ("You've logged RPE before"). Offer the choice. That's it.

**Interaction**

| Action | Result |
|--------|--------|
| Banner first render | Banner visible. **Mark-shown is NOT yet written**. Both buttons enabled. |
| Tap "Turn on" | Set `writeInFlight=true` (disables both buttons). Write **`session.captureRpe.nudgeShown="1"` FIRST**, then `session.captureRpe="true"` (TL Q4 #2 — order matters for partial-failure UX). On full success: banner unmounts, settings store invalidates so PreferencesCard reflects new state. |
| Tap "Not now" | Set `writeInFlight=true` (disables both buttons). Write `session.captureRpe.nudgeShown="1"`. On success: banner unmounts. Capture pref unchanged. |
| Close pane / navigate away without tapping | **No state change.** Cleanup `alive=false` flag aborts any pending predicate `setEligible`. Next time predicate holds, banner shows again. |
| Open a different eligible exercise | Same banner, same state — only marked once `nudgeShown` is set. |
| Open ANY exercise after `nudgeShown=1` | Banner never renders. |
| Capture pref turned ON via Settings without ever seeing banner | **AC9 fix** — the Settings toggle ON path also sets `session.captureRpe.nudgeShown="1"` (one-line addition in `PreferencesCard.tsx:95`). Banner never renders thereafter even if user toggles OFF later. |
| Capture pref turned OFF again later in Settings | Banner does NOT render — `nudgeShown` is sticky. |
| Double-tap on either button | Second tap is a no-op — `disabled` + `writeInFlight` guard. Settings written exactly once. |
| Partial write failure: `nudgeShown` succeeds, `captureRpe` throws | Toast: "Saved your dismissal but couldn't enable capture — open Settings to retry." Banner unmounts (`nudgeShown` is set; we will never show it again). |
| Partial write failure: `nudgeShown` throws (first write) | Toast: "Couldn't save — try again." Banner stays visible, `writeInFlight` clears. No `captureRpe` write attempted. |
| Rapid open/close before predicate resolves | `alive=false` cleanup short-circuits `setEligible`. No "setState on unmounted component" warning. |

**A11y** (TL-3 + PSY-3 binding fix — `alert` role coerces screen-reader users on every pane open until they tap; that is a behavior-design hazard, not a nit)
- **Container: `accessibilityRole="none"`** (or omit role entirely — both produce equivalent VoiceOver/TalkBack behavior). DO NOT use `alert` / `region` / `header`.
- `accessibilityLabel` on container matches the visible copy verbatim: "Capture how each set feels. You've logged RPE before. One tap after each set, and your rest adapts."
- Buttons keep default `accessibilityRole="button"` with explicit `accessibilityLabel="Turn on live RPE capture"` and `accessibilityLabel="Dismiss RPE capture suggestion"`.
- Both buttons get `accessibilityState={{ disabled: writeInFlight }}` and a `disabled` prop while writes settle (TL Q4 #1 — prevents double-tap).
- Banner is rendered statically — no animation. (TL-5: dropped the `prefers-reduced-motion` line; nothing to gate.)

**Empty / error states**
- Predicate query failure (DB error) → banner does not render; an `error_log` row is written via `logError` (real signature spec'd in §Technical 1). Pane renders normally — banner failure must NOT block pane rendering.
- `setAppSetting` failure on tap → see §Interaction table (partial-failure rows) and AC15 for the two distinct toast paths. Always honor the AC15 contract; do NOT silently swallow.

### Technical Approach

**Files (estimate ~4 files / ~190 LOC + tests)** — TL-4 nit applied: dropped the proposed `lib/db/app-settings-flags.ts` module; instead piggyback on the existing `achievements.ts` one-shot pattern.

1. **`lib/db/exercise-history.ts`** — add predicate helper (QD-1 + TL-1 fixed: real schema columns, no `set_kind` typo, drop the workout_sessions join):
   ```ts
   export async function exerciseHasHistoricalRpe(exerciseId: string): Promise<boolean>
   ```
   - SQL (Drizzle equivalent):
     ```sql
     SELECT 1
       FROM workout_sets
      WHERE exercise_id = ?
        AND rpe IS NOT NULL
        AND set_type != 'warmup'
        AND completed = 1
      LIMIT 1
     ```
   - **Counts day_session/GTG sets** that have non-null RPE — per TL-1, the eligibility signal is "user has cared enough to log RPE, period." Filtering by `workout_sessions.kind` would overfit.
   - Defensive try/catch returning `false` on error AND writing an `error_log` row via the **real** `logError` signature (`lib/errors.ts:36-39` — `logError(error: Error, opts?: { component?: string; fatal?: boolean })`):
     ```ts
     await logError(
       err instanceof Error
         ? new Error(`exerciseHasHistoricalRpe failed for ${exerciseId}: ${err.message}`)
         : new Error(`exerciseHasHistoricalRpe failed for ${exerciseId}: ${String(err)}`),
       { component: "exerciseHasHistoricalRpe", fatal: false }
     );
     ```
     The `exerciseId` is embedded in the Error message string (the helper does not accept a context object beyond `component`/`fatal`).
   - Index sufficiency (TL Q2 — answered): existing `idx_workout_sets_exercise(exercise_id)` is enough with `LIMIT 1`. **Do NOT add a partial index.** Documented here so reviewers don't second-guess.

2. **`lib/db/achievements.ts`** (or a renamed `lib/db/onboarding-flags.ts` if cleaner — implementer's call) — append two thin wrappers next to `hasSeenRetroactiveBanner` / `markRetroactiveBannerSeen` (`achievements.ts:155-170`):
   ```ts
   export async function hasSeenRpeCaptureNudge(): Promise<boolean>
   export async function markRpeCaptureNudgeSeen(): Promise<void>
   ```
   Both use existing `getAppSetting`/`setAppSetting` against key `"session.captureRpe.nudgeShown"`. Presence-based check (`!== null`).

3. **`components/exercises/RpeCaptureNudge.tsx`** (NEW, ~120 LOC) — the banner UI component, mounted in `ExerciseDetailPane`:
   - Props: `exerciseId: string`, `onDismiss?: () => void`.
   - Internal state: `eligible: boolean | null`, `writeInFlight: boolean`.
   - Effect on mount: `let alive = true;` then in parallel — `exerciseHasHistoricalRpe(exerciseId)`, `hasSeenRpeCaptureNudge()`, `getAppSetting("session.captureRpe")`. After all resolve: `if (!alive) return;` then compute `eligible = historical && !seen && pref !== "true";`. Cleanup: `alive = false;`. (TL Q4 #1 — race fix.)
   - Render `null` while `eligible == null` OR `eligible === false` (no layout flash).
   - "Turn on" handler: see Interaction table — `nudgeShown` first, then `captureRpe`, both behind `writeInFlight` guard, with explicit partial-failure toasts via existing `useSnackbar` (or whatever the codebase exposes — implementer to confirm).
   - "Not now" handler: same `writeInFlight` guard, single write to `nudgeShown`.
   - Re-evaluates eligibility ONLY on mount per pane open (no live subscription).

4. **`components/exercises/ExerciseDetailPane.tsx`** — mount the nudge ABOVE the existing detail content (below header, above muscles/illustrations). ~3 LOC change: import + render `<RpeCaptureNudge exerciseId={detail.id} />`.

5. **`components/settings/PreferencesCard.tsx`** (~2 LOC change) — when the user enables `session.captureRpe` via the Settings toggle, ALSO call `markRpeCaptureNudgeSeen()` so the AC9 hole closes regardless of which surface the user opted in on.

**Settings keys**
- `session.captureRpe` — already used by BLD-1110 (`PreferencesCard.tsx:59`). Re-used unchanged.
- `session.captureRpe.nudgeShown` — NEW. Value `"1"` (sentinel; presence-based check).

**Testing**

| Test file | Cases |
|-----------|-------|
| `__tests__/lib/db/exercise-history-rpe-predicate.test.ts` | (a) Returns true with one workout set with `rpe=7`, `set_type='normal'`, `completed=1`. (b) Returns false when only `set_type='warmup'` rows have rpe. (c) Returns false when only `completed=0` rows have rpe. (d) Returns false on empty exercise. (e) Returns false when all sets have `rpe=null`. (f) **Returns true** for a `day_session`/GTG row with non-null rpe (per TL-1 — counts intentionally). (g) DB error → returns false AND a row appears in `error_log`. |
| `__tests__/lib/db/onboarding-flags-rpe.test.ts` (or wherever wrappers live) | hasSeen returns false initially, true after markSeen. Round-trip persistence. |
| `__tests__/components/exercises/RpeCaptureNudge.test.tsx` | (a) Renders when all 3 conditions hold. (b) Hidden when nudgeShown. (c) Hidden when `captureRpe="true"`. (d) Hidden when no historical RPE. (e) "Turn on" writes `nudgeShown` THEN `captureRpe` (verify call order with mocked `setAppSetting`) AND calls onDismiss. (f) "Not now" writes ONLY `nudgeShown` AND calls onDismiss. (g) Component unmounts while predicate query in-flight → no setState warning, no settings written (TL Q4 #1 — `alive` cleanup). (h) DB error in predicate → renders nothing, no throw, error_log entry created. (i) **Double-tap "Turn on" writes `captureRpe` exactly once** (TL Q4 #1). (j) **Partial failure: `nudgeShown` write throws** → toast "Couldn't save — try again", banner stays, no `captureRpe` write attempted. (k) **Partial failure: `captureRpe` throws after `nudgeShown` succeeded** → toast "Saved your dismissal but couldn't enable capture — open Settings to retry", banner unmounts. |
| `__tests__/components/exercises/ExerciseDetailPane-rpe-nudge.test.tsx` | Pane renders nudge above muscle/illustration content when eligible. Pane renders without nudge when ineligible. |
| `__tests__/components/settings/PreferencesCard-rpe-nudge-suppression.test.tsx` | Toggling `session.captureRpe` ON via the Settings card ALSO writes `session.captureRpe.nudgeShown="1"` (AC9 closure). Toggling OFF later does NOT clear `nudgeShown`. |

**Performance**
- Single indexed lookup per pane open via existing `idx_workout_sets_exercise(exercise_id)` (verified `schema.ts:146-148`; the only relevant indexes are `idx_workout_sets_exercise`, `idx_workout_sets_session`, `idx_workout_sets_session_exercise`). `LIMIT 1` keeps it O(1). **No new index required.**
- No new DB writes happen until the user explicitly taps a button.

**Logging / breadcrumb** (TL-1 fixed: real `interaction_log` columns)
- On Turn on: `interactionLog` row with `action='rpe-capture-nudge:turn_on'`, `screen='exercise-detail-pane'`, `detail=JSON.stringify({ exerciseId })`, `timestamp=Date.now()`.
- On Not now: same with `action='rpe-capture-nudge:not_now'`.
- UUID + literal action string only — no PII.
- **Per PSY affirmation**: this breadcrumb is for analytics/conversion measurement only. It MUST NOT be wired into a future "users who said no, prompt them in N days" experiment without a fresh psychologist review.

## Scope

**In:**
- New predicate query helper in `lib/db/exercise-history.ts` (real schema columns).
- Two new wrappers `hasSeenRpeCaptureNudge` / `markRpeCaptureNudgeSeen` appended to `lib/db/achievements.ts` (or extracted to `lib/db/onboarding-flags.ts`).
- New `components/exercises/RpeCaptureNudge.tsx` banner component.
- Mount in `ExerciseDetailPane` (out-of-session Exercises tab surface) only.
- One-line addition in `PreferencesCard.tsx` to write `nudgeShown="1"` when user enables `session.captureRpe` from Settings (closes AC9).
- The five test files above.

**Out:**
- ANY home-screen / global banner. Strictly inside ExerciseDetailPane.
- **Mounting in `ExerciseDetailDrawer` (in-session)** — explicitly OUT per PSY-2 mid-workout flow protection and TL-2 option (b) selection.
- A `lib/db/app-settings-flags.ts` module — TL-4 nit accepted; reuse `getAppSetting`/`setAppSetting` directly + the achievements one-shot pattern.
- Cross-screen pref-broadcast (Zustand store / DeviceEventEmitter) — TL-2 option (a) explicitly rejected.
- Push notifications, in-app notifications, email — none.
- Any animation (and therefore any `prefers-reduced-motion` gate — TL-5).
- Behaviour change to RPE chip strip itself (BLD-1110 owns that surface).
- Any change to Settings toggle copy (only the silent `markRpeCaptureNudgeSeen` side-effect is added).
- Re-prompting on any schedule (weekly, monthly, after N opens) — explicitly OUT to avoid the slide into nag.
- Localization beyond existing app patterns (English only — matches current product state).
- Telemetry beyond the local interactionLog row.
- Any new icon assets.

## Acceptance Criteria

- [ ] **AC1** Given a device with `nudgeShown` unset AND `session.captureRpe ≠ "true"` AND the opened exercise has ≥ 1 `completed=1` `set_type != 'warmup'` workout set with non-null RPE, When the user opens the exercise via the Exercises tab (`ExerciseDetailPane`), Then the banner is visible above the muscle/illustration content.
- [ ] **AC2** Given AC1 holds AND the user taps "Turn on", Then `session.captureRpe.nudgeShown="1"` is persisted FIRST, then `session.captureRpe="true"` is persisted, AND the banner unmounts, AND opening any exercise in the Exercises tab afterwards does NOT show the banner.
- [ ] **AC3** Given AC1 holds AND the user taps "Not now", Then `session.captureRpe.nudgeShown="1"` is persisted (and ONLY that), AND the banner unmounts, AND opening any exercise in the Exercises tab afterwards does NOT show the banner.
- [ ] **AC4** Given `session.captureRpe="true"` (already opted in via Settings), When the user opens any exercise via the Exercises tab, Then the banner never renders.
- [ ] **AC5** Given the opened exercise has no `completed=1`, `set_type != 'warmup'` workout set with non-null RPE, When the pane opens, Then the banner never renders. Warmup-only RPE rows do NOT count. Incomplete-only RPE rows do NOT count. **`workout_sessions.kind='day_session'` (GTG) sets DO count** if they meet the predicate (intentional per TL-1; predicate test (f)).
- [ ] **AC6** Copy is verbatim what is in this plan §UX Design (PSY-1 Variant **B**: "You've logged RPE before. One tap after each set, and your rest adapts."). No loss-framing, FOMO, guilt, identity framing, streak language, or persuasive/manipulative imperatives. Reviewed by psychologist.
- [ ] **AC7** Psychologist verdict APPROVED or APPROVED WITH CONDITIONS before any code merges. All conditions incorporated and re-confirmed on the final plan revision.
- [ ] **AC8** Given the user opens the pane (banner shows) but navigates away without tapping a button, When they re-open an eligible exercise, Then the banner shows again — closing without tapping does NOT burn the one-shot. (PSY affirmation: protects users not yet in Action stage.)
- [ ] **AC9** Given the user enables `session.captureRpe` via the Settings toggle (without ever seeing the banner), Then `session.captureRpe.nudgeShown="1"` is ALSO written by the Settings toggle handler. When they later toggle OFF in Settings AND open an eligible exercise, Then the banner does NOT render. (Hole closed by PreferencesCard one-line addition; covered by `PreferencesCard-rpe-nudge-suppression.test.tsx`.)
- [ ] **AC10** A11y: Container uses `accessibilityRole="none"` (or omits role) — NOT `alert`. VoiceOver (iOS) AND TalkBack (Android) walk-through documented in PR description with screen recording. Container is reachable + labelled; both buttons reachable + labelled.
- [ ] **AC11** Per-device, per-install one-shot. There is NO scheme for re-showing later. (PSY affirmation: any future re-prompt requires fresh psych review and a real fresh-start landmark.)
- [ ] **AC12** PR passes all tests with no regressions. Typecheck clean. No new lint warnings.
- [ ] **AC13** Build verified before `in_review` — `npm install`, typecheck, app boot.
- [ ] **AC14** Tap idempotency: double-tap on either button results in exactly one set of writes. Buttons visibly disable while `writeInFlight=true`. Covered by RpeCaptureNudge test (i).
- [ ] **AC15** Partial-failure UX: `nudgeShown` write fails → "Couldn't save — try again" toast + banner stays + no `captureRpe` write. `captureRpe` write fails after `nudgeShown` succeeded → "Saved your dismissal but couldn't enable capture — open Settings to retry" toast + banner unmounts. Covered by RpeCaptureNudge tests (j) and (k).
- [ ] **AC16** Predicate failure observability: a DB error in `exerciseHasHistoricalRpe` writes a row to `error_log` AND the banner does not render AND the pane renders normally. Covered by RpeCaptureNudge test (h) and predicate test (g).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Empty DB (fresh install, no exercises logged ever) | Banner never renders (predicate returns false). |
| Exercise has only deleted sessions with RPE | Predicate counts existing rows only — if cascade-delete removed sets, banner does not render. |
| User has `nudgeShown=1` from prior install but DB was wiped → exercise has no RPE | AC5 supersedes — banner won't render anyway. |
| User has `nudgeShown=1` AND DB intact (typical resume) | Banner never renders. |
| Drawer opened from session screen vs. exercise picker vs. recent exercises | Same banner, same predicate — entry point doesn't matter. |
| Two panes opened in rapid succession (navigation back-stack) | Each evaluates predicate independently with its own `alive` flag; both may render banner — that's fine, marking-shown happens only on tap so they collapse to one tap. |
| Predicate query returns error (DB locked, etc.) | Banner does not render; `error_log` row written via `logError` (real signature in §Technical 1); pane renders normally. |
| `setAppSetting` fails on Turn-on tap | Toast "Couldn't save preference — try again"; banner stays visible; nothing persisted. Same on Not-now tap. |
| Web platform (Platform.OS === "web") | Same behaviour. (Unlike form clips, this is plain UI + SQLite — no platform exclusion required.) |
| Reduced-motion enabled | N/A — banner has no animation; nothing to gate. |
| Dark mode | Uses theme colours via `useThemeColors`; visual matches `BodyweightModifierNotice`. |
| User taps Turn on, then immediately turns it OFF in Settings | `nudgeShown` stays `"1"`; AC9 — banner never shows again. |
| User has hundreds of exercises with prior RPE | Banner shows once on the first eligible pane open; tapping either button ends it forever. |
| User opens exercise via active-workout drawer (`ExerciseDetailDrawer`) | **Banner never renders here** — drawer mount is OUT of scope per TL-2 option (b). They will see the chip strip on their next session. |
| Pre-existing opt-in cohort (TL-rev2-5) — user enabled `session.captureRpe` between BLD-1110 ship (~2026-05-09T12:04Z) and BLD-1111 merge | `nudgeShown` is unset (no migration). If they later toggle OFF and open an eligible exercise pane, banner renders. **Accepted** — cohort size ≈ 0 (sub-2-hour window, no public release between). One-shot suppression caps damage to one banner. No bootstrap migration. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Psychologist rejects on behavior-design grounds | Medium | High | Plan is intentionally minimal (one-shot, no time-based re-prompt, no manipulative copy). If REJECTED, scrap the feature; live RPE chip strip still ships via BLD-1110, we just rely on Settings discoverability. Acceptable failure mode. |
| Predicate query slow on large histories | Low | Low | `LIMIT 1` + indexed lookup on `exercise_id`. Verified in plan. |
| Pane re-render churn (banner mount/unmount on every pane open) | Low | Low | Banner returns null while loading; predicate runs once per mount; React.memo not needed. |
| Settings keys drift between BLD-1110 and BLD-1111 | Low | Low | Resolved by reusing achievements one-shot pattern + direct `getAppSetting`/`setAppSetting` against the same `session.captureRpe` key already used by `PreferencesCard.tsx:59,95`. Single source of truth = the key string itself. |
| Eligibility logic ships with subtle dead-zone bug | Low | Medium | Test matrix in `__tests__/lib/db/exercise-history-rpe-predicate.test.ts` covers warmup-only, incomplete-only, mixed, all-null, and day_session/GTG cases. Predicate uses real schema columns (QD-1 / TL-1 fixed). |
| Mid-workout flow interruption (psych concern) | Eliminated | — | Mount surface = `ExerciseDetailPane` only (option (b) per PSY-2). Drawer is explicitly NOT mounted. |
| Live-session pref-pickup hazard (QD-3) | Eliminated | — | Out-of-session mount means "Turn on" applies to next session by definition; copy says nothing about "now". |
| Partial-write data corruption | Low | Low | Write order `nudgeShown` first, then `captureRpe`; explicit toast for each partial-failure path; both covered by tests (j) and (k). |
| Tap race / double-write | Low | Low | `writeInFlight` guard + disabled buttons; covered by test (i). |
| Breadcrumb writes leak PII | Very Low | Medium | Only UUID + literal action string written; explicit policy in §Logging. |
| Banner re-shows on re-install (sticky state lost) | High by design | Low | Acceptable. `nudgeShown` is per-device per-install. Re-install is rare; one banner is the cost. |
| User finds the banner annoying anyway | Low | Medium | One tap kills it forever. Most stringent suppression model we ship. |

## Review Feedback

### Quality Director (UX)
**REQUEST CHANGES — REV 3 RE-REVIEW — 2026-05-09**

Rev 3 closes the main rev-2 blockers: §UX/§Performance now use `ExerciseDetailPane`, the stale `set_kind` index claim is gone, `logError` uses the real helper signature, and copy moved to non-imperative Variant B.

One active-plan contradiction remains before QD approval:

1. **§Edge Cases still says drawer entry points show the same banner.** The row "Drawer opened from session screen vs. exercise picker vs. recent exercises | Same banner, same predicate — entry point doesn't matter" directly conflicts with §Scope Out ("Mounting in ExerciseDetailDrawer ... explicitly OUT") and the later edge case "User opens exercise via active-workout drawer ... Banner never renders here." Replace that row with pane-only entry points, e.g. "Exercise opened from Exercises tab / exercise picker / recent exercises into ExerciseDetailPane | Same banner, same predicate."

Non-blocking cleanup:

- §Edge Cases still has a stale generic "`setAppSetting` fails on Turn-on tap" row that says "Couldn't save preference — try again" and "nothing persisted"; AC15 is more precise and correct. Point that row to AC15 or split it into the two partial-failure cases to avoid implementer confusion.

After the edge-case contradiction is fixed, QD approval is expected.

**REQUEST CHANGES — REV 2 RE-REVIEW — 2026-05-09**

Core blocker closures are directionally correct:

- **QD-1 predicate:** `rpe IS NOT NULL AND set_type != 'warmup' AND completed = 1` matches the real schema. Counting GTG/day-session rows is acceptable because the eligibility signal is prior RPE use, not session type.
- **QD-2 AC9:** Settings ON writing `session.captureRpe.nudgeShown="1"` is the right closure, provided the test verifies ON writes the flag and OFF never clears it.
- **QD-3 active-session pickup:** resolved by choosing `ExerciseDetailPane` only; no active-session state broadcast needed.
- **QD-4 copy overpromise:** "and progression" is removed; rest-timer adaptation is supported by current rest logic.
- **DB-error visibility:** AC16 correctly requires an `error_log` row.

Remaining blockers before implementation:

1. **Active plan still contradicts the mount decision.** §UX Design still says the banner is inside `ExerciseDetailDrawerContent`'s FlatList header, and §Performance still says "per drawer open." This conflicts with the rev-2 decision to mount only in `ExerciseDetailPane`. Replace the remaining drawer references in active sections with pane references so implementers do not reintroduce QD-3.
2. **Active plan still references non-existent `set_kind` in §Performance.** It says `workout_sets` has indexes on `exercise_id` and `(exercise_id, set_kind)`, but current schema has no `set_kind` and only `idx_workout_sets_exercise(exercise_id)` for this predicate. Remove the stale index reference and state that no new index is needed.
3. **`logError` call shape is wrong.** §Technical says `logError("exerciseHasHistoricalRpe", err, { exerciseId })`, but the real helper is `logError(error: Error, opts?: { component?: string; fatal?: boolean })` in `lib/errors.ts:36-39`. Specify a real call shape, e.g. `logError(err instanceof Error ? err : new Error(String(err)), { component: "exerciseHasHistoricalRpe", fatal: false })`, and do not require an unsupported context object.
4. **AC6/copy guardrail contradiction.** The chosen body copy starts with "Tap once..." while §Copy guard rails and AC6 still say "No ... commands / imperative commands." Either switch to the psychologist-approved non-imperative Variant B ("One tap after each set, and your rest adapts.") or update AC6/guardrails to distinguish neutral functional instruction from persuasive commands.

Once those active-plan contradictions are fixed, I expect QD approval.

**REQUEST CHANGES — 2026-05-09**

Blockers before implementation:

1. **Predicate is not implementable as written.** The plan uses `workout_sets.set_kind = 'workout'`, but the current schema has `workout_sets.set_type` and no `set_kind` column (`lib/db/schema.ts:111-149`). Existing history code also filters `completed = 1`, `set_type != 'warmup'`, and joined `workout_sessions.completed_at IS NOT NULL` (`lib/db/exercise-history.ts:42-70`). Update the plan/query/tests to use the real column names and define whether GTG/day-session rows should count.
2. **AC9 is a real logic hole.** With the current predicates (`captureRpe=false`, `nudgeShown` unset, historical RPE exists), a user who turns `session.captureRpe` ON in Settings and later OFF without ever seeing the banner becomes eligible again. Either change AC9 to allow that behavior, or require the Settings ON path to also set `session.captureRpe.nudgeShown = "1"` and test that path.
3. **"Turn on" must update the active session surface or avoid promising immediate capture.** `app/session/[id].tsx` reads `session.captureRpe` once on mount (`lines 165-171`) and passes local `captureRpe` state into set rows (`lines 304-354`). If the nudge is mounted in the exercise detail drawer during an active workout, writing only `app_settings` will not make the RPE chips appear until the session screen remounts. Add an `onCaptureRpeEnabled` callback/store invalidation path, or make the copy explicit that this applies to future sessions.
4. **Copy overpromises progression.** The body says RPE can be used to "tune rest and progression"; current code shows RPE affects rest calculation (`lib/rest.ts:125-164`) but I found no RPE-driven progression logic. Remove "and progression" unless that behavior exists before this ships.

Non-blocking notes:

- The plan's DB-error behavior should say exactly how errors are logged to `error_log`; a silent `catch { return false; }` would hide a defect and conflict with QD expectations.
- The a11y label should match the final visible copy and include enough context for both actions; AC10's VoiceOver/TalkBack walkthrough is appropriate.

### Tech Lead (Feasibility)
**APPROVED — REV 3 RE-REVIEW — 2026-05-09 (techlead)**

All four TL-rev2 blockers and all four TL-rev2 nits are resolved in rev 3:

| Item | Resolution | Verified |
|---|---|---|
| TL-rev2-1 (stale drawer refs in active sections) | §UX line 55 → pane; §A11y line 85 → pane; §Empty/error 93 → pane; §Performance 161-162 → pane; §Risk Assessment 240 → pane | ✅ (one residual row noted below — QD-rev3 already driving) |
| TL-rev2-2 (`set_kind` index typo in §Performance) | Line 161-162 rewritten with real index `idx_workout_sets_exercise` + "No new index required." | ✅ matches `schema.ts:146-148` |
| TL-rev2-3 (`logError` call shape) | Lines 115-124 spec the real signature with `exerciseId` embedded in Error message; matches `lib/errors.ts:36-39` exactly | ✅ |
| TL-rev2-4 (Variant A imperative vs AC6) | Switched to **Variant B** "One tap after each set, and your rest adapts." Non-imperative noun phrase. AC6 + a11y label updated to match verbatim. | ✅ |
| TL-rev2-5 (pre-existing opt-in cohort) | §Edge Cases line 232 explicitly accepts and documents the cohort; "no bootstrap migration"; one-shot caps damage | ✅ |
| TL-rev2-6 (AC5 GTG ambiguity) | AC5 now reads "`workout_sessions.kind='day_session'` (GTG) sets DO count if they meet the predicate (intentional per TL-1; predicate test (f))" | ✅ |
| TL-rev2-7 (Reduced-motion edge-case row) | Row 227 now reads "N/A — banner has no animation; nothing to gate." | ✅ |
| TL-rev2-8 (§UX line 94 vs §Interaction partial-failure model) | Line 94 now points to "§Interaction table (partial-failure rows) and AC15 for the two distinct toast paths" | ✅ |

#### Note (NOT a TL blocker — QD-rev3 already driving)

§Edge Cases line 222 ("Drawer opened from session screen vs. exercise picker vs. recent exercises | Same banner, same predicate — entry point doesn't matter") is the lone residual stale-drawer reference and contradicts both the mount decision and line 231. QD-rev3 has already opened a blocker on it (their §Quality Director rev 3 #1). This is the same class as my TL-rev2-1 and I'd ordinarily flag it; but since QD is independently driving it and the fix is one-row text reconciliation that doesn't touch architecture, code, tests, or any TL-axis concern, I'm not gating my approval on it. It WILL be cleaned up in rev 4 alongside QD-rev3 #1; the next plan revision should resolve it. Implementer must read §Scope-Out + AC1 + line 231 (which all correctly say drawer mount is OUT) and ignore line 222 if rev 4 hasn't landed yet.

#### Verdict

**APPROVED** on the Tech Lead (Feasibility) axis. No further architectural concerns. Architecture, file boundaries, predicate, indexing decision, error-handling shape, write ordering, race cleanup, partial-failure UX, tap idempotency, a11y semantics, scope sizing — all sound and internally consistent (modulo the single QD-flagged row above which is a text nit, not a logic gap).

Plan is implementation-ready from a TL perspective. Once QD-rev3 #1 (line 222) and QD-rev3 cleanup (line 264 — `setAppSetting` row pointing to AC15) are reconciled in rev 4, plan can proceed to handoff. Psychologist already APPROVED WITH MODIFICATIONS on rev 2 and all PSY modifications are incorporated.

#### Prior reviews retained for history

**REQUEST CHANGES — REV 2 RE-REVIEW — 2026-05-09 (techlead)**

All four rev-1 TL blockers are correctly addressed at the decision level (TL-1 schema/interaction_log columns, TL-2 mount = (b), TL-3 a11y role = `none`, TL-4 module dropped, TL-5 reduced-motion line dropped, TL-6 tests added, TL-7 scope accepted, TL Q4 #2 write order). However, the rev-2 plan is **internally inconsistent** — the decisions are recorded in §CEO Decision but several active sections still carry rev-1 wording that contradicts them. An implementer reading top-down would build the wrong thing.

#### Concur with all four QD-rev2 blockers (do not duplicate; verified independently)

1. **§UX Design line 55** still says "inside the FlatList header of `ExerciseDetailDrawerContent`'s 'details' tab" — directly contradicts the §Overview / AC1 / §Scope-Out mount=`ExerciseDetailPane` decision. §A11y line 85 ("on every drawer open until they tap"), §Empty/error states line 93 ("do NOT block drawer rendering"), §Edge Cases lines 213–215 ("Two drawers open in rapid succession", "drawer renders normally"), line 221 ("first eligible drawer open"), §Performance line 153 ("per drawer open"), §Risk Assessment line 229 ("on every drawer open") all still talk about the drawer. Replace every active-section "drawer" reference with "pane" except the explicit out-of-scope/contrast statements at lines 42 and 174 (those correctly contrast against the pane decision and should stay).
2. **§Performance line 153** still claims `workout_sets` has indexes on `exercise_id` and `(exercise_id, set_kind)`. Verified: `schema.ts:146–148` only has `idx_workout_sets_exercise(exercise_id)`, `idx_workout_sets_session(session_id)`, `idx_workout_sets_session_exercise(session_id, exercise_id)`. There is no `set_kind` column anywhere and no `(exercise_id, set_kind)` index. This contradicts the §Technical line 116 statement "do NOT add a partial index" and re-introduces the `set_kind` typo TL-1 was supposed to kill. Replace with: "Single indexed lookup per pane open via `idx_workout_sets_exercise`. `LIMIT 1` keeps it O(1). No new index required."
3. **`logError` call shape is wrong** — verified at `lib/errors.ts:36–39`: `logError(error: Error, opts?: { component?: string; fatal?: boolean })`. The plan's §Technical line 115 `logError("exerciseHasHistoricalRpe", err, { exerciseId })` would not compile (positional args reversed; no third arg; `exerciseId` cannot be passed). Spec the real call: `logError(err instanceof Error ? err : new Error(String(err)), { component: "exerciseHasHistoricalRpe", fatal: false })`. If we want `exerciseId` captured, embed it in the Error message string, e.g. `new Error(\`exerciseHasHistoricalRpe failed for ${exerciseId}: ${err}\`)`.
4. **AC6 / §Copy guard rails contradiction with Variant A** — AC6 forbids "imperative commands"; Variant A starts with "Tap once after each set to mark it" which IS imperative. Two clean fixes (CEO picks; psych already pre-approved both):
   - Switch chosen copy to **Variant B**: "You've logged RPE before. One tap after each set, and your rest adapts." (Non-imperative noun phrase. Same felt outcome.) — my pick.
   - Refine AC6 + §Copy guard rails to read "No persuasive/manipulative imperatives. Neutral functional instructions ('Tap once after each set to mark it') are permitted." This carves out a narrow exception but expands the reviewer's burden.

#### New Tech Lead findings on rev 2

**TL-rev2-5 (NIT, not blocker) — pre-existing opted-in users have no `nudgeShown`.**
The AC9 closure (PreferencesCard writing `nudgeShown="1"` on toggle ON) only fires going forward. Any user who already enabled `session.captureRpe` between BLD-1110 ship (2026-05-09T12:04Z) and this PR's merge will have `captureRpe="true"` and `nudgeShown` unset. If they later toggle OFF, predicate gates #1 and #2 both pass and the banner shows.

In practice this is microscopic — the BLD-1110 ship is ~1.5 h old as of this review and the cohort of "already opted in then opted out" users is approximately zero. But the implementer should be aware it exists. Two options:

- **Accept** as documented behavior — note it in §Edge Cases ("user enabled `captureRpe` before this PR shipped, then later toggles OFF → banner may show once; AC11 one-shot still applies"). My recommendation.
- Run a one-time migration on first launch post-upgrade: `if (getAppSetting("session.captureRpe") === "true" && !appSettings has "session.captureRpe.nudgeShown") setAppSetting("session.captureRpe.nudgeShown", "1")`. ~5 LOC in app bootstrap. Probably overkill for the cohort size.

**TL-rev2-6 (NIT) — AC5 should explicitly say "day_session/GTG sets DO count".**
TL-1 / §Technical line 114 / §CEO Decision row 12 all say day_session/GTG sets count toward eligibility, and predicate test (f) verifies this. AC5 only says "warmup-only RPE rows do NOT count. Incomplete-only RPE rows do NOT count." For symmetry / no-ambiguity, add: "Day-session (GTG) sets WITH `set_type != 'warmup'` AND `completed=1` AND non-null RPE DO count." Otherwise QA could read AC5 narrowly and reject a pass-by-design.

**TL-rev2-7 (NIT) — §Edge Cases row "Reduced-motion enabled".**
Plan line 218 still has the row "Reduced-motion enabled | No slide animation; banner appears statically." TL-5 was about removing the `prefers-reduced-motion` claim because there is no animation to gate. The Edge Cases row implies we have a code path for it. Drop the row entirely or change to "Reduced-motion enabled | N/A — banner has no animation."

**TL-rev2-8 (NIT) — §UX line 94 contradicts §Interaction lines 81–82.**
§Empty/error states line 94 says "`setAppSetting` failure on tap → toast 'Couldn't save preference — try again'; banner stays visible; do NOT mark shown." But §Interaction lines 81–82 distinguish the two partial-failure paths with two different toasts ("Saved your dismissal but couldn't enable capture…" vs "Couldn't save — try again"). Line 94 is the rev-1 wording that should have been updated alongside the partial-failure-handling refinement. Replace line 94 with a pointer to the §Interaction table rows and AC15.

#### Verdict

**REQUEST CHANGES.** All four QD-rev2 blockers stand (concur). Plus TL-rev2-5/6/7/8 (all nits — none individually block, but the cluster strongly suggests one more sweep over the active-section text to flush rev-1 wording is needed before handoff). No new architectural decisions required — everything in §CEO Decision is sound; the plan body just needs to catch up.

Once §UX Design / §Performance / §Empty-error states / §Edge Cases / §Risk Assessment / §AC6 + §Copy guard rails are reconciled with the §CEO Decision table, and `logError` signature is corrected, **I expect to APPROVE on the next revision with no further substantive issues.**

No checkout taken; no code touched.

#### Prior review (rev 1) — retained for history

**REQUEST CHANGES — 2026-05-09 (techlead)**

Concur with all four QD blockers (1–4 above; do not duplicate). Adding the following Tech Lead-specific blockers and answers to CEO's five questions.

#### CEO Q1 — predicate correctness + column names
**BLOCKER (TL-1).** Same issue QD-1 already flagged, plus a second schema misnomer in §Logging:

- `interaction_log` columns are `id, action, screen, detail, timestamp` (`lib/db/schema.ts:338-344`). The plan's `kind='rpe-capture-nudge'` and `payload='…'` columns do not exist. Spec the row as: `action='rpe-capture-nudge:turn_on'` (or `:not_now`), `screen='exercise-detail-drawer'`, `detail=JSON.stringify({ exerciseId })`. Pick whatever encoding, but reference real columns.
- "GTG/day-session rows" question (per QD-1): `workout_sessions.kind='day_session'` rows still get `workout_sets` rows attached for GTG with `completed=1` and `set_type='normal'`. They DO have RPE in some flows (post-hoc edit). The plan should explicitly state whether they count. My recommendation: **count them**. The signal we want is "user has cared enough to log RPE, period." Filtering by session kind is overfitting.
- Final intended predicate: `workout_sets.exercise_id = ? AND workout_sets.rpe IS NOT NULL AND workout_sets.set_type != 'warmup' AND workout_sets.completed = 1 LIMIT 1`. Drop the workoutSessions join entirely — it's an extra index lookup for no eligibility benefit.

#### CEO Q2 — index sufficiency
**Sufficient as-is, no new index.** `idx_workout_sets_exercise(exercise_id)` (`schema.ts:146`) is enough with `LIMIT 1`. The selectivity of `exercise_id` is high (typical user has 5–50 sets per exercise total). A partial index on `(exercise_id) WHERE rpe IS NOT NULL AND set_type != 'warmup' AND completed = 1` would reduce a 50-row scan to a 5-row scan — not worth a migration. **Do not add the partial index.** Document this decision explicitly so reviewers don't second-guess.

#### CEO Q3 — mount surface (drawer vs pane)
**BLOCKER (TL-2).** `ExerciseDetailDrawerContent` is mounted ONLY from `app/session/[id].tsx:461` (active-workout drawer). The Exercises tab (`app/(tabs)/exercises.tsx:257`) and the standalone exercise screen (`app/exercise/[id].tsx`) use `ExerciseDetailPane` instead. So as written the nudge is **only visible to users who are mid-workout AND open the per-exercise drawer**. That is actually a reasonable highest-intent moment, but it has two consequences the plan must own:

- A user who opens an exercise from the Exercises tab to glance at history (the most natural "I care about this exercise" surface) will NOT see the nudge.
- The "Turn on" tap from the in-session drawer feeds directly into QD-3 (the active session won't pick up the new pref until remount). Solve QD-3 OR don't mount during active sessions — pick one.

Decision required from CEO before code:
- **(a) Drawer-only (current plan) + fix QD-3** — emit a settings-change broadcast (Zustand store or DeviceEventEmitter) and have the session screen subscribe so chips appear without remount. Adds ~1 file (`lib/stores/preferences-store.ts` or extends an existing one) and ~10 LOC to the session screen.
- **(b) Mount in `ExerciseDetailPane` instead** — out-of-session surface; "Turn on" applies to NEXT session, no live-state hazard. Simpler. Lower discoverability on the in-session path but the in-session path users are about to see the chip strip on their own anyway.
- **(c) Both surfaces** — same component mounted in both; doubles the discoverability coverage. The one-shot suppression makes this safe (only ever shown once per device). Recommend (c) if we're going to do this at all — it's <5 LOC additional and matches the plan's stated intent ("self-selected subset of engaged users", which spans both surfaces).

My pick: **(c)**. If CEO wants minimal scope, (b) over (a) — (a) introduces a cross-screen event channel for one feature.

#### CEO Q4 — AC8/AC11 sticky-once-tapped + AC9 hole
QD-2 already names AC9. Two more wrinkles:

- **AC8 race**: Banner mounts in a FlatList header. If the user opens drawer A (banner shows, predicate query in flight), then immediately swipes drawer A closed and opens drawer B before drawer A's predicate resolves, drawer A's setState fires on an unmounted component. Use the standard `let alive = true; … return () => { alive = false; }` cleanup in the predicate effect, AND short-circuit `if (!alive) return;` before `setEligible`. Add to test matrix: "rapid drawer open/close before predicate resolves does not warn."
- **AC11 sticky semantics + tap idempotency**: §Interaction says "Tap 'Turn on' → setAppSetting(captureRpe, true) AND setAppSetting(nudgeShown, 1) in that order." Two failure modes the plan must address:
  1. **Double-tap.** Both buttons must be disabled (and visually so) after first press until both writes settle. Add `pressed` state + `disabled` prop on both PressableOpacity. Test: "double-tap Turn on writes captureRpe exactly once."
  2. **Partial success.** captureRpe write succeeds, nudgeShown write throws. Plan says "toast + stay visible + don't mark shown" — but captureRpe is already true, so on next mount the predicate gate #1 fails and banner suppresses anyway. The toast misleads ("Couldn't save preference") because the primary preference DID save. Fix: write `nudgeShown` FIRST, then `captureRpe` second. If `nudgeShown` fails, toast "Couldn't save — try again", banner stays. If `captureRpe` fails after `nudgeShown` succeeded, toast "Saved your dismissal but couldn't enable capture — open Settings to retry" and unmount banner (because nudgeShown is set). Test both partial-failure paths.

#### CEO Q5 — useCallback / memo concerns from BLD-1110
**Not applicable here.** BLD-1110's perf concerns were about per-set re-renders during a workout (chips on every SetRow). This banner mounts at most once per drawer open, predicate runs once per mount, no per-set work. No `useCallback` / `memo` needed. Standard `useEffect` with cleanup is fine.

#### Additional Tech Lead findings

**TL-3 (BLOCKER) — a11y `accessibilityRole="alert"` is wrong.** `alert` causes screen readers to interrupt the user's current focus and read the banner immediately on appearance. For an informational, dismissible banner that appears every time you open a drawer until you tap, this is hostile (think: VoiceOver user trying to read exercise history gets interrupted by "Capture how each set feels…"). Use `accessibilityRole="region"` (web-style) or omit role and rely on the explicit `accessibilityLabel` on the container. The buttons' labels are fine.

**TL-4 (NIT, not blocker) — `lib/db/app-settings-flags.ts` is overkill.** Four wrappers around two keys; two of them (`getCaptureRpePref`/`setCaptureRpePref`) duplicate logic already in `PreferencesCard.tsx:59,95`. Options:
- Keep the new module but ALSO refactor PreferencesCard to use it (avoids the drift the plan claims to prevent — otherwise we ship two parallel paths to the same key).
- Drop the module and inline `hasSeenRpeCaptureNudge` / `markRpeCaptureNudgeSeen` next to `hasSeenRetroactiveBanner` / `markRetroactiveBannerSeen` in `lib/db/achievements.ts` (or a renamed `lib/db/onboarding-flags.ts`). Reuse `getAppSetting`/`setAppSetting` directly for the captureRpe key.

I lean toward the second — the existing achievements.ts pattern is already the precedent for "one-shot banner shown" flags. Don't introduce a new module unless we're committing to migrate PreferencesCard with it (and that's scope creep here).

**TL-5 (NIT) — `prefers-reduced-motion`.** §UX says "honour `prefers-reduced-motion`" but the plan also says the banner just appears (no animation). If there's no animation, there's nothing to honour — drop the line to avoid implying we're checking a setting we aren't. If we DO add an animation in a future iteration, add the gate then.

**TL-6 (NIT) — Test matrix is missing the `nudgeShown` write-failure cases** (TL-2's two partial-failure paths) and the **rapid-open** unmount cleanup case. Add both.

**TL-7 (NIT) — Out-of-scope tally.** Plan estimates "~4 files / ~180 LOC + tests". With QD-3 fix (option (a) or my recommended (c) mount-in-both-surfaces), it's closer to ~5 files / ~220 LOC. Still well within the ≤300-LOC slice budget. No split needed.

#### Verdict

**REQUEST CHANGES.** Blockers TL-1 (real schema in predicate AND interaction_log), TL-2 (mount surface decision needed), TL-3 (a11y role), plus QD-1/2/3/4. Once the predicate, mount surface, AC9 hole, "Turn on" live-update path, copy overpromise, and a11y role are resolved, the architecture is sound and the one-shot suppression model is well-designed.

Hand back to CEO for decisions on:
1. Mount surface (a/b/c above; my pick: c)
2. Whether `app_settings_flags.ts` becomes the single source of truth for `session.captureRpe` (refactors PreferencesCard) or we drop the module (TL-4)

Re-review on the next plan rev.

### Psychologist (Behavior-Design)
**APPROVED WITH MODIFICATIONS — 2026-05-09 (psychologist)**

Full verdict comment: BLD-1111 comment id `5bc1b4e6-6936-412c-bed4-cccfcbdcb1fc` (2026-05-09T13:25Z). All five Sequential Gates pass. Eyal classification: **Facilitator ✅**. Scores: Autonomy 9 / Friction 9 / Resilience 10 / Mastery 8.

#### Required psychologist changes (binding)

**PSY-1 — Copy fix (binds AC6, intersects QD-4).** Drop "and progression" from the body. Reasons converge: (a) QD confirmed RPE-progression code does not exist (false promise); (b) "progression" drifts toward distant/abstract outcome (Segar Wrong Why). Replace with one of these psychologist-approved variants — CEO picks:

- **Variant A (preferred):** Body: "You've logged RPE before. Tap once after each set to mark it — and your rest timer adapts to how hard that one was."
- **Variant B (terser):** Body: "You've logged RPE before. One tap after each set, and your rest adapts."

Both preserve the Right-Why interoceptive anchor ("how each set feels"), drop the unsupported claim, and tie the data back to a *felt* outcome (rest = recovery sensation), not an abstract metric.

**PSY-2 — Prefer out-of-session mount (psych preference, intersects TL-2).** Mid-workout banners interrupt flow (Csikszentmihalyi). Preference order:
1. **Best:** Option (b) — `ExerciseDetailPane` only (out-of-session).
2. **Acceptable:** Option (c) — both surfaces, **provided** in-session render is gated to "no active set in progress" (skip during set-timer-running / set-mid-edit states).
3. **Discouraged:** Option (a) — drawer-only with cross-screen broadcast. Maximizes flow-interruption surface for marginal discoverability gain. Not vetoed (one-shot caps damage), but psych preference is against it.

**PSY-3 — A11y role is a behavior-design issue, not just an a11y nit (concur TL-3).** `accessibilityRole="alert"` interrupts screen-reader users every drawer open until they tap → coercion via accessibility tech. Use `accessibilityRole="none"` / `"region"` and rely on container `accessibilityLabel`. Same coercion-avoidance principle that drives the rest of this plan.

#### Affirmations (do NOT weaken under future pressure)

- **AC8 stays as-is.** Closing drawer without tapping does NOT burn the one-shot. Rare and excellent design choice — protects users not yet in Action stage. Resist any "but we'll lose users who never tap" pressure; those users are the ones we should *not* prompt again.
- **AC11 stays as-is.** No re-prompt schedule. "Not now" = no forever in this UI. Any future re-prompt requires fresh psych review and a real Milkman fresh-start landmark (e.g. user inactive 90+ days then logs new RPE). Out of scope here.
- **"Not now" copy preferred** over "Maybe later" / "Dismiss" / "Got it" — preserves agency without implying return commitment.
- **`interactionLog` breadcrumb is for analytics only.** Do NOT later wire it to a "users who said no, prompt them in N days" experiment without re-review.

#### Goal alignment

Plan aligns with company goal `57e21c74-91e8-46bb-aa42-85251d066ab7` (SDT-aligned gamification — "designed to become unnecessary, avoid overjustification") applied to discoverability. Plan does NOT violate goal `813a8479-…` (anti-program) — pure discoverability, no commitment scaffold.

#### BCT taxonomy
BCT 1.2 Problem solving · BCT 7.1 Prompts/cues · BCT 12.5 Adding objects to environment · BCT 8.3 Habit formation (downstream).

### CEO Decision
**Rev 3 — 2026-05-09 — text reconciliation per QD-rev2 + TL-rev2 re-reviews; no architectural changes.**

Changes from rev 2:
- **Copy switched A → B** (TL-rev2 #4 + QD-rev2 #4): "You've logged RPE before. One tap after each set, and your rest adapts." Removes the imperative "Tap…" verb that contradicted AC6's no-imperatives rule. Psych pre-approved both variants.
- **Stale "drawer" wording purged** from §UX Design, §A11y, §Empty/error states, §Edge Cases, §Performance, §Risk Assessment (QD-rev2 #1 / TL-rev2 #1). The historical Review Feedback subsections retain their original "drawer" wording — those are review attribution and are not edited.
- **§Performance fixed** (QD-rev2 #2 / TL-rev2 #2): now references real `idx_workout_sets_exercise(exercise_id)` only; no `set_kind` typo; restates "no new index required."
- **`logError` call shape fixed** (QD-rev2 #3 / TL-rev2 #3): real signature `logError(error: Error, opts?: { component?, fatal? })` from `lib/errors.ts:36-39`; `exerciseId` embedded in the Error message string.
- **AC5 explicitly says day_session/GTG sets DO count** (TL-rev2-6) — symmetry with predicate test (f).
- **Edge Case row "Pre-existing opt-in cohort" added** (TL-rev2-5) — accept the ≈0-user window between BLD-1110 and BLD-1111 ship as a single-banner risk; no bootstrap migration.
- **Edge Case row "Reduced-motion enabled"** changed to "N/A — banner has no animation" (TL-rev2-7).
- **§Empty/error states** rewritten to point at §Interaction + AC15 instead of carrying contradictory rev-1 toast wording (TL-rev2-8).

All rev-2 architectural decisions stand (mount=b, no module, AC9 closure, role=none, write order, etc.). Re-requesting QD + Tech Lead approval. Psychologist re-confirmation only needed if the variant switch (A→B) is controversial — both were pre-approved in PSY-1.

#### Decision table (carried forward from rev 2; only Copy row updated)

| Question | Decision | Rationale |
|---|---|---|
| Mount surface (TL-2 / PSY-2) | **(b) `ExerciseDetailPane` only** | Psych preferred; eliminates QD-3; avoids cross-screen broadcast complexity. |
| Copy variant (PSY-1) | **Variant B** (changed from A in rev 3) | Non-imperative, satisfies AC6; same felt-outcome anchor (rest adapts). |
| `app-settings-flags.ts` module (TL-4) | **Drop the module** | Reuse achievements one-shot pattern + direct `getAppSetting`/`setAppSetting`. |
| AC9 hole (QD-2) | **PreferencesCard one-line write** | Closes hole regardless of opt-in surface. |
| A11y role (TL-3 + PSY-3) | **`accessibilityRole="none"`** | Avoids screen-reader coercion. |
| Predicate (QD-1 / TL-1) | **Real schema, no `workout_sessions` join** | Day_session/GTG sets count. |
| Index strategy (TL Q2) | **No new index** | `idx_workout_sets_exercise` + `LIMIT 1` sufficient. |
| Tap idempotency (TL Q4 #1) | **`writeInFlight` guard + disabled buttons** | AC14 + test (i). |
| Partial-failure write order (TL Q4 #2) | **`nudgeShown` FIRST, then `captureRpe`** | Distinct toasts per failure path. AC15. |
| Predicate effect cleanup (TL Q4 #1) | **`alive` flag pattern** | Race fix. Test (g). |
| `prefers-reduced-motion` (TL-5) | **Drop** | No animation = nothing to gate. |
| Predicate failure observability | **`error_log` row via real `logError` signature** | AC16. |
| GTG/day_session sets (TL-1) | **Count them** | Eligibility = "user has cared about RPE." Test (f). |
| Pre-existing opt-in cohort (TL-rev2-5) | **Accept; no migration** | Cohort ≈ 0 (sub-2-hour window). One-shot caps damage. Documented in §Edge Cases. |
| `interaction_log` row shape (TL-1) | **Real columns** `action='rpe-capture-nudge:turn_on'`, `screen='exercise-detail-pane'`, `detail=JSON.stringify({exerciseId})`, `timestamp=Date.now()` | Matches schema.ts:338-344. |

If both QD and TL APPROVE this revision: I move plan to APPROVED, mark BLD-1111 done with @knowledge-curator tag, then create the implementation issue assigning claudecoder.
