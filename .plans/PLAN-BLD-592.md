# Feature Plan: Exercise Form-Tutorial Quick-Link (YouTube deep-link)

**Issue**: BLD-592  **Author**: CEO  **Date**: 2026-04-24
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Source**: GitHub alankyshum/cablesnap#332 — "For each of the exercise showing instruction in plain test isn't helpful"
**Related**: BLD-556 / BLD-561 (Visual exercise illustrations — currently BLOCKED on asset generation + curation; this plan is explicitly an INTERIM, not a replacement).

## Problem Statement

Owner GH #332 reports that plain-text numbered steps under each exercise are insufficient for users to understand proper form. The long-term solution (AI-generated start/end position illustrations, BLD-556) is BLOCKED on OpenAI image generation cost, asset curation, and bundle size budget. In the meantime, users have **zero** in-app affordance for richer form guidance and must leave the app, open a browser, and manually type the exercise name.

An immediate low-cost interim: a single "Watch form tutorial" link in `ExerciseDetailPane` and `ExerciseDetailDrawer` that uses `expo-linking` to open a YouTube search URL for `"<exercise name> form tutorial"`. Delivers user value today with ~15 LOC and zero new dependencies.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (See CEO instructions §3.2 trigger list.)

- [x] **NO** — purely informational / functional utility. User-initiated, single-tap outbound link to third-party content search. No streaks, no notifications, no rewards, no onboarding, no progression, no motivational copy, no social comparison, no re-engagement. It is functionally identical to tapping a phone number to dial — user already decided they want information; we save them a tap.

**Psychologist review therefore N/A.** (If any reviewer disagrees, flip Classification to YES and route through `@psychologist` before proceeding.)

## User Stories

- As a user unfamiliar with an exercise, I want a one-tap way to watch a video demonstration so that I can check form before I attempt the set.
- As a user on mobile data, I want the tutorial to open in the system browser / YouTube app so that my in-app session state is preserved.
- As a user with no internet, I want the in-app instruction text to still render (graceful fallback when link fails).

## Proposed Solution

### Overview

Add a single Pressable rendered directly below the numbered instruction steps in both exercise detail surfaces:

1. `components/exercises/ExerciseDetailPane.tsx` (Exercises tab / Exercise screen)
2. `components/session/ExerciseDetailDrawer.tsx` (In-session drawer)

Label: **"Watch form tutorial ↗"**. Secondary caption (14pt `colors.textMuted`): **"Opens YouTube search in your browser. External content — not endorsed by CableSnap."**

Tap behavior: build URL `https://www.youtube.com/results?search_query=<encoded>` where encoded payload is `encodeURIComponent(<exercise.name> + " form tutorial")`, then call `Linking.openURL(url)`. On failure, show an `Alert` with the URL string for manual copy (also covered by existing `Alert` util).

### UX Design

- Placement: **below** the last instruction step, separated by 16dp vertical spacing. If there are **zero** instruction steps, render the link directly below the exercise name instead — keeps affordance visible for seeded exercises without step text.
- Visual: secondary button style — no filled background, `colors.accent` text, right-aligned external-link icon (Lucide `ExternalLink`, 16dp). Matches existing pattern used by `settings.tsx` legal links.
- Min tap target: 44×44 dp (per `.learnings/patterns/react-native.md` a11y floor).
- `accessibilityRole="link"`, `accessibilityLabel="Watch form tutorial for {exercise.name} — opens YouTube search in browser"`, `accessibilityHint="Opens external content outside the app"`.
- Disclaimer caption is mandatory (not optional) — prevents user surprise when a third-party site opens. Caption is a **sibling** `<Text>` (not inside the Pressable) to avoid bloating the tap target and to match the Settings-about-block a11y pattern (BLD-572 memory).

### Technical Approach

- New pure helper `lib/exercise-tutorial-link.ts` exporting:
  - `buildTutorialSearchUrl(name: string): string` — always produces a valid URL for non-empty name; trims whitespace; returns `null` if name is empty/whitespace-only.
  - `openTutorialForExercise(name: string, opts?: { onError?: (e: unknown) => void }): Promise<void>` — wraps `Linking.canOpenURL` + `Linking.openURL`; logs Sentry breadcrumb `exercise.tutorial.open` with `{ exerciseName }`; calls `onError` (default: `Alert.alert`) if the OS cannot handle the URL.
- New shared component `components/exercises/ExerciseTutorialLink.tsx`:
  - Props: `{ exerciseName: string; testID?: string }`.
  - Single Pressable + sibling caption; internally calls `openTutorialForExercise`.
- Consumers: `ExerciseDetailPane.tsx` (below `steps.map` render) and `ExerciseDetailDrawer.tsx` (inside the `instructions` variable expansion, after `steps.map`).
- `expo-linking` is already a direct dep (used for Strava OAuth and feedback email). Zero new deps.
- No DB migration. No schema change. No persisted state. No analytics event beyond the Sentry breadcrumb.
- i18n: single hardcoded EN string pair (title + caption). Matches current app posture (no i18n framework). If app adds i18n later, strings move to that layer.

### Performance / Storage / Bundle

- Code delta: ~80 LOC incl. component + helper + tests. No assets.
- Runtime: zero cost until the user taps (no network, no listeners, no subscriptions).
- No bundle-size gate impact (`scripts/verify-exercise-illustrations-size.sh` unaffected).

## Scope

**In:**
- New helper `lib/exercise-tutorial-link.ts` + unit tests.
- New component `components/exercises/ExerciseTutorialLink.tsx` + RTL tests.
- Integration into `ExerciseDetailPane.tsx` and `ExerciseDetailDrawer.tsx`.
- Sentry breadcrumb on tap.
- Hardcoded EN title + disclaimer caption.
- Acceptance tests (see below).

**Out:**
- Embedding YouTube player in-app (licensing, bundle, perf).
- Per-exercise curated video URLs (requires data pipeline — out of scope; revisit after BLD-561 ships illustrations).
- Deep-linking directly to the YouTube app (`vnd.youtube:`) — search URL works in both browser and app; adding protocol fallback adds complexity without user benefit.
- Analytics event to BigQuery / any analytics backend. Sentry breadcrumb only.
- Non-EN localization — not in app today.
- Replacing or deprecating the illustration plan (BLD-556/561). This ships alongside illustrations when they land.

## Acceptance Criteria

- [ ] GIVEN an exercise has ≥1 instruction step WHEN the user opens `ExerciseDetailPane` THEN a "Watch form tutorial ↗" link + disclaimer caption renders below the last step.
- [ ] GIVEN an exercise has **zero** instruction steps WHEN the user opens `ExerciseDetailPane` THEN the link + caption still render (directly below the name/header).
- [ ] GIVEN the user taps the link WHEN `Linking.canOpenURL` resolves true THEN `Linking.openURL` is called with `https://www.youtube.com/results?search_query=<encodeURIComponent(exercise.name + " form tutorial")>`.
- [ ] GIVEN `Linking.canOpenURL` resolves false OR `openURL` throws WHEN tap handler runs THEN an Alert shows the URL for manual copy AND a Sentry breadcrumb `exercise.tutorial.open_failed` is recorded with the error.
- [ ] GIVEN a tap succeeds WHEN handler completes THEN a Sentry breadcrumb `exercise.tutorial.open` is recorded with `{ exerciseName }`.
- [ ] `accessibilityRole="link"`, tap target ≥44×44dp, `accessibilityLabel` includes exercise name.
- [ ] Caption text is a sibling `<Text>` (NOT inside the Pressable) — verified by RTL test that looks up the Pressable and asserts its `accessibilityLabel` does NOT contain the disclaimer string.
- [ ] Same behavior ships in `ExerciseDetailDrawer.tsx` (side-by-side parity assertion in tests).
- [ ] PR passes all tests with no regressions (target: 2228+ passing maintained).
- [ ] No new lint warnings.
- [ ] `npm run typecheck` clean.

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Empty exercise name (custom exercise with empty string) | `buildTutorialSearchUrl` returns `null`; component renders nothing (no broken link). Test covers this. |
| Exercise name contains `&`, `?`, `/`, emoji, non-ASCII | `encodeURIComponent` handles; URL remains valid. Test covers `&`, Unicode, and emoji. |
| No browser installed (theoretical Android) | `canOpenURL` false → Alert shows URL string for manual copy. Test covers via mocked `Linking`. |
| User double-taps | Second tap is a no-op while first `openURL` promise is in-flight (handler guards with `useRef` boolean `opening`). Prevents double navigation on slow devices. |
| Airplane mode | OS browser handles the network error, not the app. No special handling needed. |
| Screen reader | Announces "Watch form tutorial for {exercise.name} — opens YouTube search in browser, link". Role "link" already implies external navigation. |
| RTL locale (future-proof) | Component uses logical margins (marginStart/marginEnd), not left/right. |
| Dark mode / high contrast | Uses `useColors()` hook — inherits theme, verified by snapshot test for both themes. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| User confusion that video is CableSnap-endorsed | Medium | Medium | Mandatory disclaimer caption; explicit "External content — not endorsed by CableSnap" text; accessibilityHint reinforces. |
| YouTube URL scheme changes | Very Low | Low | Helper is one-liner; trivial to update. Covered by unit test on exact URL string. |
| Reviewer sentiment that this undercuts BLD-561 (illustrations) | Medium | Low | Plan explicitly states interim + both-ship-together; remove the link AFTER illustrations fully cover the pilot-10 AND user feedback confirms illustrations sufficient. Until then, two surfaces co-exist without conflict (illustrations render ABOVE steps; tutorial link renders BELOW steps). |
| User with no internet taps link and sees blank | Low | Low | System browser handles — outside app scope. Documented in Edge Cases. |
| Increased Sentry noise from breadcrumbs | Low | Low | Breadcrumbs only, no `captureException` unless `canOpenURL` fails. Bounded by actual tap volume. |

## Review Feedback

### Quality Director (UX)
_Pending_

### Tech Lead (Feasibility)
_Pending_

### Psychologist (Behavior-Design)
_N/A — Classification = NO (purely informational outbound utility link; no behavior-shaping triggers)_

### CEO Decision
_Pending — will approve after QD + TL both post LGTM / APPROVED._
