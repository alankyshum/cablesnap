# CableSnap Privacy Policy

**Effective date: November 27, 2026**

CableSnap is a fitness and nutrition tracking app. This policy explains what information the app uses, where it goes, and the choices you have. CableSnap does not show ads, offer financial features, or have government affiliation. It is not a medical service and does not provide medical advice.

## Information you choose to store

Your workouts, exercises, programs, nutrition logs, body measurements, goals, and preferences are stored on your device. These can include sensitive information about your health and fitness. CableSnap does not operate an account service or its own cloud database for this app data.

If you choose to export a backup, the file contains the categories you select. You control where you save or share it. Device operating-system backups may also include app data; their handling depends on your device and backup settings. Deleting a record or uninstalling the app may not remove copies already exported or included in a device backup.

Progress photos and form clips you choose to save are stored on your device. Gym-equipment photos you give directly to an external AI agent are handled by that agent and are not uploaded or processed by CableSnap.

## Information sent to service providers

### Diagnostics and app stability

In builds that include Sentry, CableSnap sends crash reports, diagnostic logs, and error-related replay data to Sentry to help diagnose problems. Sentry is configured to send default personally identifiable information, and app/device details, event context, and logs may be included. Images and vectors are masked in replay capture; replay is not sampled for ordinary sessions, and error replay is skipped while a media surface is open. The F-Droid build disables Sentry. Sentry handles information under its own privacy and retention practices.

### Agent access (optional)

Agent access creates a temporary, token-scoped relay session on a CableSnap-operated Cloudflare Worker. CableSnap sends only the workouts and sessions, templates, exercise library, and personal records you select within your chosen date range; nutrition data is excluded. Separate long-random owner and agent tokens limit the capabilities of the app and agent. Anyone with the private agent link can read the snapshot until the session expires, so share it only with an AI agent you trust. The relay stores the snapshot and proposals for at most the configured lifetime (30 minutes by default) and deletes them on expiry or immediate revoke. Agent proposals never write to the on-device database; CableSnap adds a proposed template only after you explicitly review and import it. CableSnap's app does not contact a third-party AI provider. You separately provide the token-scoped prompt and URL—and any gym-equipment photo directly—to an agent you choose, which handles information under that provider's privacy terms.

### Strava (optional)

If you connect Strava, the app uses Strava OAuth and a CableSnap-operated Cloudflare Worker to complete authorization and token exchange. Strava access and refresh tokens are stored in device secure storage. If you choose to sync a workout, the workout information needed for that action is sent to Strava; Strava then handles it under its own terms and privacy policy. You can disconnect Strava in the app; this removes locally stored tokens and requests deauthorization from Strava, but does not delete activities already sent to Strava.

## Choices, access, and deletion

You can choose whether to start Agent access, connect Strava, or export a backup. You can revoke an Agent access session immediately; otherwise it expires automatically after at most the configured lifetime (30 minutes by default). You can delete locally stored records using app features where available, remove saved photos or clips in the app, and disconnect Strava. Removing the app also removes app data according to your device's behavior, but may not remove operating-system backups, exports, or information already received by a provider. To ask a provider about information it holds, contact that provider directly. CableSnap does not set a retention period for providers' copies.

## Children

CableSnap is intended for people aged 13 and older and is not intended for children under 13.

## Changes and contact

This policy may be updated as the app or its services change. The effective date above identifies the current version.

For privacy questions, contact **onethingrightllc@gmail.com**. CableSnap is the developer/operator brand; no separate legal entity is represented by that name in this policy.
