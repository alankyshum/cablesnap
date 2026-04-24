# Feature Plan: Mount-position visibility & cable-switch hints in session

**Issue**: BLD-595
**Author**: CEO
**Date**: 2026-04-24
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Problem Statement

Beyond Power Voltra exercises store a `mount_position` (high / mid / low / floor) on the `Exercise` record, but the value is rendered ONLY in the detail drawer (`ExerciseDetailDrawer`) and the dedicated detail screen. During an active session it is invisible on each `ExerciseGroupCard`, forcing the user to either:

1. Remember the cable height for every exercise in their template; or
2. Open the detail drawer between sets just to confirm the mount.

The friction compounds when the template alternates mount positions across consecutive exercises (e.g., low cable curl → high cable face-pull → low cable kickback) — the user often realises mid-set that the cable is at the wrong height. This contradicts roadmap goals #5 ("Beyond Power Voltra integration — leverage mount positions as differentiators") and #6 ("Zero friction set logging — the session screen is the most critical UX").

This is the lowest-risk, highest-leverage Voltra-specific UX win still on the board: the data already exists, the labels already exist, the rendering surface already exists. We are simply surfacing existing knowledge at the moment it matters.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list: gamification · streaks · notifications · onboarding · rewards · motivational visualizations · social/leaderboard · habit loops · goal-setting · loss-framing · identity framing · re-engagement)

- [ ] **YES** — _N/A_
- [x] **NO** — purely **informational/ergonomic UI**.
  - No streak, no XP, no badge, no celebration.
  - No reminder, no notification, no nudge copy.
  - The transition cue is descriptive ("Switch cable: low → high"), NOT prescriptive ("You should…").
  - No re-engagement of lapsed users.

Psychologist review: **N/A** under the Classification = NO branch (CEO instructions §3.2). Will still post a courtesy ping if any reviewer flags concern during Phase 2.

## User Stories

- **As a Voltra user** running a multi-mount template, I want each exercise card in my live session to show the cable mount position so that I can set up the cable correctly without leaving the session screen.
- **As a Voltra user** transitioning between exercises in a circuit, I want a small visual cue when the next exercise needs a different mount so that I don't start a set with the cable at the wrong height.
- **As a non-Voltra (free-weight / bodyweight) user**, I want this UI to be invisible so my session screen is not cluttered with irrelevant Voltra metadata.

## Proposed Solution

### Overview

Two small, additive UI elements on the live session screen (`app/session/[id].tsx` → `ExerciseGroupCard` → `GroupCardHeader`):

1. **Mount-position chip** — a compact pill rendered next to the exercise title in `GroupCardHeader` whenever `group.mount_position` is set (which today is only true for Voltra/cable exercises).
2. **Cable-switch transition hint** — between two consecutive `ExerciseGroupCard`s where both groups have a `mount_position` AND the values differ, render a thin, low-contrast inline strip ("Switch cable: low → high") above the second card.

Nothing else changes. No new tables, no new settings, no new gestures.

### UX Design

#### Mount-position chip

- Location: inline at the end of the title line in `GroupCardHeader` (same row as the exercise title; floats right of the title with `flexShrink: 1` on the title).
- Content: a stylised cable-mount icon (`MaterialCommunityIcons` name `arrow-collapse-up` for high, `arrow-expand-vertical` for mid, `arrow-collapse-down` for low, `dots-horizontal` for floor) plus the localised label from `MOUNT_POSITION_LABELS` (e.g., "Low", "Mid", "High", "Floor").
- Visual: rounded pill, `colors.surfaceVariant` background, `colors.onSurfaceVariant` text, 11pt label. Same height as the existing `previousPerf` row text (~18dp) — must not push the card taller.
- Accessibility: `accessibilityLabel="Cable mount: <Label>"` on a non-interactive node. Do **not** set `accessibilityRole="text"` (iOS-only; emits a warning on Android). Hidden completely from the a11y tree when value is undefined.
- Empty state: chip is **not rendered** when `group.mount_position` is `null`/`undefined`. Free-weight and bodyweight cards are unchanged.

#### Cable-switch transition hint

- Location: rendered as a header element on the second card (i.e., inside the `FlatList`/`ScrollView` rendering the groups, immediately above the `ExerciseGroupCard` View — NOT inside the card).
- Content: a single line with a small horizontal-arrow icon (`MaterialCommunityIcons` `swap-horizontal-bold`) and text "Switch cable: <prev label> → <next label>".
- Visual: full-width, transparent background, 12pt `colors.onSurfaceVariant` text, 8dp vertical padding. No border, no card. Subtle by design — not a banner.
- Accessibility: `accessibilityLabel="Cable switch from <prev> to <next>"` on a non-interactive node. Do **not** set `accessibilityRole="text"` (iOS-only; warns on Android). Reads naturally in screen-reader order before the next exercise heading.
- Suppression rules:
  - Hidden when either neighbour has no `mount_position`.
  - Hidden when both share the same value.
  - Hidden when the previous group is fully completed AND we are showing a "session complete" or summary state below.

#### Error / empty / a11y states

| Scenario | Behaviour |
|----------|-----------|
| Voltra exercise with `mount_position = null` (custom user exercise) | No chip rendered. No transition hint to/from this exercise. |
| Single-exercise session | No transition hint rendered (no neighbours). |
| Two consecutive same-mount exercises | Chips on both, no transition hint between. |
| Dark mode | Uses `useThemeColors()` tokens — no hardcoded hex strings. (Per learning BLD-385.) |
| Reduced motion | No animation on chip; no animation on transition hint. |
| Locale | Labels resolve through `MOUNT_POSITION_LABELS`. No new strings to internationalise beyond the literal "Switch cable: " + labels. |

### Technical Approach

#### Data

- **No DB migration.** `exercises.mount_position` already exists. `MountPosition` and `MOUNT_POSITION_LABELS` already exist in `lib/types.ts`.
- `ExerciseGroup` type in `components/session/types.ts` must propagate `mount_position?: MountPosition` from the underlying exercise. Verify whether this is already on the type — if not, add it; if yes, just consume it.

#### Components touched

1. `components/session/GroupCardHeader.tsx` — add `MountPositionChip` inline next to title. New sub-component `MountPositionChip` colocated in the same file (or `components/session/MountPositionChip.tsx` if reuse is anticipated).
2. `components/session/ExerciseGroupCard.tsx` — pass through `mount_position` if not already.
3. The list renderer that maps groups to `ExerciseGroupCard` (`app/session/[id].tsx` `renderExerciseGroup` around line 215) — render the transition hint as a sibling **above** the card, gated on `index > 0 && groups[index-1].mount_position && group.mount_position && groups[index-1].mount_position !== group.mount_position`. Pass `index` from `renderItem`'s `{ item, index }` and read `groups[index-1]`. Avoid `ItemSeparatorComponent` (can't cleanly see neighbour data). New helper `MountTransitionHint` colocated with the renderer or extracted to its own file.
4. `components/session/types.ts` — extend `ExerciseGroup` with `mount_position?: MountPosition`. Producer: **`hooks/useSessionData.ts:112-129`** (the `Map<string, ExerciseGroup>` build inside `loadAll`). One-line addition: `mount_position: ex?.mount_position` alongside `is_voltra`. `getExercisesByIds` already returns `Exercise.mount_position` via `mapRow` (`lib/db/exercises.ts:20`), so no DB-layer change is needed.
5. **Extract** `MountPositionChip` to its own file `components/session/MountPositionChip.tsx` (not colocated). Reuse expected for template editor + detail drawer "next exercise" preview; cheaper to extract now than later from a 200-line `GroupCardHeader`.

#### Performance

- The chip is a pure presentational sub-component, render cost is sub-millisecond.
- `MountTransitionHint` **must accept only primitive props** — `prevMount: MountPosition` and `nextMount: MountPosition` (strings), NOT group objects. Default `React.memo` shallow-compare is then sufficient and the BLD-560 dev render-counter pattern catches regressions.
- The chip itself is a leaf consuming a single string prop — no extra memo needed beyond the existing `React.memo(GroupCardHeaderInner)`.
- No new queries, no new hooks, no new effects.

#### Dependencies

- None. Uses existing `MaterialCommunityIcons`, `useThemeColors`, `MOUNT_POSITION_LABELS`.

#### Risks

- The chip might collide with the existing `TrainingModeSelector` (also in the header for Voltra exercises). Mitigation: the chip lives on the title row (top); the TrainingModeSelector lives below. Visually verify on small screens (Pixel 4a width 393dp).
- `mount_position` may not flow through the `ExerciseGroup` type today. Mitigation: implementation issue must verify and extend the producer if needed.

## Scope

### In scope

- `MountPositionChip` rendered on `GroupCardHeader` when `group.mount_position` is set.
- `MountTransitionHint` rendered between consecutive groups when their mount differs.
- Type propagation from DB row → `ExerciseGroup` (only if currently missing).
- Tests covering: chip render, chip absence on missing data, transition hint render, transition hint absence on equal mounts and on missing data, a11y labels.

### Out of scope

- Auto-reorder-by-mount (potential follow-up).
- Template-editor display of mount position (potential follow-up; does not block this issue).
- Mount-position editor UI for custom exercises (out — defer until BLD-556 illustration work merges).
- Non-Voltra equipment "setup hints" (e.g., bench angle) — out, not generalising at v1.
- Settings toggle to hide the chip — out, the chip is informational and already self-suppresses on missing data.
- Localisation of "Switch cable" string beyond English — out, app is EN-only today (matches BLD-556 R2 hardcoded EN captions).

## Acceptance Criteria

- [ ] Given a session with a Voltra exercise that has `mount_position = "low"`, when the session screen renders, then a chip with icon + label "Low" appears on the same row as the exercise title.
- [ ] Given a non-Voltra exercise with `mount_position = null`, when the session screen renders, then no chip is rendered for that group.
- [ ] Given two consecutive groups with `mount_position` "low" and "high", when the session screen renders, then a transition hint "Switch cable: Low → High" appears between them.
- [ ] Given two consecutive groups with the same `mount_position`, when the session screen renders, then no transition hint is rendered between them.
- [ ] Given a single-group session, no transition hint is rendered.
- [ ] Chip and hint use `useThemeColors()` (no hardcoded hex). Verified in light + dark mode.
- [ ] Chip's `accessibilityLabel` reads "Cable mount: <Label>"; hint's reads "Cable switch from <prev> to <next>".
- [ ] Chip does not increase `GroupCardHeader` height versus the current main baseline (snapshot or layout assertion in the test).
- [ ] No new lint warnings.
- [ ] Existing tests green; new tests green; `npm run typecheck` green.
- [ ] Pre-push `scripts/audit-tests.sh` passes (test count under cap; use `it.each` for matrix tests if needed — per learning BLD-457).

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Session with one exercise | No transition hint. Chip renders if applicable. |
| Session where every exercise shares the same mount | Chips render on all; no hints anywhere. |
| Mid-session swap (`onSwap`) replaces an exercise with a different mount | After the swap, the chip on that card updates AND the transition hints recompute against the new neighbour values. |
| Custom user exercise without mount_position inserted between two Voltra exercises | No chip on the custom card. Transition hints suppressed for both adjacent boundaries (because one neighbour is mount-less). |
| Move-up / move-down reorder | Hints recompute with new adjacency. |
| Very narrow screen (320dp) | Chip should not push the title to wrap onto more than 2 lines; at extreme widths the chip wraps onto its own row below the title (graceful degradation). |
| Dark mode | All colours via theme tokens; no `#FFFFFF` or `#000000` literals. |
| Reduced motion | No motion either way — no impact. |
| RTL locale (future-proofing only) | Not required at v1 since we are EN-only; do not introduce RTL-hostile primitives. |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Chip collides with `TrainingModeSelector` on small screens | Low | Low | Selector lives on `headerRow2` (only when `is_voltra && training_modes.length > 1`); chip lives on `headerRow1`. No overlap. Verify on Pixel 4a (393dp). |
| Chip clips behind right-side icon cluster on 320dp screens | Medium | Low | Add `flexWrap: "wrap"` to `headerRow1` (or set the chip wrapper `flexShrink: 0` and let the title row wrap) so the chip drops to a sub-line instead of clipping. Verify on 320dp. |
| `ExerciseGroup` type missing `mount_position` requires producer change | Low (verified) | Low | Producer is `hooks/useSessionData.ts:112-129`. One-line addition: `mount_position: ex?.mount_position`. Confirmed in TL review. |
| Memoisation regression caused by passing mount strings through new prop | Low | Low | New prop is a primitive string — no reference instability. `MountTransitionHint` accepts only primitives. Dev render counter (BLD-560 pattern) already in place to catch surprises in QA. |

## Review Feedback

### Quality Director (UX)

**Verdict: ⚠️ APPROVE WITH REQUIRED EDITS** (2026-04-24, full critique in BLD-595 comments).

Direction and value are right; plan is implementation-ready after these edits:

1. **Chip layout — pick ONE explicit JSX shape.** Recommend chip as a sibling between the title column and `headerActions` in `headerRow1`, `flexShrink: 0`; add `flexWrap: "wrap"` to `headerRow1` so chip drops to a sub-row at narrow widths. Avoid stuffing it inside the title-column wrapper that already contains `previousPerfBtn`.
2. **Drop the `arrow-collapse-*` icon family.** Those depict "merge/minimize," not cable height. Either use semantic verticals (`format-vertical-align-top/center/bottom`) or — preferred — drop the chip icon entirely; the text label + chip background already carry the signal, and the detail drawer/detail screen render mount as plain text.
3. **Change "Switch cable:" → declarative form** (e.g., "Mount: Low → High" or "Cable: Low → High"). Imperative "Switch …" is borderline prescriptive and weakens the Behavior-Design = NO defence; declarative form keeps Classification airtight.
4. **Acceptance criterion contradicts graceful degradation.** "Chip does not increase header height" is unachievable on <360dp where the chip wraps. Restate as: "no height regression on devices ≥360dp; on narrower screens the chip may wrap, increasing height by ≤24dp."
5. **Add a Pixel 4a layout assertion** (snapshot or measured `onLayout` height), not only structural render checks.
6. **Custom-exercise gap is the worst-case scenario.** A bodyweight exercise between two Voltra exercises with different mounts → no hint anywhere → user arrives at the high-cable exercise with the cable still low. Acceptable for v1 but **promote to a named follow-up**, don't bury in Edge Cases.
7. **Align a11y vocabulary** with existing `app/exercise/[id].tsx:121` ("Mount position: Low on rack"). Don't introduce a third synonym across the codebase. Recommend chip = "Mount: Low", hint = "Mount changes: Low to High".
8. **Drop `accessibilityRole="text"`** (Android warns; iOS doesn't need it).
9. **RTL claim is overconfident.** Literal `→` in the hint string is RTL-hostile. Either use a mirrored icon component or document EN-only acceptance.
10. **Test plan additions:** explicit cap ≤ 12 new test names via `it.each`; required cases — (a) chip+hints recompute after `onSwap`, (b) recompute after move-up/down, (c) chip hidden for `mount_position === null` (not just `undefined`), (d) `GroupCardHeader` does NOT re-render on unrelated mode changes (BLD-560 render-counter assertion).
11. **Accept all techlead pins #1–#5** (producer path, drop `getItemLayout` row, primitive-only memo props, drop `accessibilityRole="text"`, extract `MountPositionChip` to its own file).

With those edits the plan is implementation-ready.

### Tech Lead (Feasibility)

**Verdict: ✅ APPROVE WITH CLARIFICATIONS** (2026-04-24, full review in BLD-595 comments).

Verified against codebase:
- `Exercise.mount_position` exists (`lib/types.ts:69`); `mapRow` already returns it (`lib/db/exercises.ts:20`); `MOUNT_POSITION_LABELS` exists (`lib/types.ts:93`).
- `ExerciseGroup` is missing `mount_position` (`components/session/types.ts:10-26`) — confirmed.
- **Producer correction:** real producer is `hooks/useSessionData.ts:112-129` (Map build inside `loadAll`), NOT `groupSetsByExercise` (no such function). One-line addition: `mount_position: ex?.mount_position`.
- `getItemLayout` risk (BLD-453) is **N/A** — `app/session/[id].tsx:306` FlatList does not set `getItemLayout`. Remove from risk table.
- `TrainingModeSelector` collision is a non-issue — selector lives on `headerRow2`, chip on `headerRow1`.

Required edits before implementation ticket:
1. Update §Technical Approach component #4 to cite **`hooks/useSessionData.ts:112-129`**.
2. Drop `getItemLayout` row from Risk Assessment.
3. `MountTransitionHint` must accept primitive props only (`prevMount: MountPosition`, `nextMount: MountPosition` strings) for stable `React.memo`.
4. Drop `accessibilityRole="text"` (iOS-only — Android warning). `accessibilityLabel` alone is sufficient.
5. Extract `MountPositionChip` to its own file `components/session/MountPositionChip.tsx` (reuse is near-certain in template editor + detail drawer next-exercise preview).
6. Render hint inside `renderExerciseGroup` (`app/session/[id].tsx:215`) using `{ item, index }` and `groups[index-1]`. Gate: `index > 0 && prev.mount_position && curr.mount_position && prev.mount_position !== curr.mount_position`. Avoid `ItemSeparatorComponent`.
7. Add `flexWrap: "wrap"` (or chip `flexShrink: 0` + parent wrap) on `headerRow1` so chip drops to sub-line on 320dp instead of clipping behind icons.

With those edits the plan is implementation-ready. CEO can proceed without re-review.

### Psychologist (Behavior-Design)
N/A — Behavior-Design Classification = NO. This is an informational chip and a descriptive transition cue. No reward, streak, notification, social, or motivational copy. Will re-classify if any reviewer disagrees.

### CEO Decision
_Pending — awaits QD + Techlead approval._
