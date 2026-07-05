# Plan: CableSnap Monetization — $0.99 Paid Listing + Cloud Sync

Status: DRAFT v2 (scope revised per owner 2025)
Owner: alankyshum / Persoack

## Scope (this revision)
- **Track A — Price-signal experiment:** list CableSnap on Google Play as a **$0.99 paid
  (upfront) app** to measure willingness-to-pay. Near-term, minimal engineering.
- **Track B — Cloud Sync foundation:** Phases **1, 2, 3, 4**.
  - Phase 1: build flavor/billing split
  - Phase 2: sync server (Cloudflare Worker + D1 + R2)
  - Phase 3: Google Play Billing integration (**subscription pricing/model TBD later**)
  - Phase 4: sync engine (E2E-encrypted snapshot, reuse existing backup)
- **Deferred:** subscription price/model (Phase 3 detail), **paywall UX (old Phase 5)**,
  web/B2B Stripe/Plaid (Phase 6), iOS StoreKit (Phase 7).

---

## Codebase reality (verified — informs everything below)

1. **Local-first, backup already exists.** SQLite via drizzle/expo-sqlite. Mature versioned
   backup: `exportAllData()` / `importData()` producing `BackupV7` (`lib/db/import-export.ts`),
   auto-backup with retention (`lib/backup.ts`). **This is the cloud-sync payload — reuse it.**
2. **No auth/account/billing/sync code yet.** Greenfield for those.
3. **Backend precedent = Cloudflare Worker.** Strava runs on `workers/strava-proxy`
   (`wrangler.toml`; secrets via `wrangler secret put`; config surfaced via `app.config.ts`
   `extra.stravaProxyUrl`). Reuse stack: **Workers + D1 + R2**.
4. **⭐ Play vs F-Droid split ALREADY EXISTS** (BLD-736 / BLD-716, pivoted productFlavors →
   build types; see `.plans/PLAN-BLD-716.md`). In `scheduled-release.yml`:
   - `:app:assembleRelease` → **`release`** build type = **Play** (Watch bridge + GMS Wearable
     wired in) → `cablesnap.apk` (canonical Play artifact).
   - `:app:assembleReleaseFdroid` → **`releaseFdroid`** = **F-Droid** (GMS excluded) →
     `cablesnap-fdroid.apk`.
   - `:wear:assembleRelease` → Wear OS companion, **Play-only**.
   - **AC10b CI gate** already fails the release if the F-Droid APK contains ANY
     `com/google/android/gms/wearable/*` class. → **This is our exact template** for a
     "F-Droid build contains zero Play-Billing classes" gate.
5. **Current Play artifact is an APK.** `cablesnap.apk`. **New Play listings require AAB**
   (Android App Bundle) → we must add `:app:bundleRelease` output.
6. **Package id:** `com.persoack.cablesnap` (Android + iOS). App is **not yet live on Play**
   (no `play.google.com` URL anywhere in repo) — ASSUMPTION to confirm; it unlocks Track A.

---

## Track A — $0.99 Paid App experiment

### Purpose
Cheap real-money signal: how many people pay *anything* to install. Informs later subscription
pricing. Reversible in the safe direction only.

### ⚠️ Hard constraints
- **Free → Paid is IRREVERSIBLE for existing installs.** Google forbids converting a live free
  app to paid. So this ONLY works if the app is **not yet published free on Play** (see
  assumption #6). If it IS already free-published, Track A is impossible on that listing — we'd
  instead use a **one-time $0.99 in-app "unlock/tip" IAP** on a free listing.
- **Paid → Free is allowed** later — so "start paid, later go free + subscription" is the
  correct, reversible sequence. This matches Track B's long-term freemium model.
- AGPL-3.0 permits selling binaries; F-Droid stays free. Play users pay $0.99 for convenience.
  No license conflict. Persoack trademark protects the brand on forks.
- Play Console one-time reg fee ($25); merchant/payments profile required to sell paid apps.

### Steps (mostly Console + release plumbing, minimal code)
1. **Confirm assumption #6** (app not live free on Play). If false → switch to IAP-unlock model.
2. **Add AAB build output**: extend release build to emit `:app:bundleRelease`
   (`android/app/build/outputs/bundle/release/app-release.aab`); add an `eas.json` / gradle path
   for the Play AAB. Keep APK artifacts for GitHub Release + F-Droid mirror.
3. **Play Console setup:** create/verify app, set app as **Paid**, price **$0.99** (+ tax/local
   pricing), set up merchant/payments profile.
4. **Complete store listing** (assets largely exist): title, short/full description, screenshots
   (`assets/store-screenshots/*-store-pixel9.png`), feature graphic, promo video (README
   YouTube Short), content rating questionnaire, **Data Safety** form, privacy policy URL.
5. **Upload signed AAB** to a test track (internal → closed) first; verify install/purchase with
   a license-test account; then promote to production.
6. **Instrument the signal:** track installs vs store views (Play Console acquisition reports).
   No in-app analytics needed for the price test itself.

### Track A acceptance
- Signed AAB accepted by Play; app listed at $0.99; test purchase succeeds; F-Droid build
  unaffected (still free, GMS-free, passes AC10b).

---

## Track B — Cloud Sync foundation (Phases 1–4)

### Phase 1 — Extend the existing split for Play Billing (NOT build from scratch)
The `release`/`releaseFdroid` build-type split already exists. Work:
- Add Play Billing client dep (see Phase 3) wired **only** into the `release` (Play) build type,
  excluded from `releaseFdroid` via the same `configurations { releaseFdroidImplementation
  { exclude ... } }` mechanism the Wear/GMS split uses.
- **Add a CI gate mirroring AC10b**: assert `cablesnap-fdroid.apk` contains **zero**
  Play-Billing classes (e.g. `com/android/billingclient/*`). Reuse the dex-scan step pattern.
- Surface a build-time distribution flag if needed (mirror `app.config.ts` `extra` pattern) so
  sync/billing UI is gated to the Play build; FOSS build shows self-host docs instead.
**Verify:** F-Droid reproducible build + AC10b + new billing-absence gate all pass; Play build
includes billing client.

### Phase 2 — Sync server: `workers/cs-sync` (Cloudflare Worker)
- Scaffold mirroring `workers/strava-proxy` (`src/index.ts`, `wrangler.toml`, `tsconfig.json`,
  `package.json`).
- **D1**: accounts, devices, entitlements, sync_meta. **R2**: encrypted snapshot blobs.
- Endpoints: `/auth/*`, `/sync/push`, `/sync/pull`, `/sync/meta`, `/entitlement`,
  `/webhook/play` (RTDN).
- Secrets via `wrangler secret put` (Play service-account JSON, signing keys) — never committed.
- Publish worker source AGPL (self-host story keeps community goodwill).
**Verify:** Miniflare/`wrangler dev` integration tests; auth round-trip; blob push/pull.

### Phase 3 — Google Play Billing (client, Play build only) — *pricing/model TBD*
- Evaluate `react-native-iap` (DIY server verification, AGPL-clean, no vendor lock) vs
  RevenueCat (faster, vendor). **Lean DIY** unless spike says otherwise.
- Purchase → acknowledge → send purchase token → server verifies via **Google Play Developer
  API + RTDN**; server is entitlement source of truth (never trust client).
- Restore/upgrade/downgrade/cancel + grace handling.
- **Defer:** actual subscription products/prices/trial (owner decides later). Build the plumbing
  with a placeholder product so it's swap-ready.
**Verify:** license-test accounts; purchase → server entitlement true; cancel → grace → false.

### Phase 4 — Sync engine (client)
- `lib/sync/` `SyncEngine`: wrap `exportAllData()` → **client-side E2E encrypt** → push;
  pull → decrypt → `importData()`. Key from passphrase (scrypt/Argon2) or generated key in
  `expo-secure-store` (already a dep). Server stores ciphertext only.
- Triggers: manual "Sync now", on foreground, debounced after writes.
- Conflict: last-writer-wins on whole snapshot + monotonic `syncVersion` + deviceId; warn on
  newer remote. Delta/row-merge = later.
- Reuse `performAutoBackup()` retention ideas for cloud snapshots.
**Verify:** two-device round-trip (A push → B pull → equal data); offline queue; decrypt-fail
handling; large-snapshot perf.

---

## Deferred (explicitly out of scope this revision)
- Subscription price/model/trial specifics (decided later; Phase 3 built swap-ready).
- Paywall + account UX screens (old Phase 5).
- Web/B2B Stripe / Plaid-ACH billing (old Phase 6). NOTE: Plaid has **no role** on Android —
  Play mandates Play Billing for digital goods; Plaid only ever fits web/B2B later.
- iOS StoreKit (old Phase 7).

## Legal/compliance (needed for Track A listing already)
- Privacy Policy URL + Play Data Safety form (Track A needs these even without sync).
- For Track B: update both for cloud storage, E2E encryption, retention, GDPR delete endpoint.
- AGPL server publication satisfies network-served-component license.

## Risks
- **Assumption #6 wrong (app already free on Play):** Track A blocked → pivot to $0.99 IAP unlock.
- **APK-only pipeline:** must add AAB before any new Play listing.
- **F-Droid contamination:** billing/GMS classes leaking into `releaseFdroid` → breaks
  inclusion. Mitigated by extending AC10b gate.
- **Entitlement spoofing:** server-side Play Developer API + RTDN verification only.
- **E2E key loss = data loss:** clear warning + optional recovery-key export.

## Open questions for owner
1. **Confirm app is NOT yet live free on Play** (unlocks Track A paid listing).
2. Track A price locale strategy — flat $0.99 or Play auto local pricing?
3. Phase 3: DIY (`react-native-iap`) vs RevenueCat — approve DIY default?
4. Account model for sync: email magic-link vs anonymous device-key-first?

## Suggested execution order
Track A (fast money signal) can proceed in parallel with Phase 1–2 (no billing code needed for
paid app). Then Phase 3 + 4. Soft-launch sync behind Play internal testing track before GA.
