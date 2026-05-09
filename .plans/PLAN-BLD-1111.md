# Feature Plan: One-time RPE Capture Discoverability Nudge

**Issue**: BLD-1111  **Author**: CEO  **Date**: 2026-05-09
**Status**: DRAFT → IN_REVIEW
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
A single, dismissible inline banner rendered inside the **ExerciseDetailDrawer** "details" tab (the existing entry point users land on when they open any exercise). The banner appears at most **once per device, ever**, and only when ALL of these are true at render time:

1. `prefs.captureRpe` is currently `false` (Settings not opted in).
2. `app_settings["session.captureRpe.nudgeShown"]` is unset.
3. The exercise being viewed has at least one historical `workout_sets` row with `rpe IS NOT NULL` AND `set_kind = 'workout'` AND `completed = 1` (i.e. the user actually finished a real set with an RPE value, not a warmup or an abandoned set).

Two affordances: **[Turn on]** flips the toggle + marks shown; **[Not now]** marks shown only. Tapping outside, navigating away, or closing the drawer **does NOT** mark shown — we only suppress on explicit user action so an accidental drawer-open doesn't burn the one-shot.

### UX Design

**Visual**
- Inline banner above the existing detail content (inside the FlatList header of `ExerciseDetailDrawerContent`'s "details" tab). Same surface as `BodyweightModifierNotice` (the closest existing pattern). Reuse that visual treatment for consistency — soft tertiary-container background, small icon, two short text lines, two text buttons.
- Icon: `MaterialCommunityIcons` `gauge` (effort gauge metaphor). 20 dp.
- Title: "Capture how each set feels"
- Body: "You've logged RPE before. CableSnap can capture it live with one tap after each set, and use it to tune rest and progression." (purely informational — describes the capability, no loss framing, no "don't miss out", no second person commands like "Try it").
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
| Banner first render | Banner visible. **Mark-shown is NOT yet written**. |
| Tap "Turn on" | `setAppSetting("session.captureRpe", "true")` AND `setAppSetting("session.captureRpe.nudgeShown", "1")` in that order; banner unmounts; settings store invalidates so PreferencesCard reflects new state. |
| Tap "Not now" | `setAppSetting("session.captureRpe.nudgeShown", "1")`; banner unmounts. Capture pref unchanged. |
| Close drawer / navigate away without tapping | **No state change.** Next time the eligibility predicate holds, banner shows again. (Avoids burning the one-shot on accidental drawer opens.) |
| Open a different eligible exercise | Same banner, same state — only marked once `nudgeShown` is set. |
| Open ANY exercise after `nudgeShown=1` | Banner never renders. |
| Capture pref turned ON via Settings without ever seeing banner | Banner never renders (predicate gate #1 fails). |
| Capture pref turned OFF again later in Settings | Banner still does NOT render — `nudgeShown` is sticky regardless of pref toggling. (Avoids re-nag on toggle thrash.) |

**A11y**
- `accessibilityRole="alert"` on banner container → screen readers announce on appearance.
- `accessibilityLabel` on container: "Capture how each set feels. You've logged RPE before. CableSnap can capture it live with one tap after each set."
- Buttons keep their default `accessibilityRole="button"` with explicit `accessibilityLabel="Turn on live RPE capture"` and `accessibilityLabel="Dismiss RPE capture suggestion"`.
- Honour `prefers-reduced-motion`: no slide-in animation; banner just appears (matches BLD-1110 §UX rule).

**Empty / error states**
- Predicate query failure (DB error) → banner does not render; error logged via `errorLog` table. Do NOT block drawer rendering.
- `setAppSetting` failure on tap → toast "Couldn't save preference — try again" via existing snackbar; banner stays visible; do NOT mark shown. (Otherwise we'd silently lose both the capture toggle AND the one-shot.)

### Technical Approach

**Files (estimate ~4 files / ~180 LOC + tests)**

1. **`lib/db/exercise-history.ts`** — add predicate helper:
   ```ts
   export async function exerciseHasHistoricalRpe(exerciseId: string): Promise<boolean>
   ```
   - Query: `SELECT 1 FROM workout_sets WHERE exercise_id = ? AND rpe IS NOT NULL AND set_kind = 'workout' AND completed = 1 LIMIT 1` (Drizzle equivalent).
   - Returns `true` if any matching row exists, else `false`. Defensive try/catch returning `false` on error.
   - Keep alongside existing `getExerciseHistory` etc. — same module, same column references already used at `exercise-history.ts:58`.

2. **`lib/db/app-settings-flags.ts`** (NEW small module, ~30 LOC) — typed wrappers for the two settings keys. Pattern matches `hasSeenRetroactiveBanner` / `markRetroactiveBannerSeen` in `lib/db/achievements.ts:155-170`:
   ```ts
   export async function hasSeenRpeCaptureNudge(): Promise<boolean>
   export async function markRpeCaptureNudgeSeen(): Promise<void>
   export async function getCaptureRpePref(): Promise<boolean>          // reads "session.captureRpe"
   export async function setCaptureRpePref(value: boolean): Promise<void> // writes "session.captureRpe"
   ```
   Rationale: keep the settings-key strings in one place so PreferencesCard, the session screen, and the nudge can't drift.

3. **`components/session/RpeCaptureNudge.tsx`** (NEW, ~110 LOC) — the banner UI component:
   - Props: `exerciseId: string`, `onDismiss?: () => void`.
   - Internal state: `eligible: boolean | null` (null = still loading; never render until resolved).
   - Effect on mount: in parallel — `exerciseHasHistoricalRpe`, `hasSeenRpeCaptureNudge`, `getCaptureRpePref`. Render only if `historical && !seen && !pref`.
   - Buttons call the typed wrappers above + `onDismiss?.()`.
   - Renders nothing while `eligible == null` (prevents layout flash).
   - Re-evaluates eligibility ONLY on mount per drawer open (no live subscription — the user changing prefs in another tab during the same drawer view is non-existent in practice; over-engineering).

4. **`components/session/ExerciseDetailDrawer.tsx`** — mount the nudge inside the "details" tab's FlatList header, ABOVE `musclesAndMeta`. ~3 LOC change.

**Settings keys**
- `session.captureRpe` — already used by BLD-1110 (`PreferencesCard.tsx:59`). Re-used unchanged.
- `session.captureRpe.nudgeShown` — NEW. Value `"1"` (sentinel; presence-based check).

**Testing**

| Test file | Cases |
|-----------|-------|
| `__tests__/lib/db/exercise-history-rpe-predicate.test.ts` | Returns true with one workout set with rpe=7. Returns false when only warmup sets have rpe. Returns false when only incomplete sets have rpe. Returns false on empty exercise. Returns false when all sets have rpe=null. |
| `__tests__/lib/db/app-settings-flags.test.ts` | hasSeen returns false initially, true after markSeen. getCaptureRpePref defaults false. setCaptureRpePref persists round-trip. |
| `__tests__/components/session/RpeCaptureNudge.test.tsx` | (a) Renders when all 3 conditions hold. (b) Hidden when nudgeShown. (c) Hidden when captureRpe=true. (d) Hidden when no historical RPE. (e) "Turn on" writes both settings AND calls onDismiss. (f) "Not now" writes ONLY nudgeShown AND calls onDismiss. (g) Closing drawer (component unmounts) without tap → no settings written. (h) DB error in predicate → renders nothing, no throw. |
| `__tests__/components/session/ExerciseDetailDrawer-rpe-nudge.test.tsx` | Drawer renders nudge in details tab when eligible. Does not render in clips tab. |

**Performance**
- One indexed lookup per drawer open. `workout_sets` already has indexes on `exercise_id` and `(exercise_id, set_kind)` — verify in `schema.ts` and add an index only if missing (separate small migration). Predicate uses `LIMIT 1` so it's O(1) once the index is hit.
- No new DB writes happen until the user explicitly taps a button.

**Logging / breadcrumb**
- On Turn on: `interactionLog` row with `kind='rpe-capture-nudge'`, `payload='{"action":"turn_on","exerciseId":"<uuid>"}'`. UUID + literal action string only — no PII.
- On Not now: same with `action='not_now'`.
- Allows us to measure conversion rate without any third-party analytics.

## Scope

**In:**
- New predicate query helper.
- New settings-flags module with the four typed wrappers.
- New `RpeCaptureNudge.tsx` banner component.
- Mount in `ExerciseDetailDrawer` "details" tab.
- The four test files above.

**Out:**
- ANY home-screen / global banner. Strictly inside ExerciseDetailDrawer.
- Push notifications, in-app notifications, email — none.
- Any animation beyond appear/disappear.
- Behaviour change to RPE chip strip itself (BLD-1110 owns that surface).
- Behaviour change to Settings toggle copy.
- Re-prompting on any schedule (weekly, monthly, after N opens) — explicitly OUT to avoid the slide into nag.
- Localization beyond existing app patterns (English only — matches current product state).
- Telemetry beyond the local interactionLog row.
- Any new icon assets.

## Acceptance Criteria

- [ ] **AC1** Given a device with `nudgeShown` unset AND `session.captureRpe = "false"` AND the opened exercise has ≥ 1 completed workout set with non-null RPE, When the user opens the exercise detail drawer, Then the banner is visible in the "details" tab.
- [ ] **AC2** Given AC1 holds AND the user taps "Turn on", Then `session.captureRpe = "true"` AND `session.captureRpe.nudgeShown = "1"` are persisted, AND the banner unmounts, AND opening any exercise drawer afterwards does NOT show the banner.
- [ ] **AC3** Given AC1 holds AND the user taps "Not now", Then `session.captureRpe.nudgeShown = "1"` is persisted (and ONLY that), AND the banner unmounts, AND opening any exercise drawer afterwards does NOT show the banner.
- [ ] **AC4** Given `session.captureRpe = "true"` (already opted in via Settings), When the user opens any exercise drawer, Then the banner never renders.
- [ ] **AC5** Given the opened exercise has no completed workout set with non-null RPE, When the drawer opens, Then the banner never renders. Warmup-only RPE rows do NOT count.
- [ ] **AC6** Copy is verbatim what is in this plan (§UX Design). No loss-framing, FOMO, guilt, identity framing, streak language, or imperative commands. Reviewed by psychologist.
- [ ] **AC7** Psychologist verdict APPROVED or APPROVED WITH CONDITIONS before any code merges. All conditions incorporated and re-confirmed.
- [ ] **AC8** Given the user opens the drawer (banner shows) but closes it without tapping a button, When they re-open the drawer, Then the banner shows again — closing without tapping does NOT burn the one-shot.
- [ ] **AC9** Given the user toggled `captureRpe` ON in Settings then OFF again later, When they open an eligible exercise drawer, Then the banner does NOT render — `nudgeShown` once-per-device sticky regardless of pref toggling. (Note: `nudgeShown` is set to `"1"` when the predicate first holds AND the banner first renders to completion via tap. If the user toggled in Settings without ever triggering the banner, `nudgeShown` stays unset and AC4 alone suppresses; once they toggle OFF, eligibility re-engages — BUT only if `nudgeShown` is still unset, which it would be in this path. Reviewers: please call out if this is a hole.)
- [ ] **AC10** A11y: VoiceOver (iOS) AND TalkBack (Android) walk-through documented in PR description with screen recording. Banner is announced on appearance, both buttons reachable, both buttons labelled.
- [ ] **AC11** Per-device, per-install one-shot. There is NO scheme for re-showing later (no time delay, no "after N opens", no "after dismissing 3 times"). Reviewers: confirm we explicitly want to lose the user once they say no.
- [ ] **AC12** PR passes all tests with no regressions. Typecheck clean. No new lint warnings.
- [ ] **AC13** Build verified before `in_review` — `npm install`, typecheck, app boot.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Empty DB (fresh install, no exercises logged ever) | Banner never renders (predicate returns false). |
| Exercise has only deleted sessions with RPE | Predicate counts existing rows only — if cascade-delete removed sets, banner does not render. |
| User has `nudgeShown=1` from prior install but DB was wiped → exercise has no RPE | AC5 supersedes — banner won't render anyway. |
| User has `nudgeShown=1` AND DB intact (typical resume) | Banner never renders. |
| Drawer opened from session screen vs. exercise picker vs. recent exercises | Same banner, same predicate — entry point doesn't matter. |
| Two drawers open in rapid succession (back-stack) | Each evaluates predicate independently; both may render banner — that's fine, marking-shown happens only on tap so they collapse to one tap. |
| Predicate query returns error (DB locked, etc.) | Banner does not render; error logged; drawer renders normally. |
| `setAppSetting` fails on Turn-on tap | Toast "Couldn't save preference — try again"; banner stays visible; nothing persisted. Same on Not-now tap. |
| Web platform (Platform.OS === "web") | Same behaviour. (Unlike form clips, this is plain UI + SQLite — no platform exclusion required.) |
| Reduced-motion enabled | No slide animation; banner appears statically. |
| Dark mode | Uses theme colours via `useThemeColors`; visual matches `BodyweightModifierNotice`. |
| User taps Turn on, then immediately turns it OFF in Settings | `nudgeShown` stays `"1"`; AC9 — banner never shows again. |
| User has hundreds of exercises with prior RPE | Banner shows once on the first eligible drawer open; tapping anywhere ends it. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Psychologist rejects on behavior-design grounds | Medium | High | Plan is intentionally minimal (one-shot, no time-based re-prompt, no manipulative copy). If REJECTED, scrap the feature; live RPE chip strip still ships via BLD-1110, we just rely on Settings discoverability. Acceptable failure mode. |
| Predicate query slow on large histories | Low | Low | `LIMIT 1` + indexed lookup on `exercise_id`. Verified in plan. |
| Drawer re-render churn (banner mount/unmount on every drawer open) | Low | Low | Banner returns null while loading; predicate runs once per mount; React.memo not needed. |
| Settings keys drift between BLD-1110 and BLD-1111 | Low | Medium | New `app-settings-flags.ts` module centralises key strings; all callers route through wrappers in this PR + a follow-up refactor of PreferencesCard (out of scope here, noted). |
| Eligibility logic ships with subtle dead-zone bug (e.g. forgets `set_kind` filter) | Medium | Medium | Test matrix in `__tests__/lib/db/exercise-history-rpe-predicate.test.ts` covers warmup-only, incomplete-only, mixed, and all-null cases. |
| Breadcrumb writes leak PII | Very Low | Medium | Only UUID + literal action string written; explicit policy in §Logging. |
| Banner re-shows on re-install (sticky state lost) | High by design | Low | Acceptable. `nudgeShown` is per-device per-install. Re-install is rare; one banner is the cost. |
| User finds the banner annoying anyway | Low | Medium | One tap kills it forever. Most stringent suppression model we ship. |

## Review Feedback

### Quality Director (UX)
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
_Pending_
