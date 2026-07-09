# PLAN: Per-User Strava Sync Observability + Manual Upload

## Problem / Goal

A user (me) finished a workout this morning. The app saved it. It never appeared on Strava. There is **zero** telemetry to debug why — no per-user identity in Sentry, no structured log of the sync outcome (status, error code, set count), no way to distinguish "Strava not connected" from "token expired" from "network blip" from "upload 409 fell through". The existing "Share to Strava" button on the detail screen only shares an *image* — it never (re)uploads the activity. This plan adds: (1) stable anonymous user identity in Sentry, (2) rich structured sync-outcome telemetry on every sync path, (3) a true "Upload to Strava" action on past workout details, (4) telemetry parity on the manual path.

---

## Background / Current-State Map

### Telemetry helpers (lib/strava-telemetry.ts:1-47)
- `stravaLog(level, message, attrs?)` — Sentry logs ('ourlogs' dataset), enabled globally via `enableLogs: true` in init.
- `captureStravaError(err, flow, step, extra?)` — Sentry exception.
- `stravaBreakcrumb(message, data?)` — breadcrumb only (attaches to exception events).
- Already used sparsely in `syncSessionToStrava` + `reconcileStravaQueue` but with **no user identity** and **no per-sync-outcome sentry event** (only stravaLog calls with partial attrs).

### Sync triggers
| Trigger | File:line | Captures telemetry? |
|---|---|---|
| Post-workout `finish()` callback | `hooks/useSessionActions.ts:1154-1155` | Only the toast; no sentry event for the outcome |
| `syncSessionToStrava()` | `lib/strava.ts:944` | `stravaLog` at start (line 945) and success (line 1005) — each partial; `handleUploadFailure` (line 925) logs error but **no structured outcome event** |
| `reconcileStravaQueue()` startup | `lib/strava.ts:1014` | `stravaLog` at per-entry failure (line 1044) — partial |
| `handleSaveDefaultCaption` desc update | `SessionDetailShareOverlay.tsx:182-186` | Calls syncSessionToStrava as side-effect |

### Sentry init (`app/_layout.tsx:43-58`)
- `Sentry.init()` at module level with `sendDefaultPii: true` (telemetry opt-in), `enableLogs: true`, `beforeSend: filterLocalhostEvents`.
- **`Sentry.setUser` is never called** — no identity of any kind.
- Guarded by snapshot test `__tests__/lib/media/sentry-init-snapshot.test.ts` (60 lines) — will fail if init config changes without updating it.

### ShareSheet gap (`components/ShareSheet.tsx:11-205`)
Props include `stravaConnected`, `onConnectStrava`, `onShareStravaImage` (image-only). There is **no option** that calls `syncSessionToStrava`. The "Share Strava Image" option (line 139-158) generates and shares a *card image* — it never triggers an upload. Description says "Generate a Strava workout card image."

### SessionDetailShareOverlay wiring (`components/session/detail/SessionDetailShareOverlay.tsx:19-191`)
- Receives `sessionId`, `stravaSynced`, `stravaActivityId` as props.
- Already imports `syncSessionToStrava` (line 16) and `stravaLog` (line 17).
- Passes `onShareStravaImage` and `stravaConnected` to ShareSheet.
- Has existing `handleSaveDefaultCaption` (line 173) that calls `syncSessionToStrava` when caption edited post-sync — proof that the import + pipeline is accessible.

### useSessionShareData hook (`hooks/useSessionShareData.ts:18-163`)
- Fetches `getSyncLogForSession(sessionId)` (line 58) to derive `stravaSynced` / `stravaActivityId`.
- Exposes: `shareSheetRef`, `stravaActivityId`, `stravaSynced`, `handleShareButtonPress`, `handleShareText`.
- Exposes **no** handler for manual Strava upload.

### SyncResult contract (`lib/strava.ts:834-838`)
```ts
type SyncResult =
  | { status: "synced"; activityId: string | null }
  | { status: "queued"; error: Error }
  | { status: "failed"; error: Error }
  | { status: "skipped" };
```
`syncSessionToStrava` never throws for expected failures (line 944: returns `SyncResult`). The `catch` block in `useSessionActions.ts:1174` only catches unexpected throws.

### Data tables for persistence (`lib/db/schema.ts`)
- `appSettings` (line 344): key-value table, used by nutrition/macro/achievements. Ideal for anonymous id.
- `errorLog` (line 359): on-device error trail (not sent to Sentry). Optional fallback.
- `interactionLog` (line 371): on-device interaction trail. Optional fallback.
- `stravaSyncLog` (line 414): per-session sync-log. Status: pending|synced|failed|permanently_failed.

### StravaError classification (`lib/strava-error.ts`)
- `StravaErrorCode`: `auth_expired | auth_revoked | network | rate_limit | server | config | app_inactive | unknown`.
- `StravaError` has `.code` and `.status` (HTTP status).
- `getStravaUserMessage(err)` maps errors to user-facing strings.

### Existing test constraints
- `__tests__/lib/strava.test.ts:174` — enforces `completeSession(id!)` runs BEFORE `syncSessionToStrava`.
- `__tests__/lib/strava.test.ts:183/188` — lib/db/sessions.ts has NO Strava business logic (no syncSessionToStrava calls, no strava.com refs, no toast).
- `__tests__/lib/strava.test.ts:194-195` — `reconcileStravaQueue` stays web-guarded.
- `__tests__/lib/media/sentry-init-snapshot.test.ts` — ANY init change must update this snapshot.
- Privacy (implicitly tested): no secrets/athlete IDs in stravaLog attrs (documented in `lib/strava-telemetry.ts:24-25`).

---

## Phased Plan

### Phase 1 — Anonymous User ID + Sentry.setUser

**Goal:** Every Sentry event/exception/log from this app carries a stable anonymous app-local user id so we can correlate events per device.

**Storage decision: `appSettings` table (key-value)**
- Rationale: appSettings is a simple key-value table (`lib/db/schema.ts:344`), already exported via `lib/db/settings.ts:8` (`getAppSetting`) and `:17` (`setAppSetting`), used by 6+ subsystems. No schema migration needed.
- Rejected options: SecureStore (not backed up, tied to device reinstall → lost id means lost correlation); body_settings (semantically wrong — it's for body metrics); dedicated table (overkill for one key-value pair).
- Key name: `"anonymous_user_id"`.

**Files to change:**

| File | Change |
|---|---|
| `lib/user-anonymous-id.ts` | **NEW.** Exports `{ getOrCreateAnonymousId(): Promise<string> }`. Generates uuid via `lib/uuid.ts`, atomically writes to `appSettings` via `setAppSetting("anonymous_user_id", uuid)`, calls `Sentry.setUser({ id })`. Initializes once, caches in module-level variable. |
| `app/_layout.tsx` (~line 58) | After `Sentry.init()` module block (line 58), **before** `SplashScreen.preventAutoHideAsync` (line 60): import and call `getOrCreateAnonymousId()`. It must be called after init (so Sentry SDK is ready) but as early as possible — before any async init that might throw. **Do NOT** block the layout render on it: fire-and-forget (`.catch(console.warn)`). Placed between line 58 and line 60: `setUpIdentity();`. Or more robustly: call inside the `useEffect` in `useAppInit.ts` after DB ready (line 91-92) so the DB is available for read/write. **Recommended:** call inside `useAppInit.ts:91-92` `.then()` after `getDatabase()` succeeds — guarantees DB is up. |
| `hooks/useAppInit.ts` (~line 92) | Add `await getOrCreateAnonymousId();` right after `getDatabase()` resolves (before the Platform.OS === "web" banner check on line 93). Import from `../lib/user-anonymous-id`. |
| `__tests__/lib/media/sentry-init-snapshot.test.ts` | **Update.** Add test that checks `Sentry.setUser` appears in the source OR that the new `user-anonymous-id.ts` import exists in `app/_layout.tsx`. More precise: snapshot-check that `app/_layout.tsx` imports `getOrCreateAnonymousId` from the new module. Also checks that NO `Sentry.setUser` with PII (no email, no name, no raw `athlete_id`) is called. |
| `lib/db/index.ts` | Re-export `getAppSetting`, `setAppSetting` if not already (check — line 234-235: yes, both exported). No change needed. |

**Acceptance criteria:**
- On app launch a uuid is generated once and persisted to `app_settings` table.
- Every subsequent launch reads the same id.
- `Sentry.setUser({ id: "<uuid>" })` fires after init.
- Snapshot test passes; any removal of `Sentry.setUser` call causes test failure.
- No PII (email, name, athlete_id) leaks into Sentry user context.

**Test impact:**
- New unit test: `__tests__/lib/user-anonymous-id.test.ts` — mocks `setAppSetting`/`getAppSetting`, verifies id generation, idempotency, Sentry.setUser call.
- Update `__tests__/lib/media/sentry-init-snapshot.test.ts` — add assertion that the import of `getOrCreateAnonymousId` exists in the layout source.
- Test `__tests__/hooks/useAppInit.test.ts` (if exists) — verify the id setup fires during app init.

---

### Phase 2 — Structured Sync-Outcome Telemetry

**Goal:** Every Strava sync attempt emits a single structured telemetry event capturing enough to debug silent non-uploads.

**Design: central hook inside `syncSessionToStrava`.** The function at `lib/strava.ts:944` is the single entry point for all Strava upload paths: post-workout finish (line 1154-1155), description-save (SessionDetailShareOverlay:182), and the manual action (Phase 3). Firing telemetry *inside* this function guarantees coverage regardless of caller. Additionally, fire at the call site in `useSessionActions.ts:1155` so the caller's context (source tag, toast path) is captured even if syncSessionToStrava is unreachable.

**New event name:** `"strava.sync.outcome"` via `stravaLog("info", "strava.sync.outcome", attrs)` for success/skipped/queued, and `captureStravaError` + `stravaLog("error", "strava.sync.outcome", attrs)` for permanent failures.

**Attribute schema:**

| Attribute | Type | Example | Source | PII? |
|---|---|---|---|---|
| `sessionId` | string (uuid) | `"a1b2c3d4-..."` | `sessionId` arg | No (opaque id) |
| `source` | `"post_workout"\|"manual_upload"\|"caption_save"\|"queue_reconcile"` | `"post_workout"` | Caller tag | No |
| `stravaConnected` | boolean | `true` | `getStravaConnection()` !== null | No |
| `completedSetCount` | number | `18` | `sets.filter(s => s.completed).length` | No |
| `totalSetCount` | number | `20` | `sets.length` | No |
| `status` | `"synced"\|"queued"\|"failed"\|"skipped"` | `"failed"` | SyncResult.status | No |
| `activityId` | string\|null | `"1234567890"` | SyncResult.activityId | No (Strava public activity id, non-PII) |
| `errorCode` | StravaErrorCode\|null | `"auth_expired"` | `error instanceof StravaError ? error.code : null` | No |
| `errorMessage` | string\|null | `"Token exchange failed: 401"` | `error.message` (truncated to 200 chars in stravaLog already) | No |
| `httpStatus` | number\|null | `401` | `error.status ?? null` | No |
| `retryInfo` | `"permanent"\|"will_retry"\|null` | `"permanent"` | `isPermanentError(err)` | No |
| `retryCount` | number | `2` | From DB sync log or in-memory | No |
| `flow` | string | `"strava_upload"` | Existing tag | No |
| `step` | string | `"success"\|"failure"\|"queued"\|"skipped_no_sets"\|"skipped_not_connected"` | Where in pipeline | No |
| `appVersion` | string | `"2.14.0"` | Sentry auto-tag or `Constants.expoConfig?.version` | No |

**Proved non-PII:** All values are either opaque uuids, booleans, enumerations, numbers, or Strava public activity ids. No tokens, no secrets, no auth codes, no athlete name/id.

**Files to change:**

| File | Change |
|---|---|
| `lib/strava.ts` (~line 944) | Add structured event emission at **every exit point** of `syncSessionToStrava` — after every `return { status: ... }`. Each calls `stravaLog` with the full attribute set above. The `handleUploadFailure` helper (line 915) already fires a `stravaLog` but with partial attrs — extend to include the full schema and also call `captureStravaError` for permanent failures. |
| `lib/strava.ts` (~line 1014) | For `reconcileStravaQueue`, add the same structured event per entry (line 1044 already fires partial — extend with `completedSetCount`, `totalSetCount`, get from DB). |
| `hooks/useSessionActions.ts:1152-1176` | Add a `stravaLog("info", "strava.sync.outcome", ...)` call with `source: "post_workout"` that captures the result status and the same schema. This fires even if `syncSessionToStrava` itself doesn't (e.g. dynamic import fails). The call in `syncSessionToStrava` and the call here are complementary — the stravaLog key is the same so Sentry deduplicates or we accept mild overlap. Use the result variable already in scope. |

**Acceptance criteria:**
- After every sync attempt (success, failure, queued, skipped), a `stravaLog` event with key `"strava.sync.outcome"` appears in Sentry logs.
- Permanent failures also emit a `captureStravaError` with the same tags.
- The event contains all attributes in the schema table above.
- No new PII is introduced.

**Test impact:**
- New unit tests in `__tests__/lib/strava.test.ts` — mock `stravaLog` and `captureStravaError`, call `syncSessionToStrava`, assert the exact attrs passed for each SyncResult variant.
- Test that `stravaLog` is called with `"strava.sync.outcome"` message for all 4 statuses.

---

### Phase 3 — Manual "Upload to Sync" Action + Fix no-op Top-Right Share Button

**Sub-goal A — Fix the no-op Share button on detail screen:**

CONFIRMED ROOT CAUSE: The top-right Share button in `app/session/detail/[id].tsx` is correctly wired (`onShare={share.handleShareButtonPress}`), `SessionDetailShareOverlay` is rendered unconditionally, and `useSessionShareData.ts` correctly calls `shareSheetRef.current?.snapToIndex(0)`. The broken link is **runtime presentation failure of the non-modal `@gorhom/bottom-sheet` `<BottomSheet index={-1}>`** mounted at the detail screen's bare React Fragment (`<>`) root — no `flex:1` full-height parent means the sheet cannot compute its layout, so `snapToIndex(0)` is a silent visual no-op.

By contrast, the working share path (`components/session/summary/SummaryFooter.tsx`) uses plain React-Native `<Modal>`, not `ShareSheet`/BottomSheet at all — confirming the `ShareSheet` component is the only broken path.

**Fix — two options; implement Option A, fallback to B if provider constraints bite:**

- **Option A (preferred, robust):** Convert `components/ShareSheet.tsx` from `@gorhom/bottom-sheet`'s non-modal `<BottomSheet>` to `BottomSheetModal` + `BottomSheetModalProvider`. Present via `ref.present()` / dismiss via `ref.dismiss()`. Update `hooks/useSessionShareData.ts` `handleShareButtonPress` to call `.present()` instead of `.snapToIndex(0)` (ref typed as `BottomSheetModal` instead of `BottomSheet`). Ensure a `BottomSheetModalProvider` wraps the app root or detail screen — confirm placement during implementation. This makes header-triggered presentation reliable regardless of parent layout.
- **Option B (cheaper fallback):** Replace the bare Fragment `<>` in `app/session/detail/[id].tsx` with `<View style={{ flex: 1 }}>` (or a filling `GestureHandlerRootView`) so the non-modal BottomSheet can size and present. Lower blast radius but leaves the fragile non-modal pattern in place for future misuse.
- **Runtime confirmation step during implementation:** On emulator, log whether `shareSheetRef.current` is null at press time. Verify `GestureHandlerRootView` wraps the app root (via `app/_layout.tsx`).

**Sub-goal B — Add the real "Sync to Strava" upload action:**

Add a NEW option inside ShareSheet (not a header button) labeled **"Sync to Strava"** (or **"Sync to Strava again"** when `stravaSynced && stravaActivityId`), shown only when `stravaConnected === true`, native-only. This option calls the SAME pipeline `syncSessionToStrava(sessionId, "manual_detail")`, shows a result toast, refreshes sync-log state, and emits telemetry (Phase 4). The existing "Share Strava Image" / "Connect Strava" options share only an IMAGE or open settings — they never (re)upload; the new option IS the true upload trigger.

**Design decisions:**
- **Label:** Open decision — "Sync to Strava" vs "Upload to Strava". Keep label decision for implementer.
- **Visibility:** `stravaConnected === true`. Always shown for all sessions (enables re-sync). Label changes to "Sync to Strava again" if `stravaSynced && stravaActivityId`.
- **Platform guard:** `Platform.OS !== "web"` (native-only, like all Strava flows).
- **Position:** New `ShareOption` row inside ShareSheet, after "Share Strava Image" row, before achievements row.
- **Disabled state:** While upload is in-flight, button disabled via `syncStravaDisabled` prop.

**Files to change:**

| File | Change |
|---|---|
| `components/ShareSheet.tsx` | **Option A:** Convert from non-modal `<BottomSheet index={-1}>` to `<BottomSheetModal>` + `BottomSheetModalProvider`. Props type: add `onSyncStrava?: () => void; syncStravaDisabled?: boolean;`. Add new `ShareOption` row with icon `"sync"`/`"upload"`, label `"Sync to Strava"`/`"Sync to Strava again"` (based on existing `stravaSynced` prop if passed, or let parent control label). Guard: `showImageOption && stravaConnected`. Hook `onPress` to `onSyncStrava`. |
| `components/session/detail/SessionDetailShareOverlay.tsx` | Add state `[syncingToStrava, setSyncingToStrava] = useState(false)`. Async handler `handleSyncStrava`: sets syncing=true, calls `syncSessionToStrava(sessionId!, "manual_detail")`, handles result: `synced` → toast "Synced to Strava ✓" + call `refreshSyncLog()`; `queued` → toast "Strava sync queued — will retry"; `failed` → toast via `getStravaUserMessage(result.error)`; `skipped` → toast "Already on Strava". Catch unexpected throws → toast "Strava sync failed". Finally: syncing=false. Pass `onSyncStrava={handleSyncStrava}`, `syncStravaDisabled={syncingToStrava}` to ShareSheet. |
| `hooks/useSessionShareData.ts` | Extract sync-log fetch into named function `loadSyncLog(sessionId)`. Return `refreshSyncLog: () => loadSyncLog(sessionId)`. Update ref type from `BottomSheet` to `BottomSheetModal`. Change `handleShareButtonPress` from `shareSheetRef.current?.snapToIndex(0)` to `shareSheetRef.current?.present()`. |
| `app/session/detail/[id].tsx` | Destructure `refreshSyncLog` from `useSessionShareData` return. Pass it as new prop `onRefreshSyncLog` to `SessionDetailShareOverlay`. **Option B only:** Replace `<></>` root with `<View style={{ flex: 1 }}>`. |
| `app/_layout.tsx` (or detail screen) | **Option A:** Wrap component tree in `<BottomSheetModalProvider>` if not already present at app root. Confirm existing placement first. |

**Acceptance criteria:**
- [Share button fix] Tapping top-right Share button on detail screen presents the share sheet (not a no-op).
- [Upload action] ShareSheet shows "Sync to Strava" option when Strava is connected (native only).
- [Upload action] Tapping calls `syncSessionToStrava(sessionId, "manual_detail")`.
- Success toast "Synced to Strava ✓" appears; "View on Strava" icon appears in header.
- Failure toast shows user-friendly message from `getStravaUserMessage`.
- Button disabled during upload.
- Works for: never-synced sessions AND already-synced sessions (re-sync/caption update).
- Does NOT block UI during upload (async, but button disabled).
- Runtime log confirms shareSheetRef.current is non-null at press time.

**Test impact:**
- Unit test: `__tests__/components/ShareSheet.test.tsx` — verify new option renders when `stravaConnected=true`, hidden when false.
- Unit test: `__tests__/hooks/useSessionShareData.test.ts` — verify `refreshSyncLog` updates state; verify `handleShareButtonPress` calls `.present()` not `.snapToIndex`.
- Integration test: `__tests__/components/SessionDetailShareOverlay.test.tsx` — mock `syncSessionToStrava`, verify toast on each SyncResult.
- Unit test: confirm detail Share button press invokes `shareSheetRef.current?.present()` (or `snapToIndex` before fix).

---

### Phase 4 — Manual Path Telemetry Parity

**Goal:** The manual "Sync to Strava" action emits the SAME structured telemetry as the post-workout path, with `source: "manual_upload"` to distinguish it.

**Change:** Minimal — Phase 2's central telemetry inside `syncSessionToStrava` already covers this. The manual path calls the same function. The `source` tag is passed as an argument.

**Files to change:**

| File | Change |
|---|---|
| `lib/strava.ts:944` | Add optional param `source?: string` to `syncSessionToStrava` signature, default `"post_workout"`. Pass `source` into the telemetry attrs. **Or** — simpler — keep it as a tag set at the call site. Since telemetry fires both inside syncSessionToStrava (Phase 2) AND at the call site (Phase 2 also adds call-site event), the call-sites set `source` differently:
  - `useSessionActions.ts:1155` → `source: "post_workout"`
  - `SessionDetailShareOverlay.tsx` new handler → `source: "manual_upload"`
  - `SessionDetailShareOverlay.tsx:182` (caption-save) → `source: "caption_save"`
  - `reconcileStravaQueue` → `source: "queue_reconcile"` (already uses `phase: "reconcile"` — add `source` to align) |
| `lib/strava.ts:944` | Change signature to `syncSessionToStrava(sessionId: string, source: string = "post_workout"): Promise<SyncResult>`. |

**Acceptance criteria:**
- Sentry log events from manual upload carry `source: "manual_upload"`.
- Same attribute schema as Phase 2.

**Test impact:**
- Update Phase 2 tests to assert `source` parameter is passed through.

---

### Phase 5 — Tests

| Test | Scope | File |
|---|---|---|
| New: anonymous id persistence | Mock appSettings; verify id generated once, same on re-read | `__tests__/lib/user-anonymous-id.test.ts` |
| Update: sentry-init snapshot | Assert `getOrCreateAnonymousId` import in layout source | `__tests__/lib/media/sentry-init-snapshot.test.ts` |
| New: sync telemetry attrs | For each SyncResult variant, assert stravaLog called with correct attrs | `__tests__/lib/strava.test.ts` |
| New: ShareSheet renders manual option | Assert new option visible when connected, hidden when not | `__tests__/components/ShareSheet.test.tsx` (or extend) |
| New: SessionDetailShareOverlay manual sync | Mock syncSessionToStrava, assert toast per status | `__tests__/components/SessionDetailShareOverlay.test.tsx` |
| Update: useSessionShareData | Assert refreshSyncLog correctly updates stravaSynced | `__tests__/hooks/useSessionShareData.test.ts` |
| Verify: no PII in telemetry attrs | Static check that stravaLog attrs never include athlete_id, tokens | `__tests__/lib/strava-telemetry.test.ts` |
| New: detail Share button presents sheet | Assert `shareSheetRef.current?.present()` (or `snapToIndex` pre-fix) called on press | `__tests__/hooks/useSessionShareData.test.ts` |
| New: onSyncToStrava invokes syncSessionToStrava | Mock syncSessionToStrava, assert called with `sessionId` and `source: "manual_detail"` | `__tests__/components/SessionDetailShareOverlay.test.tsx` |

---

### Phase 6 — Rollout / Verification

1. **Emulator repro of silent non-upload:**
   - Disconnect network in emulator.
   - Complete a workout.
   - Verify `strava.sync.outcome` event arrives in Sentry with `status: "failed"`, `errorCode: "network"`, `httpStatus: null`, `source: "post_workout"`.
   - Open detail screen, tap "Sync to Strava" — same event with `source: "manual_upload"`.

2. **Real device E2E:**
   - Run a workout with Strava connected.
   - Complete → verify Synced to Strava toast → verify Sentry log `strava.sync.outcome` with `status: "synced"`.
   - Open detail → verify "View on Strava" link → verify "Sync to Strava" option shares image (re-sync).

3. **Sentry dashboard check:**
   - Confirm `user.id` appears on events.
   - Filter by `strava.sync.outcome` in Sentry logs.
   - Verify no `athlete_id` / `athlete_name` / token fragments in any event.

**Acceptance criteria:**
- All 4 sync outcomes (synced, queued, failed, skipped) produce debuggable Sentry events with full attribute set.
- Anonymous id persists across app restarts.
- Manual upload works end-to-end and produces the same telemetry.
- Zero PII leaks.

---

## Risks / Open Questions

| Question | Options | Recommendation |
|---|---|---|
| **Where to initialize anonymous id — module-level vs after DB init?** | (a) Module-level before `SplashScreen.preventAutoHideAsync()` — faster, fires earlier; but DB may not be ready. (b) Inside `useAppInit` after `getDatabase()` — safe. | **(b)**. DB readiness is guaranteed. The 100ms delay is irrelevant for observability. |
| **Allow re-sync for already-synced sessions?** | (a) Always show the option. (b) Only show when NOT synced. (c) Show with different label/confirmation. | **(a)** Always show. Re-sync is useful when caption was edited or first sync silently failed but the syncLog says "synced" (e.g. 409 with null activityId). Change label to "Sync to Strava again" if `stravaSynced === true`. |
| **Should `syncSessionToStrava` accept a `source` param or rely on call-site telemetry?** | (a) Add `source` param to function signature. (b) Fire telemetry only at call sites. | **(a)** Add `source` param defaulting to `"post_workout"`. Central emission inside the function is the single source of truth; call-site emission is backup. |
| **Snapshot test won't pass — how to update it?** | Add assertion that `user-anonymous-id` import string exists in `app/_layout.tsx`. | Follow existing pattern in `sentry-init-snapshot.test.ts`. Add a new `describe` block "Anonymous user identity" with 2 it() calls: imports getOrCreateAnonymousId; no PII setUser. |
| **Do we need a migration for the app_settings key?** | No — `appSettings` is a key-value table; `setAppSetting` uses `ON CONFLICT DO UPDATE`. First write creates the row. No schema migration. | No migration needed. |
| **Strava athlete_id PII risk** | `stravaConnection.athlete_id` is already stored in DB. Plan explicitly bans it from Sentry payloads. | Enforce via code review and a static test that greps `lib/strava-telemetry.ts` and `lib/strava.ts` for `athlete_id` in stravaLog attrs. |
| **Performance concern: stravaLog per sync attempt** | `syncSessionToStrava` already calls stravaLog 2-3 times. Adding one more per exit is negligible. | Acceptable. |

---

## Definition of Done

- [ ] **Phase 1:** Anonymous id persists in `app_settings`; `Sentry.setUser({ id })` fires on boot; snapshot test updated.
- [ ] **Phase 2:** `syncSessionToStrava` emits structured `"strava.sync.outcome"` stravaLog on every exit path with full schema; `captureStravaError` for permanent failures.
- [ ] **Phase 3:** ShareSheet shows "Sync to Strava" option (native, connected-only); handler calls `syncSessionToStrava`, shows toast, refreshes sync-log state.
- [ ] **Phase 4:** Manual path telemetry carries `source: "manual_upload"`; all call-sites set appropriate source tag.
- [ ] **Phase 5:** All new and updated tests pass (unit + snapshot + static analysis for PII).
- [ ] **Phase 6:** Emulator repro confirms Sentry event shape; real device E2E confirms sync + toast + View-on-Strava.
- [ ] No PII (athlete_id, tokens, secrets) in any Sentry payload — verified by code review + static test.
- [ ] No schema migration needed.
- [ ] No violation of existing strava.test.ts constraints (ordering, DB business-logic boundary, web-guard).

---

## Hand-off to Planner

The `planner` agent should break this into fine-grained tasks per phase. Each phase has its own acceptance criteria. Phase 1 and 2 can be parallelized. Phase 3 depends on Phase 2 (reuses the telemetry). Phase 4 is a trivial delta on Phase 2. Phase 5 (tests) spans all phases. Key constraint: any change to `app/_layout.tsx` must also update the snapshot test file.
