# e2e — visual UX audit & Playwright specs

This folder hosts:

- **`*.spec.ts`** — Playwright visual-regression specs (snapshots in `__screenshots__/`).
- **`scenarios/*.spec.ts`** — semantic UX-audit captures consumed by the
  ux-designer agent. v1 is mobile-only.
- **`helpers.ts`** — shared fixtures (skip-onboarding, scenario seeding, …).
- **`generate-manifest.ts`** — Playwright `globalTeardown` that aggregates
  scenario metadata.

## Running locally

```bash
npx expo export -p web --dev --no-minify
E2E_USE_STATIC=1 npx playwright test e2e/scenarios --project=mobile
```

Screenshots land in `.pixelslop/screenshots/scenarios/<scenario>/<viewport>.png`,
each accompanied by `<viewport>.json` metadata (scenario, label, route,
viewport, commit SHA, captured-at timestamp).

## Daily UX audit (BLD-481 / BLD-645)

The agent runtime container can't run Chromium (missing system libs, no
`sudo`), so the daily capture runs in **GitHub Actions** instead. See
[`.github/workflows/ux-audit.yml`](../.github/workflows/ux-audit.yml).

### Trigger

- **Cron**: 09:00 UTC daily.
- **Manual**: `gh workflow run ux-audit.yml` (or via the Actions UI). Useful
  for the ux-designer heartbeat to invoke on demand.

### Fetching the artifact

```bash
# List recent runs
gh run list --workflow=ux-audit.yml --limit 5

# Pin to a specific run, then download into a local folder
RUN_ID=$(gh run list --workflow=ux-audit.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run download "$RUN_ID" -n "ux-audit-$RUN_ID" -D ./ux-audit-bundle
```

The bundle layout mirrors `.pixelslop/screenshots/scenarios/`:

```
ux-audit-bundle/
  completed-workout/
    mobile.png
    mobile.json
  workout-history/
    mobile.png
    mobile.json
```

If a run captured zero screenshots, the bundle contains a single
`_empty-bundle.json` marker (commit SHA, run id, timestamp) — surface this
in the audit comment instead of silently passing.

### Metadata schema

Each `<viewport>.json` is the contract between the spec and the audit agent:

| Field | Meaning |
|-------|---------|
| `scenario` | Scenario id (matches folder name). |
| `label` | Human-readable description of the captured screen. |
| `route` | Expo Router path that was visited. |
| `viewport` | Playwright project name (currently always `mobile`). |
| `viewportSize` | `{ width, height }` in CSS pixels. |
| `commitSha` | `GITHUB_SHA` at capture time (CEO uses this to backtrack). |
| `capturedAt` | ISO-8601 UTC timestamp. |

The ux-designer agent attaches the PNG + metadata to any new visual-defect
issue it files so CEO can reproduce against the exact commit and route.

### Failure modes

- **Spec fails mid-run** — workflow status = failed, but the artifact upload
  step uses `if: always()` so any partial captures still upload.
- **Zero screenshots produced** — `_empty-bundle.json` marker is written
  before upload; workflow logs a `::warning::`.
- **Playwright HTML report** — uploaded as `ux-audit-playwright-report-<run>`
  on failure for triage.
