---
name: fdroid-submit-app
description: Create and validate a CableSnap F-Droid app submission MR to the official fdroiddata repository. Use when handling new-app metadata, recipe pre-flight, scanner cleanup, ABI splits, maintainer replies, or fork build verification.
---

# Goal

Prepare a new CableSnap app submission to the official F-Droid repository with maintainer-ready metadata, recipe checks, scanner handling, and evidence before opening the MR.

# F-Droid App Submission

Use this skill when preparing or reviewing a CableSnap MR against gitlab.com/fdroid/fdroiddata. The guidance below reflects the current submission workflow and MR !43886.

## PRE-FLIGHT (do BEFORE opening the MR)

### 1. Fastlane metadata — in the APP repo, NOT fdroiddata

Place under `fastlane/metadata/android/en-US/` in the **CableSnap repo**, NOT fdroiddata:

- `title.txt` ≤ 50 chars
- `short_description.txt` ≤ 80 chars
- `full_description.txt` ≤ 4000 chars
- `changelogs/<versionCode>.txt` ≤ 500 chars (filename = literal versionCode; current base example: `changelogs/162.txt`)
- `images/icon.png` 512×512
- `images/phoneScreenshots/N.png`
- **NEVER** put `Summary:`/`Description:` keys in fdroiddata recipe — fdroidserver reads Fastlane metadata directly from the app repo.

### 2. MR template and title

- Template: `.gitlab/merge_request_templates/App inclusion.md` (exact filename: space + lowercase `i`)
- Title: `New app: <name>` (exact format)

### 3. `commit:` must be a 40-char SHA

Never a tag, never a branch. Full 40-char commit hash only.

### 4. ABI split if APK is large

If APK is large, split by ABI — one Build entry per ABI:

```
vercodeOperation: 1000 * %c + N
```

ABI digit at LOWEST position; ABI order: `armeabi-v7a` < `arm64-v8a` < `x86` < `x86_64`.
Control via `enableSeparateBuildPerCPUArchitecture` + `reactNativeArchitectures` in app config — **NEVER** productFlavors.

### 5. AntiFeatures = MAP with `en-US` reason string

```yaml
AntiFeatures:
  NonFreeNet:
    en-US: "Optional Strava integration uses proprietary Strava API via a proxy"
```

NOT a bare list: `AntiFeatures: [NonFreeNet]` — that form is rejected.

### 6. Recipe template: `templates/build-react-native.yml`

Model on real recipes: `com.mmazzarolo.breathly`, `org.therapiefinder`, `com.focusbuddy.app`.

---

## THE #1 REJECTION CAUSE — scanignore

### NEVER use `scanignore: node_modules`

Zero upstream precedent. It hides the entire generated dependency tree from the scanner, which the maintainers reject.

### Correct pattern

Use `scandelete: node_modules` plus a **narrow** `scanignore` containing only benign build/toolchain files. The actual recipe has exactly five entries:

```yaml
scanignore:
  - node_modules/hermes-compiler/hermesc/linux64-bin/hermesc
  - node_modules/expo-modules-core/android/ExpoModulesCorePlugin.gradle
  - node_modules/@react-native-community/netinfo/android/build.gradle
  - node_modules/react-native-safe-area-context/android/build.gradle
  - node_modules/react-native-view-shot/android/build.gradle
```

- `scandelete` and `scanignore` both prefix-match.
- `scanignore` wins over `scandelete` for the same path.
- `removeproblem()` removes only flagged files.
- Non-free dependencies must be removed, never ignored.

Patterns that worked: delete the dependency in `init:` and use an app-source Metro alias stub (Sentry); prebuild `sed -i '/play-services-wearable/d'`; and `rm -f` generated web artifacts such as `canvaskit.wasm`.

fdroidserver order is `init:` → `prebuild:` → scan/scandelete → `build:`. Do not re-download binaries in `build:` after scandelete removed them (for example npm pack/install-skia), write fake stub packages into node_modules, or use unpinned network fetches in `build:`. Fallbacks belong in APP SOURCE behind an env-gated Metro resolver alias, then repin to a new tag.

## VERIFICATION DISCIPLINE

1. **ONLY** the fork's `fdroid build` job artifacts reflect the recipe: `/api/v4/projects/<fork_id>/jobs/<JOB_ID>/artifacts`. A GitHub Actions release APK NEVER runs the recipe.
2. `fdroid rewritemeta` diff MUST be empty. Run lint in a workspace containing fdroiddata's `config/*.yml`; a bare directory emits false positives on AntiFeatures/Categories.
3. HTTP 200 from the GitLab API is not proof. Always re-fetch and read back.
4. Never resolve a maintainer's note yourself. Reply in-thread and leave resolution to them; do not post duplicate replies or bloat the MR.
5. Budget `fdroid build` within its 3600s runner limit; heavy native source-compiles such as Skia blow it.

## IRREVERSIBLE DECISION NOTE

Reproducible Builds (`Binaries:` + `AllowedAPKSigningKeys:`) is **IRREVERSIBLE at merge**. Zero Expo/React Native recipes in fdroiddata have it. Do not enable it for this submission.

## VERIFICATION CHECKLIST

In the CableSnap repo, verify Fastlane files and byte limits, the literal versionCode changelog filename, 512×512 icon, and phone screenshots. In the fdroiddata fork, run:

```bash
fdroid readmeta com.persoack.cablesnap
fdroid lint -f com.persoack.cablesnap
fdroid rewritemeta com.persoack.cablesnap
git diff metadata/com.persoack.cablesnap.yml

# Recipe sanity checks
grep -n 'scanignore:' metadata/com.persoack.cablesnap.yml
grep -n 'scandelete:' metadata/com.persoack.cablesnap.yml
grep -n 'AntiFeatures:' -A5 metadata/com.persoack.cablesnap.yml
grep -n 'commit:' metadata/com.persoack.cablesnap.yml   # 40-char SHA?
grep -n 'VercodeOperation:' metadata/com.persoack.cablesnap.yml

# ABI split check (if APK large)
grep -A2 'VercodeOperation:' metadata/com.persoack.cablesnap.yml
```

The final recipe must have the map-form AntiFeatures, a 40-character `commit`, the narrow scanignore/scandelete arrangement, and ABI Build entries when the APK is large. Use the exact MR template path and title before opening the MR.

## DON'T

- Do NOT modify the recipe, the MR, or `fdroid-foss-build/SKILL.md` from this skill.
- Do NOT invent facts not listed above.
- Do NOT duplicate buildType, Gradle, or manifest details owned by `fdroid-foss-build`.

## References

- `fdroid-foss-build` — CableSnap's F-Droid build recipe internals; it owns Gradle/buildType/manifest details.
- `fdroid/official/SUBMISSION.md` — full submission evidence and defect log.
