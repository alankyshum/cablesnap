# PLAN-BLD-STRAVA-SHARE: Strava Activity Upload + Shareable Workout/Achievement Images with Editable Promo Caption

## Context

Strava app is now subscribed/active (previously Inactive → 403 `app_inactive`). The existing upload pipeline (`lib/strava.ts`: `syncSessionToStrava` → `uploadActivity` → `buildActivityDescription`) creates a manual `WeightTraining` activity with a hardcoded promo footer. Now we want to:

1. **Upload activities to Strava** (already functional — verify after reactivation).
2. **Generate Strava-optimized share images**: workout overview card + achievement recap card.
3. **Enable users to share these images** via native share sheet (save to camera roll, share to Strava manually, etc.).
4. **Provide a safe, editable CableSnap promotional caption** that accompanies shared images and Strava activity descriptions.

### Policy Constraints (Strava API)

| Constraint | Implication |
|---|---|
| Public Strava API can create/update activity description via `activity:write` scope | We CAN set the activity description (promo caption) on upload and update it later. |
| Public Strava API CANNOT upload photos unless partner-level access | We CANNOT auto-attach images to Strava activities. Images must be manually shared/exported by the user via native share sheet. |
| `external_id` dedup (409 handling) already implemented | Re-sync is idempotent. |
| `app_inactive` 403 handling (BLD-3063) already implemented | No Sentry noise if app goes inactive again. |

### Existing Code Paths

| Area | Files | Status |
|---|---|---|
| Strava upload | `lib/strava.ts` (`uploadActivity`, `buildActivityDescription`, `syncSessionToStrava`) | Functional. Hardcoded promo footer. |
| Strava DB | `lib/db/strava.ts`, `lib/db/schema.ts` (stravaConnection, stravaSyncLog tables) | Functional. |
| Strava telemetry | `lib/strava-telemetry.ts` (`captureStravaError`, `stravaLog`) | Functional. |
| Share sheet | `components/ShareSheet.tsx` (Text + Image options) | Needs Strava-specific options. |
| Share card (workout) | `components/ShareCard.tsx` (1080px portrait), `components/share/ShareCardStats.tsx`, `components/share/ShareCardExercises.tsx` | Needs Strava-optimized variant. |
| Share overlay (detail) | `components/session/detail/SessionDetailShareOverlay.tsx` | Needs Strava image option. |
| Share overlay (summary) | `components/session/summary/SummaryFooter.tsx`, `app/session/summary/[id].tsx` | Needs Strava image option. |
| Share data hook (detail) | `hooks/useSessionShareData.ts` | Needs caption data. |
| Share data hook (summary) | `hooks/useSummaryData.ts`, `hooks/useSummaryActions.ts` | Needs caption data. |
| Achievements | `lib/achievements.ts` (ACHIEVEMENTS, evaluateAchievements), `hooks/useAchievements.ts`, `components/achievements/AchievementBadge.tsx`, `components/session/summary/AchievementsCard.tsx` | No shareable recap image card. |
| Image capture | `react-native-view-shot` (`captureRef`), `expo-sharing` (`Sharing.shareAsync`) | Functional. |

---

## Phases

### Phase 0: Preflight — Verify Strava App Status

Before any code changes ship:

1. **Dashboard check:** confirm the Strava app/subscription status is **Active** in the Strava API dashboard. An inactive app produces `403 app_inactive`, which blocks all uploads regardless of code correctness.
2. **Live smoke test:** if feasible, perform one live OAuth flow + activity upload from a dev build to verify the handshake still succeeds and the returned activity contains the expected description.
3. **Confirm no `app_inactive` 403:** check Sentry or recent sync logs for any `app_inactive` errors. The BLD-3063 fallback prevents Sentry noise, but it does **not** fix an inactive app — the dashboard must be active.

> **Code fallback exists (BLD-3063), but it is not a substitute for an active dashboard.** If the app is inactive, fix the subscription before proceeding.

---

### Phase 1: Editable Promo Caption Service

**Goal:** Centralized, user-editable promo caption with safe defaults, persisted to DB, used by both Strava description and image/text sharing.

#### Data Model

New table `share_settings` (singleton, like `body_settings`):

```sql
CREATE TABLE IF NOT EXISTS share_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  promo_caption TEXT NOT NULL DEFAULT '',
  promo_caption_enabled INTEGER NOT NULL DEFAULT 0,
  strava_description_enabled INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
```

- `promo_caption`: user-editable text. Empty string = use built-in default.
- `promo_caption_enabled`: master toggle (user can disable promo entirely). **Default `0` (conservative OFF)** — user must explicitly opt-in to promotional text.
- `strava_description_enabled`: whether to append promo caption to Strava activity description on upload.

#### Promotional Caption Policy

- Promotional text must be **user-editable** and **non-spammy**.
- The app must **never** inject promotional content the user cannot remove or edit.
- Conservative default OFF respects user choice and avoids unsolicited branding.

Default caption (when `promo_caption` is empty):
```
Tracked with CableSnap · cablesnap.app
```

> **Intentional URL change:** the current hardcoded footer is `Tracked with CableSnap · https://github.com/alankyshum/cablesnap`. Switching the default to `cablesnap.app` is a product decision, not a refactor. Test assertions must target the **actual old hardcoded string** when verifying legacy behavior, or the **new `DEFAULT_PROMO_CAPTION` constant** for new behavior.

#### Files to Change

| File | Action |
|---|---|
| `lib/db/schema.ts` | Add `shareSettings` table definition + `ShareSettingsRow` type. |
| `lib/db/tables.ts` | Add `CREATE TABLE IF NOT EXISTS share_settings` DDL. |
| `lib/db/share-settings.ts` | **NEW.** `getShareSettings()`, `saveShareSettings(partial)`, `getEffectivePromoCaption()` — returns user caption or default. |
| `lib/db/index.ts` | Re-export share-settings functions + types. |
| `lib/strava.ts` | Modify `buildActivityDescription` to accept optional `promoCaption` param instead of hardcoded footer. `uploadActivity` fetches `getEffectivePromoCaption()` and passes it through. When `strava_description_enabled` is false, omit promo entirely. |
| `hooks/useShareSettings.ts` | **NEW.** Hook wrapping `getShareSettings`/`saveShareSettings` with reactive state. Used by settings UI + share flows. |
| `components/settings/ShareSettingsCard.tsx` | **NEW.** Settings UI: promo caption TextInput (multi-line, maxLength 200), enable toggle, Strava description toggle. Follows `IntegrationsCard` pattern. |
| `app/(tabs)/settings.tsx` | Import + render `ShareSettingsCard`. |
| `hooks/useSessionShareData.ts` | Fetch `getEffectivePromoCaption()` and expose `promoCaption` in return value. |
| `hooks/useSummaryData.ts` | Fetch `getEffectivePromoCaption()` and expose `promoCaption` in return value. |

#### Strava Description Update API

New function in `lib/strava.ts`:

```typescript
async function updateActivityDescription(
  activityId: string,
  description: string
): Promise<void>
```

- Calls `PUT ${STRAVA_API_BASE}/activities/${activityId}` with `{ description }`.
- Used when user edits promo caption AFTER an activity was already synced.
- 401/403 handling mirrors `uploadActivity`.
- Do NOT call automatically on fresh upload — `POST /activities` already includes the description. Only call for: previously synced activity with edited caption, `409` resolved existing activity, or explicit post-sync caption edit.

---

### Phase 2: Strava-Optimized Workout Overview Image

**Goal:** A `ShareCard` variant optimized for Strava's landscape feed format, shareable via native share sheet.

#### Component Architecture

New component `StravaShareCard` — landscape 1200×675px (16:9):

```
┌──────────────────────────────────────────┐
│  [dumbbell] CableSnap          [date]    │
│                                          │
│  Session Name                             │
│  ─────────────────────────               │
│  Duration | Sets | Volume                │
│                                          │
│  🏆 PRs (if any)                         │
│  Exercise 1: 3×10 @ 50kg                 │
│  Exercise 2: 3×12                         │
│                                          │
│  [editable promo caption]    cablesnap.app│
└──────────────────────────────────────────┘
```

- Reuses `ShareCardStats` + `ShareCardExercises` sub-components.
- New `StravaShareCardPromo` sub-component renders the editable promo caption at the bottom.
- Card renders the promo caption from props (not DB) so the preview can show live edits.

#### Files to Change

| File | Action |
|---|---|
| `components/share/StravaShareCard.tsx` | **NEW.** Landscape 1200×675 card. Props: same as `ShareCardProps` + `promoCaption: string` + `promoEnabled: boolean`. |
| `components/share/StravaShareCardPromo.tsx` | **NEW.** Renders promo caption text in card footer area. |
| `components/ShareSheet.tsx` | Add third `ShareOption`: "Share Strava Image" (icon: `run-fast` or `strava`-like). Only show when `Platform.OS !== "web"`. Add `onShareStravaImage` callback prop. **Increase sheet `snapPoints` from `['30%']` to `['45%']`–`['50%']`** to accommodate the extra option without scrolling. |
| `components/session/detail/SessionDetailShareOverlay.tsx` | Add Strava card preview modal (alongside existing `ShareCard` preview). New ref `stravaCardRef`. New `handleStravaImage` → opens preview, `handleCaptureStravaAndShare` → `captureRef` + `Sharing.shareAsync`. |
| `components/session/summary/SummaryFooter.tsx` | Same additions: Strava card preview modal + capture/share handler. |
| `hooks/useSessionShareData.ts` | Expose `promoCaption`, `promoEnabled` for Strava card. |
| `hooks/useSummaryActions.ts` | Add `stravaPreviewVisible`, `handleStravaImage`, `handleCaptureStravaAndShare` — mirror existing image share actions. |
| `app/session/summary/[id].tsx` | Pass new props to `SummaryFooter` + `ShareSheet`. |

#### Caption Edit in Preview

Before capturing, user can tap the promo caption area in the preview to edit it inline. This:

1. Opens a small inline TextInput overlay on the card preview.
2. Edits are ephemeral (not persisted to DB) unless user taps "Save as default" — which calls `saveShareSettings`.
3. If `promoEnabled` is false, the caption area shows a subtle "Add promo caption" placeholder that toggles the enable flag on tap.

---

### Phase 3: Achievement Recap Image

**Goal:** A shareable image showing newly earned achievements from a workout, optimized for Strava/social sharing.

#### Component Architecture

New component `AchievementRecapCard` — landscape 1200×675px:

```
┌──────────────────────────────────────────┐
│  [trophy] CableSnap          [date]      │
│                                          │
│  3 Achievements Unlocked!                 │
│  ─────────────────────────               │
│  [icon] PR Breaker    Hit your first PR  │
│  [icon] Ton Club      Lifted 1000kg      │
│  [icon] Week Warrior  7-day streak       │
│                                          │
│  [editable promo caption]    cablesnap.app│
└──────────────────────────────────────────┘
```

- Takes `achievements: AchievementDef[]` + `sessionName` + `date` + `promoCaption` + `promoEnabled`.
- Shows up to 4 achievements; if more, shows "+N more".
- Reuses `AchievementIconName` for MaterialCommunityIcons rendering (avoids emoji tofu on web).
- Only offered when `achievements.length > 0`.

#### Files to Change

| File | Action |
|---|---|
| `components/share/AchievementRecapCard.tsx` | **NEW.** Landscape card. Renders earned achievements with icons, names, descriptions. |
| `components/share/AchievementRecapCardPromo.tsx` | **NEW.** Promo caption footer (shared pattern with `StravaShareCardPromo`). |
| `components/ShareSheet.tsx` | Add fourth `ShareOption`: "Share Achievement Recap" (icon: `trophy-variant`). Only show when `achievements.length > 0`. Add `onShareAchievementImage` callback + `hasAchievements` prop. |
| `components/session/detail/SessionDetailShareOverlay.tsx` | Add achievement recap preview modal + capture/share. Props gain `newAchievements: AchievementDef[]`. |
| `components/session/summary/SummaryFooter.tsx` | Same. Props gain `newAchievements: AchievementDef[]`. |
| `hooks/useSummaryData.ts` | Already exposes `newAchievements`. Pass through. |
| `hooks/useSessionShareData.ts` | Needs to fetch newly earned achievements for the session (may need a DB query for achievements earned in this session's timeframe). Or: only offer recap on the summary screen (where `newAchievements` is already computed), not on the detail screen. **Decision: Phase 3 recap is summary-screen-only initially.** |
| `app/session/summary/[id].tsx` | Pass `newAchievements` to `SummaryFooter`. |

---

### Phase 4: Strava Activity Description Sync + Deep Link

**Goal:** Update the activity description for existing synced activities or after explicit caption edits. Avoid a redundant `PUT` on initial upload because `POST /activities` already includes the description. Provide a deep link to the Strava activity from the app.

#### Files to Change

| File | Action |
|---|---|
| `lib/strava.ts` | Add `updateActivityDescription(activityId, description)`. **Do NOT call it automatically after a fresh `uploadActivity` success** — the `POST /activities` payload already contains the promo caption. Only call `updateActivityDescription` in these cases: (1) activity was previously synced (`status === "synced"`) and the user has edited the caption since last sync, (2) a `409` resolves to an existing activity (`activityId` found in the conflict response), or (3) explicit post-sync caption edit from settings. Skip when the description to send equals the already-posted description. |
| `lib/db/strava.ts` | No schema change needed — `stravaSyncLog` already has `strava_activity_id`. |
| `components/session/detail/SessionDetailHeaderActions.tsx` | If session is synced to Strava (`getSyncLogForSession` returns `synced`), show a "View on Strava" button that opens `https://www.strava.com/activities/${activityId}` via `Linking.openURL`. |
| `hooks/useSessionShareData.ts` | Fetch `getSyncLogForSession(sessionId)` and expose `stravaActivityId` + `stravaSynced` flag. |
| `app/session/detail/[id].tsx` | Pass `stravaActivityId` to header actions. |

#### Queue Retry Behavior

`reconcileStravaQueue` retries already include the description in the upload payload, so no separate description update is required for queued retries. If a queued retry resolves to a `409` and an existing `activityId` is discovered, the retry may optionally update that activity's description with the current effective caption.

---

### Phase 5: Tests

#### Unit Tests

| File | Area |
|---|---|
| `__tests__/lib/share-settings.test.ts` | **NEW.** Default caption, custom caption, enable/disable toggle, DB round-trip. |
| `__tests__/lib/strava.test.ts` (extend) | Add: `buildActivityDescription` with custom promo caption; `updateActivityDescription` happy path + 401/403 handling; `uploadActivity` with `strava_description_enabled=false` omits promo. |
| `__tests__/components/StravaShareCard.test.tsx` | **NEW.** Renders stats, exercises, PRs, promo caption. Promo disabled → caption area hidden. |
| `__tests__/components/AchievementRecapCard.test.tsx` | **NEW.** Renders 0/1/4/5+ achievements. Promo caption. |
| `__tests__/components/ShareSheet.test.tsx` (extend) | Strava image option visible on native, hidden on web. Achievement recap option visible only when `hasAchievements`. |
| `__tests__/components/SessionDetailShareOverlay.test.tsx` | **NEW.** Strava card preview open/close, capture + share. Achievement recap hidden (detail screen). |
| `__tests__/components/SummaryFooter.test.tsx` (extend) | Strava card preview, achievement recap preview, capture + share. |

#### Integration / E2E

| File | Area |
|---|---|
| `__tests__/acceptance/strava-share-flow.test.tsx` | **NEW.** Full flow: complete workout → summary screen → open share sheet → select Strava image → preview → edit caption → share (mock `captureRef` + `Sharing.shareAsync`). |
| `__tests__/acceptance/strava-achievement-recap.test.tsx` | **NEW.** Complete workout with new achievements → summary → share achievement recap. |

#### Structural Tests (extend `__tests__/lib/strava.test.ts`)

- `shareSettings` table DDL present in `lib/db/tables.ts`.
- `shareSettings` re-exported from `lib/db/index.ts`.
- `getEffectivePromoCaption` exported from `lib/db/index.ts`.
- `updateActivityDescription` exists in `lib/strava.ts` source.
- `buildActivityDescription` no longer contains hardcoded `"Tracked with CableSnap · https://github.com/alankyshum/cablesnap"` string (moved to default constant).

---

### Phase 6: Rollout / Analytics

#### Feature Gating

- Strava share options behind existing `isStravaConnected()` check. If not connected, Strava image option shows but with a "Connect Strava" CTA that opens settings.
- Achievement recap option only when `newAchievements.length > 0`.
- Caption editing always available (even without Strava connected).

#### Analytics Events

| Event | Trigger | Properties |
|---|---|---|
| `strava_share_image_tapped` | User taps "Share Strava Image" | `sessionId`, `hasPrs`, `exerciseCount` |
| `strava_share_image_shared` | `Sharing.shareAsync` succeeds | `sessionId` |
| `strava_share_image_cancelled` | User cancels preview | `sessionId` |
| `achievement_recap_tapped` | User taps "Share Achievement Recap" | `sessionId`, `achievementCount` |
| `achievement_recap_shared` | Recap image shared | `sessionId`, `achievementCount` |
| `promo_caption_edited` | User edits caption in preview | `sessionId`, `captionLength` |
| `promo_caption_saved_default` | User taps "Save as default" | `captionLength` |
| `promo_caption_disabled` | User disables promo | — |
| `strava_description_updated` | `updateActivityDescription` succeeds | `sessionId`, `activityId` |
| `connect_strava_cta_tapped` | User taps "Connect Strava" CTA in share options | — |
| `view_on_strava_tapped` | User taps "View on Strava" | `sessionId`, `activityId` |
| `strava_description_toggled` | User toggles description sync setting | `enabled` |

Instrumentation via existing `stravaLog` pattern or a generic analytics module if one exists (check `lib/`).

#### Rollout Strategy

1. Phase 1 (caption service): ship behind no flag — purely additive. Default promo is **OFF** (`promo_caption_enabled = 0`) per promotional-caption policy; users must opt-in. Existing hardcoded Strava footer is removed in favor of the configurable service.
2. Phase 2 (Strava image): ship behind `isStravaConnected()` — only visible to connected users.
3. Phase 3 (achievement recap): ship unconditionally (recap is useful even without Strava).
4. Phase 4 (description sync): ship behind `strava_description_enabled` setting (default ON).

No remote feature flag needed — all gates are organic (Strava connection, achievements present).

---

## Acceptance Criteria

### Phase 1 — Caption Service

- [ ] `share_settings` table created with correct DDL (singleton `CHECK (id = 1)`, all columns).
- [ ] `getShareSettings()` returns defaults when no row exists.
- [ ] `getEffectivePromoCaption()` returns user caption when set, default when empty.
- [ ] `getEffectivePromoCaption()` returns empty string when `promo_caption_enabled = 0`.
- [ ] `promo_caption_enabled` defaults to `0` (conservative OFF).
- [ ] `buildActivityDescription` accepts `promoCaption` param; no hardcoded promo string.
- [ ] `uploadActivity` fetches effective caption and includes it in description.
- [ ] When `strava_description_enabled = false`, activity description omits promo.
- [ ] Settings screen shows `ShareSettingsCard` with editable caption, enable toggle, Strava toggle.
- [ ] Existing Strava upload tests still pass (no regressions from description builder change).

### Phase 2 — Strava Workout Image

- [ ] `StravaShareCard` renders at 1200×675px with session name, date, stats, exercises, PRs, promo caption.
- [ ] `ShareSheet` shows "Share Strava Image" option on native, hidden on web.
- [ ] Tapping "Share Strava Image" opens preview modal with `StravaShareCard`.
- [ ] User can edit promo caption inline in preview.
- [ ] "Share" button captures card via `captureRef` and opens `Sharing.shareAsync`.
- [ ] Promo caption area hidden when `promoEnabled = false`.
- [ ] Available on both summary and detail screens.
- [ ] If Strava not connected, option shows "Connect Strava" CTA.

### Phase 3 — Achievement Recap Image

- [ ] `AchievementRecapCard` renders earned achievements with icons, names, descriptions.
- [ ] Shows up to 4 achievements; "+N more" for overflow.
- [ ] `ShareSheet` shows "Share Achievement Recap" only when `newAchievements.length > 0`.
- [ ] Tapping opens preview, capture, share — same flow as Strava card.
- [ ] Available on summary screen only (Phase 3 scope).
- [ ] Recap card includes editable promo caption.

### Phase 4 — Description Sync + Deep Link

- [ ] `updateActivityDescription` is called only for previously synced activities (user edited caption), `409` resolved existing activities, or explicit post-sync caption edits — not on fresh upload.
- [ ] `updateActivityDescription` failure does not fail the sync (logged, not thrown).
- [ ] Detail screen shows "View on Strava" button when `stravaSyncLog.status === "synced"`.
- [ ] Tapping "View on Strava" opens `https://www.strava.com/activities/${activityId}`.
- [ ] 401/403 in `updateActivityDescription` triggers disconnect (401) or `captureStravaError` (403, non-app-inactive).

### Phase 5 — Tests

- [ ] All new test files pass.
- [ ] Existing `__tests__/lib/strava.test.ts` passes with description builder changes.
- [ ] No new Sentry errors from description sync (best-effort failure path).

### Phase 6 — Analytics

- [ ] All analytics events fire at correct triggers.
- [ ] No PII in event properties (session IDs are UUIDs, no user-identifiable data).

---

## Risk / Edge Cases

| Risk | Likelihood | Mitigation |
|---|---|---|
| `captureRef` fails on landscape card (new layout) | Low | `StravaShareCard` uses same `collapsable={false}` + `ref` pattern as `ShareCard`. Test on iOS + Android. |
| Strava API rate limit on description update | Low | Best-effort, non-blocking. Single call per sync. |
| User sets inappropriate promo caption | Low | Caption is user's own text on their own share. No moderation needed. Default is brand-safe. |
| `share_settings` migration on existing installs | Medium | DDL uses `CREATE TABLE IF NOT EXISTS` — safe for existing DBs. Default row inserted on first `getShareSettings` call if missing. |
| Achievement recap on sessions with 0 new achievements | None | Option hidden when `newAchievements.length === 0`. |
| Strava disconnects between upload and description update | Low | `updateActivityDescription` handles 401 independently. |
| Web platform | None | All share image options hidden on web (`Platform.OS !== "web"` check in `ShareSheet`). Caption settings visible on web (text sharing works on web). |

---

## Open Questions

1. **Achievement recap on detail screen?** Phase 3 scopes to summary only. Detail screen doesn't have `newAchievements` readily available (would need a DB query for achievements earned during this session's timeframe). Defer to Phase 3.1 if demand exists.

2. **Promo caption character limit?** Strava activity description has no documented hard limit but practical limit ~8000 chars. Share image caption area is visually constrained. Proposal: maxLength 200 for the editable field, with the understanding that only ~80 chars render visibly on the image card.

3. **Should the Strava image option also share text?** When sharing via native share sheet, the image is shared as a file. Some platforms allow accompanying text. `Sharing.shareAsync` does not support text + image together reliably. Proposal: image-only share; user can copy caption separately or the image itself contains the caption text.
