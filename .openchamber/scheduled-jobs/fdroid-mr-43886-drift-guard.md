# F-Droid MR !43886 drift guard

Runs twice daily at 09:00 and 21:00 America/Los_Angeles. Poll fdroiddata MR !43886 and keep its CableSnap recipe pinned to the newest app release until the MR merges.

Run autonomously. Do not ask questions. Do not stop early. On any failure, report the failure and any completed verification in the final output. Never print credentials or tokens.

## Inputs and fixed context

- App repository: `/Users/alanshum/Documents/cablesnap`, branch `main`. App CI automatically cuts a release approximately every 12 hours via `gh workflow run scheduled-release.yml`; never create tags manually.
- GitLab PAT: 1Password item UUID `wjtofgmlirhvq6dzhlcv7brz2q`. Load and follow the `tool--1password` skill. Retrieve it without printing it and pass it only as the `PRIVATE-TOKEN` environment variable.
- Upstream GitLab project: `36528` (`fdroid/fdroiddata`), MR IID `43886`.
- Fork GitLab project: `84814417`, branch `com.persoack.cablesnap`.
- Local fork checkout: `/tmp/fdroiddata-mr`; clone/re-clone it if missing, and ensure the work is on the fork branch.
- Skills required for this run: load `fdroid-submit-app` and `fdroid-foss-build` before doing F-Droid work.
- Current recipe pin: v0.26.94, commit `81c6c2aa2a71d90789ad9a8b863323af6421e449`, versionCodes 162001–162004, `CurrentVersionCode: 162004`. The four per-entry sed match patterns currently match base `versionCode 162`.
- Last reviewed maintainer note: `3624611922`.

## Step 1 — Check MR state and maintainer notes

Using the GitLab API and the PAT, read MR !43886 state first. If the state is `merged` or `closed`, stop immediately and do nothing else; report that the job can be deleted.

Otherwise retrieve notes/comments newer than note `3624611922`. Report every human, non-system maintainer comment verbatim. Do not resolve, edit, or otherwise change maintainer notes. Do not edit the MR description and do not merge the MR.

## Step 2 — Detect release drift

In `/Users/alanshum/Documents/cablesnap` on `main`, run `git fetch origin --tags`. Find the newest `v0.26.*` tag and ignore every `audit-*` tag. Compare it with the recipe pin in the MR/fork. If there is no newer tag, report exactly `no action needed` and exit without touching anything.

Do not create tags manually. Treat HTTP 200 responses as insufficient proof: always re-fetch and read back the relevant state after any API or Git operation.

## Step 3 — Repin the recipe when drift exists

Only when the newest `v0.26.*` tag is newer than the recipe pin, resolve its full 40-character commit hash and update all four Build entries in the recipe:

1. each `versionName`;
2. each `commit` with the full 40-character hash;
3. each `versionCode` to the four new per-entry version codes;
4. `CurrentVersion`;
5. `CurrentVersionCode`; and
6. all four sed MATCH patterns, changing their base `versionCode 162` match to the new base versionCode.

Preserve the existing recipe structure and only change the required pin/version fields. Then run `fdroid rewritemeta` and require an empty diff. Run `fdroid lint`. If either check fails, do not commit or push; report the failure and leave the working tree for diagnosis.

If checks pass, commit the recipe change and push it to fork project `84814417`, branch `com.persoack.cablesnap`. Never push to upstream and never merge. Re-fetch/read back the pushed branch and wait for the resulting pipeline, recording its status and job IDs.

## Step 4 — Verify only from fork build artifacts

Verify a repin only through the fork's `fdroid build` job artifacts, using the GitLab API endpoint `/api/v4/projects/84814417/jobs/<JOB_ID>/artifacts`. A GitHub release APK is never evidence that the recipe runs.

Download/read back the artifacts for the relevant fork `fdroid build` job and inspect all four APKs. Require:

- banned-prefix scan is empty for `com/google/firebase|com/google/mlkit|com/google/android/gms|com/android/installreferrer`;
- ZXing is present;
- no `libsentry*.so`;
- no `io/sentry`;
- no `librnskia.so`.

Re-fetch and read back the pipeline/job/artifact responses; HTTP 200 alone is not proof. Report the exact job ID, artifact endpoint, APK names, and each verification result. If the required artifacts are unavailable or any check fails, report that verification failed; do not claim success.

## Step 5 — Deliver the run report

Report the MR state, any qualifying maintainer comments verbatim, the observed newest tag and recipe pin, whether drift was found, all commands/checks performed, push/pipeline status, and artifact verification. If nothing changed and there was no drift, report `no action needed` and confirm that nothing was touched. If the MR was merged/closed, report that the job can be deleted.

## Cost / safety guards

- Never print or include the GitLab PAT in output, logs, command arguments, diffs, or commit messages.
- Never resolve maintainer notes, merge the MR, edit the MR description, create tags, or push upstream.
- Do not commit or push if `fdroid rewritemeta` produces a non-empty diff or `fdroid lint` fails.
- Cap API fetches at 30 per run and avoid polling more often than necessary; wait only for the relevant pipeline with bounded polling.
- If a single APK cannot be inspected, report verification incomplete rather than treating the repin as verified.
