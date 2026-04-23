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
release if the fingerprint drifts. Never edit that file without rotating
the signing key deliberately.

**Local builds do not sign as release-quality.** `./gradlew assembleRelease`
on a dev machine will silently fall back to the debug keystore (see
`plugins/with-release-signing.js`). Only CI produces shippable APKs.

### One-time reinstall warning (historical)

The first release after BLD-485 merged (v0.26.3) required users to uninstall
and reinstall once because the signing certificate changed from the ephemeral
debug keystore to the persistent production keystore. Every release after
that updates cleanly in-place. The one-time banner file
(`fdroid/FIRST_SIGNED_RELEASE_NOTICE.md`) was removed in BLD-514 after the
transition completed. If you ever rotate the signing key again you will need
to recreate a similar banner — see the rotation section below.

### Rotating the signing key

Do **not** rotate casually. Android ties app identity to the signing cert,
so rotating forces every user to uninstall/reinstall again (losing data) or
forces a new `applicationId`.

> **Rotation is a breaking change.** `fdroid/release-cert.sha256` **MUST**
> be updated in the **same PR** that rotates the `ANDROID_KEYSTORE_*`
> GitHub Actions secrets — otherwise the next CI release will fail the
> `apksigner verify` fingerprint gate and no APK will ship. You must also
> either bump the Android `package` name (new F-Droid app entry) or accept
> another full uninstall/reinstall wave for every existing user.

If you truly must rotate: generate a new PKCS12 keystore (RSA 2048, SHA256,
≥ 25-year validity), update all four secrets, update
`fdroid/release-cert.sha256` **in the same PR**, recreate a one-time
uninstall banner (like the historical `fdroid/FIRST_SIGNED_RELEASE_NOTICE.md`
removed in BLD-514) and wire it into `.github/workflows/scheduled-release.yml`
release notes, and consider bumping the major version so the break is
explicit.

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

## Step 4: Create an Annotated Tag

```bash
git tag -a vX.Y.Z -m "vX.Y.Z: Brief description of changes"
```

The tag MUST:
- Start with `v` (triggers the GitHub Actions workflow)
- Match the version in all 3 files exactly
- Be annotated (`-a`), not lightweight

## Step 5: Push Commit and Tag

```bash
git push origin main
git push origin vX.Y.Z
```

## Step 6: Create GitHub Release

Use `gh release create` with structured release notes:

```bash
gh release create vX.Y.Z \
  --title "vX.Y.Z" \
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

Release notes MUST include:
- Grouped changes by category (Features, Fixes, Performance, etc.)
- F-Droid install instructions at the bottom

To generate the change list, compare with the previous tag:

```bash
git log --oneline PREV_TAG..vX.Y.Z
```

## Step 6.5: Update Store Screenshots

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
```

## Step 7: Verify GitHub Actions

```bash
gh run list --limit 3
```

The "Build APK & Update F-Droid Repo" workflow should be `in_progress` or `completed`.

If the workflow fails:

```bash
gh run view <RUN_ID> --log-failed
```

Common failure causes:
- `EXPO_TOKEN` secret expired -> regenerate at expo.dev
- `FDROID_KEYSTORE` or `FDROID_KEYSTORE_PASS` missing -> check repo secrets
- EAS build failure -> check build logs for dependency/compilation errors

## Step 8: Verify F-Droid Repo

After the workflow completes (~15 min), verify the Pages deployment:

```bash
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

Update this table after each release.

## Troubleshooting

### "Tag already exists"
```bash
git tag -d vX.Y.Z            # delete local
git push origin :refs/tags/vX.Y.Z  # delete remote
```
Then recreate the tag.

### GitHub Actions not triggering
Verify the tag was pushed: `git ls-remote --tags origin | grep vX.Y.Z`
Verify the workflow trigger: the `on: push: tags: - 'v*'` pattern must match.

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
Delete the release and tag, fix the issue, then redo steps 4-7:
```bash
gh release delete vX.Y.Z --yes
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
# Fix issue, commit, then redo from Step 4
```
