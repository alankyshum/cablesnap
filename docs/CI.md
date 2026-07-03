# CI Configuration

## Playwright PR Gate (`scenario-gate-pr`)

### What it is

`scenario-gate-pr` is an **advisory** CI job in `.github/workflows/ux-audit.yml` that
runs the functional Playwright scenario suite (`e2e/scenarios/`) on every PR and push to
`main`. It runs `--project=mobile` only, with `SCENARIO_ASSERT_ONLY=1` to skip visual
pixel-diffs — keeping all crash guards and structural DOM assertions active.

**Phase**: Advisory (Phase 1 of BLD-2855). It reports pass/fail but is **not** a
required branch-protection check yet. Promotion to required happens after ≥50 consecutive
green PR runs with ≥98% pass rate (separate follow-up ticket).

### What it checks

All 14 specs in `e2e/scenarios/` run on the `mobile` (390×844) viewport:

| Guard type | Coverage |
|---|---|
| `pageerror` listeners | `completed-workout.spec.ts`, `completed-workout-prefix.spec.ts`, `nutrition-tab.spec.ts`, `progress-tab.spec.ts`, `session-pacing.spec.ts` |
| `react-crash-overlay` DOM-attach | Same specs as above |
| Structural `toBeAttached` / `toBeVisible` | All 14 specs |
| Visual pixel-diff (`toHaveScreenshot`) | **Skipped on PR** (cron `capture` job only) |

The only behavioral difference vs. the cron `capture` job is:

1. `adaptive-rest.spec.ts`: `toHaveScreenshot()` is gated behind
   `if (!process.env.SCENARIO_ASSERT_ONLY)` — DOM/chip-count assertions still run.
2. Single viewport (`mobile`) instead of the full 4-viewport matrix on `settings.spec.ts`.

### When does it go red?

The gate turns RED when:

- A `pageerror` fires on any scenario page (crash guard).
- A `[data-testid="react-crash-overlay"]` element is attached (React error boundary tripped).
- A structural `expect(locator).toBeAttached()` or `toBeVisible()` fails (DOM element
  removed or renamed).
- The bundle fails to export (`npx expo export -p web --dev --no-minify` exits non-zero).
- Any spec exceeds its per-test timeout and hits the overall 12-minute wall-time cap.

### Debugging a red run

1. **Click the failing check** in the PR status area → "Details" → GitHub Actions run log.
2. Look for the failing spec name in the Playwright output (e.g. `nutrition-tab.spec.ts › captures nutrition top`).
3. If the run uploaded a `scenario-gate-pr-report-<run_id>` artifact (only on failure), download it:
   ```bash
   gh run download <run_id> --name scenario-gate-pr-report-<run_id> -R alankyshum/cablesnap
   # Open playwright-report/index.html in a browser for full trace + DOM snapshot
   ```
4. Common causes:
   - **Crash guard**: check for a recent change to the failing route (e.g. `/nutrition`, `/progress`).
   - **DOM structural**: a `data-testid` was renamed or removed; grep for it and restore or update the spec.
   - **Bundle timeout**: check `npx expo export` output for a new error or missing dependency.

### Updating baselines

Visual baselines are only used in the **cron** `capture` job — not in this PR gate.
To update them, trigger a manual `workflow_dispatch` on the `UX Audit (Daily Visual Capture)`
workflow or wait for the next scheduled cron run. See `e2e-update-snapshots.yml` for a
dedicated baseline-update workflow.

### Adding new scenario specs

New specs in `e2e/scenarios/` are automatically picked up by the glob
`'e2e/scenarios/[^_]*.spec.ts'` in both the cron `capture` job and this PR gate.

If your new spec uses `toHaveScreenshot()`, wrap it in:

```typescript
if (!process.env.SCENARIO_ASSERT_ONLY) {
  await expect(element).toHaveScreenshot('name.png', { ... });
}
```

This prevents the PR gate from requiring a baseline that doesn't exist yet on CI.

### Phase 1 → Phase 2 promotion criteria

Tracked in a separate follow-up ticket. Requirements:

- ≥50 consecutive `scenario-gate-pr` runs observed.
- ≥98% pass rate (≤1 flake in 50 with documented root cause).
- Wall-time p90 < 8 minutes.

Refs: BLD-2855 (plan), BLD-2861 (this implementation), BLD-2859 (QD conditions).
