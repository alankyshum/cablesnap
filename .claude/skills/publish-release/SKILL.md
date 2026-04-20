---
name: publish-release
description: >-
  Publish a new FitForge release with consistent version numbers across
  package.json, app.config.ts, F-Droid metadata, GitHub tag, GitHub Release,
  and F-Droid repo. Use when asked to publish, release, bump version, or
  ship a new version of the app.
---

# Publish a New FitForge Release

Deterministic, repeatable steps to publish a new version of FitForge.
Every version bump touches exactly 3 files + 1 tag + 1 GitHub Release,
then GitHub Actions builds the APK and deploys to the F-Droid repo.

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

### File 3: `fdroid/metadata/com.anomalyco.fitforge.yml`
```yaml
CurrentVersion: X.Y.Z
CurrentVersionCode: N
```

`CurrentVersionCode` is an integer that MUST increment by 1 on every release.
To find the current value:

```bash
grep 'CurrentVersionCode' fdroid/metadata/com.anomalyco.fitforge.yml
```

Increment it by 1.

### Validation

After bumping, verify consistency:

```bash
grep '"version"' package.json
grep 'version:' app.config.ts
grep 'CurrentVersion' fdroid/metadata/com.anomalyco.fitforge.yml
```

All three version strings must match. `CurrentVersionCode` must be previous + 1.

## Step 3: Commit the Version Bump

```bash
git add app.config.ts package.json fdroid/metadata/com.anomalyco.fitforge.yml
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
https://alankyshum.github.io/fitforge/repo
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

## Step 7: Build APK Locally

Build the production APK on the local machine (Apple Silicon — fast with warm Gradle cache):

```bash
npm run build:apk:prod
```

This runs `eas build -p android --profile production --local` and outputs `fitforge.apk` in the project root.

**Prerequisites:**
- Java 17 installed (`java -version`)
- Android SDK installed (via Android Studio or standalone)
- `ANDROID_HOME` set

The build takes ~5 min with warm cache, ~15 min cold.

## Step 8: Upload APK to GitHub Release

```bash
gh release upload vX.Y.Z fitforge.apk --clobber
```

Verify the asset was attached:

```bash
gh release view vX.Y.Z --json assets --jq '.assets[].name'
```

Should show `fitforge.apk`.

## Step 9: Trigger F-Droid Repo Update

```bash
gh workflow run fdroid-release.yml -f tag=vX.Y.Z
```

This downloads the APK from the GitHub Release, signs it for F-Droid, and deploys to GitHub Pages.

## Step 10: Verify F-Droid Repo

After the workflow completes (~5 min), verify the Pages deployment:

```bash
gh run list --workflow=fdroid-release.yml --limit 1
gh api repos/alankyshum/fitforge/pages/builds --jq '.[0].status'
```

The F-Droid repo will be live at:
`https://alankyshum.github.io/fitforge/repo`

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
- Check repo URL is exactly: `https://alankyshum.github.io/fitforge/repo`
- Verify Pages is deployed: `gh api repos/alankyshum/fitforge/pages`

### Need to re-publish same version
Delete the release and tag, fix the issue, then redo steps 4-7:
```bash
gh release delete vX.Y.Z --yes
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
# Fix issue, commit, then redo from Step 4
```
