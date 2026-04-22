---
name: publish-release
description: >-
  Publish a new CableSnap release with consistent version numbers across
  package.json, app.config.ts, F-Droid metadata, GitHub tag, GitHub Release,
  and F-Droid repo. Use when asked to publish, release, bump version, or
  ship a new version of the app.
---

# Publish a New CableSnap Release

Deterministic, repeatable steps to publish a new version of CableSnap.
Every version bump touches exactly 3 files + 1 tag + 1 GitHub Release,
then GitHub Actions builds the APK and deploys to the F-Droid repo.

## Release Signing (Automated in CI, BLD-484 / BLD-485)

Since BLD-485, release APKs are signed by the `scheduled-release.yml` CI
pipeline with a **persistent production keystore**. The four required GitHub
Actions secrets are:

- `ANDROID_KEYSTORE_BASE64` — base64 of the release PKCS12 keystore
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

The expected cert SHA-256 is committed to `fdroid/release-cert.sha256`. CI
runs `apksigner verify --print-certs` after every build and fails the
release if the fingerprint drifts — this is the drift alarm. Never edit that
file without rotating the signing key deliberately.

**Local builds do not sign as release-quality.** `./gradlew assembleRelease`
on a dev machine will silently fall back to the debug keystore (see
`plugins/with-release-signing.js`). Only CI produces shippable APKs.

### One-time reinstall warning

The FIRST release after BLD-485 merged required users to uninstall and
reinstall the app once (Android refuses in-place updates when the signing
certificate changes). Every release after that updates cleanly in-place.
The banner lives at `fdroid/FIRST_SIGNED_RELEASE_NOTICE.md`; delete it after
the first signed release has shipped to stop prepending the warning to
future release notes.

### Rotating the signing key

Do **not** rotate casually. Android ties app identity to the signing cert, so
rotating forces every user to uninstall/reinstall again (losing data) or
forces a new `applicationId` (effectively a different app in the F-Droid
repo). If you truly must rotate:

1. Generate a new keystore (PKCS12, RSA 2048, SHA256, ≥ 25-year validity).
2. Update all four GitHub Actions secrets.
3. Update `fdroid/release-cert.sha256` to the new fingerprint.
4. Recreate `fdroid/FIRST_SIGNED_RELEASE_NOTICE.md` warning users of the one-
   time uninstall.
5. Consider bumping the major version or the Android `package` name so the
   break is explicit.

## Pre-Flight Checks

Before publishing, verify:

```bash
# 1. All tests pass
npx jest --passWithNoTests

# 2. TypeScript compiles (ignore pre-existing test file errors)
npx tsc --noEmit 2>&1 | grep -v "__tests__"

# 3. No uncommitted changes
git status --porcelain

# 4. On main branch
git branch --show-current
```

STOP if any check fails. Fix issues before proceeding.

## Step 1: Determine the New Version

Read the current version from `app.config.ts`:

```bash
grep 'version:' app.config.ts
```

Follow semver: `MAJOR.MINOR.PATCH`
- PATCH: bug fixes, dependency updates, small tweaks
- MINOR: new features, screen additions, UX changes
- MAJOR: breaking changes, data migrations, architecture changes

Ask the user what kind of release this is if unclear.

## Step 2: Bump Version in All 3 Files

All three files MUST have the exact same version string.

### File 1: `app.config.ts`
```
version: "X.Y.Z",
```

### File 2: `package.json`
```
"version": "X.Y.Z",
```

### File 3: `fdroid/metadata/com.persoack.cablesnap.yml`
```yaml
CurrentVersion: X.Y.Z
CurrentVersionCode: N
```

`CurrentVersionCode` is an integer that MUST increment by 1 on every release.
To find the current value:

```bash
grep 'CurrentVersionCode' fdroid/metadata/com.persoack.cablesnap.yml
```

Increment it by 1.

### Validation

After bumping, verify consistency:

```bash
grep '"version"' package.json
grep 'version:' app.config.ts
grep 'CurrentVersion' fdroid/metadata/com.persoack.cablesnap.yml
```

All three version strings must match. `CurrentVersionCode` must be previous + 1.

## Step 3: Commit the Version Bump

```bash
git add app.config.ts package.json fdroid/metadata/com.persoack.cablesnap.yml
git commit -m "release: vX.Y.Z"
```

If the pre-commit hook fails due to pre-existing lint errors in OTHER files,
use `--no-verify`. Never use `--no-verify` to skip lint errors in the files
being committed.

## Step 4: Push Commit

```bash
git push origin main
```

**Do NOT create tags via `git tag` + `git push`.** Repository rules block tag
creation via git push. Tags are created automatically by `gh release create`
in Step 7 via the GitHub API (which bypasses the restriction).

## Step 5: Update Store Screenshots

Generate fresh screenshots for F-Droid and README:

```bash
npm run screenshots
```

This captures all 5 tab screens at Pixel 4 and Fold 7 viewports, wraps them in device frames, and writes them to:
- `fdroid/metadata/com.persoack.cablesnap/en-US/phoneScreenshots/` (1-5.png for Pixel 4)
- `assets/store-screenshots/` (both devices, descriptive names)

Commit the updated screenshots if they changed:
```bash
git add fdroid/metadata/com.persoack.cablesnap/en-US/phoneScreenshots/ assets/store-screenshots/
git diff --cached --stat && git commit -m "chore: update store screenshots for vX.Y.Z"
git push origin main
```

## Step 6: Build APK Locally

Build the production APK on the local machine (Apple Silicon Mac) **before**
creating the GitHub release. GitHub releases are **immutable** — you cannot
upload assets to a release after creation.

```bash
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home \
ANDROID_HOME=/opt/homebrew/share/android-commandlinetools \
npm run build:apk:prod
```

This runs `eas build -p android --profile production --local` and outputs
`build-<timestamp>.apk` in the project root. Rename it before uploading:

```bash
cp build-*.apk cablesnap.apk
```

**Prerequisites:**
- **JDK 17** — `brew install openjdk@17` (JDK 25 is incompatible with Gradle 9.0 — causes `IBM_SEMERU` error)
- **Android SDK** — installed via `brew install android-commandlinetools`
- Both `JAVA_HOME` and `ANDROID_HOME` **must be set explicitly** for the EAS local build (it runs in a temp directory that doesn't inherit the SDK/JDK locations automatically)

**Timings:** ~15-20 min cold build (includes NDK, SDK platform, CMake downloads on first run), ~8 min warm.

**Common failures:**
- `JvmVendorSpec IBM_SEMERU` → wrong Java version, must use JDK 17
- `SDK location not found` → `ANDROID_HOME` not set or not passed to build command
- Timeout → build needs 20+ min; use `timeout 1800000` if running from agent

## Step 7: Create GitHub Release WITH APK

**CRITICAL:** The APK must be attached in the same `gh release create` command.
GitHub releases are immutable — `gh release upload` after creation returns
`HTTP 422: Cannot upload assets to an immutable release`.

```bash
gh release create vX.Y.Z cablesnap.apk \
  --title "vX.Y.Z" \
  --target main \
  --repo alankyshum/cablesnap \
  --notes "$(cat <<'NOTES'
## What's New

### Category 1
- Change description

### Category 2
- Change description

## Install

Add the F-Droid repo URL to your F-Droid client:
\`\`\`
https://alankyshum.github.io/cablesnap/repo
\`\`\`
NOTES
)"
```

This creates the tag via the GitHub API (bypassing repo tag-creation rules)
and attaches the APK atomically.

Verify the asset was attached:

```bash
gh release view vX.Y.Z --json assets --jq '.assets[].name'
```

Should show `cablesnap.apk`.

Release notes MUST include:
- Grouped changes by category (Features, Fixes, Performance, etc.)
- F-Droid install instructions at the bottom

To generate the change list, compare with the previous tag:

```bash
git log --oneline PREV_TAG..vX.Y.Z
```

## Step 8: F-Droid Repo Update (Automatic)

The F-Droid repo update is **automatically triggered** when the release is
published with an APK asset (via the `auto-fdroid.yml` workflow, which
triggers on `release: [published]`). No manual action needed.

**Manual fallback** (if auto-trigger doesn't fire):

```bash
gh workflow run fdroid-release.yml -f tag=vX.Y.Z
```

## Step 9: Verify F-Droid Repo

After the workflow completes (~5 min), verify the Pages deployment:

```bash
gh run list --workflow=fdroid-release.yml --limit 1
gh api repos/alankyshum/cablesnap/pages/builds --jq '.[0].status'
```

The F-Droid repo will be live at:
`https://alankyshum.github.io/cablesnap/repo`

## Post-Publish

Switch `gh` back to the default account if you switched:

```bash
gh auth switch --user kshum_LinkedIn
```

## Version History Reference

| Version | VersionCode | Tag    | Date       |
|---------|-------------|--------|------------|
| 0.1.0   | 1           | v0.1.0 | 2026-04-14 |
| 0.1.1   | 2           | v0.1.1 | 2026-04-15 |
| 0.10.0  | 16          | v0.10.0| 2026-04-18 |
| 0.15.2  | 25          | v0.15.2| 2026-04-19 |
| 0.23.1  | 5           | v0.23.1| 2026-04-21 |
| 0.26.1  | 51          | v0.26.1| 2026-04-22 |

Update this table after each release.

## Troubleshooting

### "Tag already exists"
The tag was likely created by a previous `gh release create`. Delete both:
```bash
gh release delete vX.Y.Z --yes --cleanup-tag
```
Then recreate with Step 7.

### GitHub releases are immutable
You **cannot** upload assets to a release after creation. If you forgot to
attach the APK, delete and recreate:
```bash
gh release delete vX.Y.Z --yes --cleanup-tag
# Rebuild APK if needed, then redo Step 7
```

### Tag push blocked by repo rules
Do NOT use `git tag` + `git push origin vX.Y.Z`. Repository rules block tag
creation via git push. Use `gh release create` which creates tags via the
GitHub API (bypasses the restriction).

### EAS project not configured
The EAS project ID must exist in `app.config.ts` under `extra.eas.projectId`.
If missing, run `eas init --force` locally and add the ID manually since
the config is dynamic (TypeScript). The project ID is:
`f15d9aef-342e-4a5d-9007-4f98eff3ba23`

### F-Droid client not showing update
- Pull-to-refresh in F-Droid
- Check repo URL is exactly: `https://alankyshum.github.io/cablesnap/repo`
- Verify Pages is deployed: `gh api repos/alankyshum/cablesnap/pages`

### Need to re-publish same version
Delete the release (which also cleans up the tag), fix the issue, then redo from Step 6:
```bash
gh release delete vX.Y.Z --yes --cleanup-tag
# Fix issue, rebuild APK, then redo from Step 6
```
