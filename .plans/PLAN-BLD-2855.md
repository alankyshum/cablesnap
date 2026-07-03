# PLAN-BLD-2855 — Run Playwright scenario crash/assertion suite as a PR gate (assert-only)

- **Type**: PLAN-only (no code changes in this ticket; implementation split into follow-up)
- **Author**: techlead
- **Status**: draft — awaiting Behavior-Design + Quality Director + CEO review
- **Scope**: pure dev-infra / CI. No user-facing behavior change.

## TL;DR (recommendation)

**GO — with the "assert-only PR gate" shape** below. Cron-only exposure of the crash-guard / structural suite is measurably wrong for a "ship with confidence" goal, and the marginal CI cost is modest (~7 min wall-time, ~1 CI-minute cost per PR at current volume) if we do this right. Empirically, the crash/structural portion of the suite has a **0 % failure rate over the last 27 completed cron runs** — the single failure came from the one visual-diff spec, which is trivially isolable and has already been mitigated on `main` (`maxDiffPixelRatio: 0.12`, 223db843).

The plan uses phased rollout — advisory → required — so we can measure real PR-flake rate before flipping the branch-protection lever.

---

## 1. Problem statement

`e2e/scenarios/*.spec.ts` (14 specs) contains real functional coverage: 161 `expect()` assertions, `pageerror` listeners on 5 specs, and `react-crash-overlay` DOM-attach guards. This suite is the only automated tripwire for a class of screen-level crash that has actually shipped to `main` in the past (BLD-2074, BLD-2078 — Progress-tab crash on Z Fold6 viewport; BLD-1819 — Nutrition-tab pageerror).

`.github/workflows/ux-audit.yml:61` gates the `capture` job on `github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'`, so **on every PR only `vocab-audit` runs** (a 2-minute textual grep). A crash regression can merge to `main` and remain latent for up to ~24 h until the 09:00 UTC cron trips.

For a company goal of "ship with confidence" this is inverted: the most expensive-to-diagnose class of regression (screen crash) is on the slowest feedback loop.

## 2. Non-goals (explicit out-of-scope)

- **Visual diff on PRs.** `adaptive-rest.spec.ts:245` is the only `toHaveScreenshot()` in the suite; that stays on cron (see §5.1). Approving PR-time pixel-diff is a separate ticket if we ever want it.
- **CVD emulated captures on PRs.** Deuteranopia/protanopia/tritanopia captures are a diagnostic artifact for the ux-designer agent, not a gate. Stay on cron.
- **Snapshot-artifact upload on PRs.** No `.pixelslop/screenshots/` upload from the PR job — PRs need pass/fail signal, not diagnostic bundles. Cron keeps producing artifacts.
- **Store-specific viewport matrix on PRs.** Skip `store-pixel9`, `store-fold7`, `mobile-narrow`, `mobile-large`, `tablet`, `desktop` on PR runs. `mobile` (390×844) covers the crash-guard and structural assertions; the Z Fold6 crash class (BLD-2074) is a data class we already caught by the cron and can keep catching there.
- **Android emulator E2E** (`e2e-android-emulator.yml`) — separate suite, separate ticket.
- **Baseline snapshot updates** (`e2e-update-snapshots.yml`) — unchanged.
- **Increasing branch-protection required-check set from day 1.** We start advisory (non-blocking) and promote after ≥50 consecutive green PR runs.

## 3. Empirical baseline (measured, not estimated)

Sampled the last 30 scheduled `ux-audit` cron runs (2026-06-04 → 2026-07-03):

| Metric | Value |
|---|---|
| Total scheduled runs | 30 |
| Success | 26 |
| Failure | 1 (2026-07-02, only failure in 30 days) |
| Cancelled (concurrency skip) | 3 |
| **Real failure rate (excluding cancels)** | **1 / 27 = 3.7 %** |
| Wall-time p50 (success) | **5.7 min** (344 s) |
| Wall-time p90 (success) | **6.6 min** (398 s) |
| Wall-time max (success) | **8.4 min** (507 s) |
| Wall-time min (success) | 4.4 min (262 s) |

**The one failure (run 28581885722, 2026-07-02)** was in `adaptive-rest.spec.ts:245` — the only `toHaveScreenshot()` in the entire suite. 1585 pixels (0.08 ratio) differed vs. baseline; the fix (commit 223db843, same day 04:43 PDT) raised `maxDiffPixelRatio` from an absolute `maxDiffPixels: 40` to a ratio-based `0.12`, well above the observed 7–9 % antialiasing floor on hosted runners. No non-visual spec has failed in the sample window.

**Extrapolation**: if we exclude the visual-diff spec (which we do — see §5.1), the crash-guard / DOM-assertion subset of the suite has an observed failure rate of **0 / 27 = 0 %** over the sample. That's the population that would run on PRs.

**Confidence caveat**: cron runs the full 4-viewport matrix on `settings.spec.ts` plus mobile on the rest — that's 44 tests per cron. Our PR run is `mobile`-only + assert-only, i.e. a strict subset. We have some room for regime-shift (e.g. a new spec added later that flakes) but we have monitoring in place (§7) to detect it.

## 4. Cost analysis

### Wall-time budget

- Current cron suite runs 44 tests in 4.4–8.4 min on `ubuntu-latest`, `workers: 1`.
- PR-time "mobile-only, assert-only" scope: **~14–20 tests** (drop the 4-viewport settings step; drop the visual-diff spec's 6 states → keep only its DOM assertions; keep 12 mobile-viewport specs).
- Projected wall-time: **4–6 min** (subset of the current p50). Safety-cap `timeout-minutes: 12`.

### CI-minute cost

- GitHub Actions ubuntu-latest minutes: 1× multiplier (unlike macOS/Windows).
- Measured PR volume on `alankyshum/cablesnap`: **32 PRs opened / 24h**, **104 / 7d**, **135 / 30d** (from `gh pr list --state all`). Assume ~2–3 pushes per PR = ~70–100 workflow runs / day.
- **Marginal cost of adding the gate**: ~90 runs/day × 6 min p50 = **~540 CI-minutes / day** ≈ 16 200 min/month.
- Billing: `alankyshum/cablesnap` is a **public repo** (`{"private": false, "visibility": "public"}` per `gh api /repos/alankyshum/cablesnap`) → **GitHub Actions minutes on public repos are unlimited and free**. So the true cost is calendar wait-time, not $.
- With `concurrency: cancel-in-progress: true` (already set on ux-audit.yml), rapid re-pushes on the same PR don't stack, further reducing effective runs.

### PR-latency cost

- PR "green" today: bundle-gate (~5 min p50) is the critical-path check. Adding the scenario gate makes the critical path `max(bundle-gate, scenario-gate) ≈ max(5, 6) = 6 min`. Increase in PR turnaround: **~1 min p50**. Acceptable for the confidence win.

### Flakiness cost

- Retries already at `retries: 2` (playwright.config.ts:8). A single flake burns 3× the time of that spec, not the whole suite.
- With 0 % observed failure rate on the assert-only subset, expected extra CI cost from retries is negligible.

## 5. Proposed shape

### 5.1 Assert-only mode

Introduce a new Playwright test tag `@no-visual` (or negation — see below) and a PR-only spec runner that skips the `toHaveScreenshot()` assertion.

**Two acceptable implementations** — pick during implementation:

**Option A (preferred)** — spec-level env gate. In `adaptive-rest.spec.ts`, wrap the `toHaveScreenshot` call in `if (!process.env.SCENARIO_ASSERT_ONLY)`. The DOM assertions (`toHaveCount`, `toBeVisible`) still run; only the pixel-diff is skipped.

**Option B** — Playwright `--grep-invert '@visual'` on the PR run. Add `test.describe('@visual @scenario adaptive-rest', ...)` and filter it out on PRs. Cleaner test taxonomy but requires one small refactor across the specs.

Both preserve full-suite behavior on cron (default env unset / no grep filter).

### 5.2 Workflow change

Two structural options. **Recommendation: Option A (new job in ux-audit.yml).**

**Option A — one file, one gate name** (recommended)

In `ux-audit.yml`, add a new job `scenario-gate-pr`:

```yaml
scenario-gate-pr:
  name: Playwright scenario gate (mobile, assert-only)
  # Trigger on PR + push-to-main. Keep the heavy `capture` job cron-only.
  if: github.event_name == 'pull_request' || github.event_name == 'push'
  runs-on: ubuntu-latest
  timeout-minutes: 12
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version-file: .nvmrc, cache: 'npm' }
    - run: npm ci --legacy-peer-deps
    - run: npx playwright install --with-deps chromium
    - run: npx expo export -p web --dev --no-minify
    - name: Run scenario assertions (mobile only, no visual diff)
      env:
        CI: 'true'
        E2E_USE_STATIC: '1'
        SCENARIO_ASSERT_ONLY: '1'   # Option 5.1-A: spec self-gates toHaveScreenshot
      run: |
        npx playwright test \
          'e2e/scenarios/[^_]*.spec.ts' \
          --project=mobile
    - name: Upload Playwright report on failure
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: scenario-gate-pr-report-${{ github.run_id }}
        path: playwright-report
        retention-days: 7
```

Keep the existing `capture` job unchanged (cron / dispatch only, full matrix, full visual capture). The two jobs live in the same file because they share `webServer` config, but they are independent GitHub check contexts, so cron flakiness does NOT block PRs and PR flakiness does NOT block the daily audit artifact.

**Option B — separate workflow file `.github/workflows/scenario-gate.yml`.** Cleaner naming, cleaner cache paths, cleaner concurrency group. Costs: one more workflow file to maintain; one more `npm ci` per PR (though Actions caching amortizes). I don't prefer this — the two jobs share too much setup.

### 5.3 Required-check strategy (branch protection)

Current `main` branch protection requires only:
- `Verify scenario hook not in production bundle` (bundle-gate.yml)
- `Backup XML validation` (ci.yml)

**Phased promotion path:**

1. **Phase 1 — advisory (Week 1)**. Land the new `scenario-gate-pr` job. Do **not** add it to required checks. Every PR reports pass/fail but merges are not blocked by it. Watch for real-world flake rate over ~50 PRs / ~1 week.
2. **Phase 2 — required-if-touched (Week 2, conditional).** If Phase 1 shows ≥98 % green rate, add the check to `main` branch protection as required. Consider `paths` filter to skip it on doc-only PRs (see §5.4).
3. **Phase 3 — expand (only after Phase 2 stable)**. Optionally add a second viewport (e.g. `store-fold7`) to the PR run to catch the Z Fold6 class of regression at PR time not just cron time. Separate ticket.

**Rollback trigger**: if PR flake rate exceeds 5 % during Phase 1, we do NOT promote to required. Fix the flakes first (separate ticket) OR remove the offending spec from the PR gate.

### 5.4 Path-filter optimization (Phase 2 refinement)

Consider adding a `paths:` filter to the PR trigger so pure-doc / pure-fixture PRs skip the gate:

```yaml
on:
  pull_request:
    paths-ignore:
      - '**.md'
      - 'CHANGELOG.md'
      - '.plans/**'
      - '.learnings/**'
      - '.audits/**'
      - 'fdroid/**'
```

**⚠️ Trap**: if the check becomes required in branch protection AND we filter by paths, doc-only PRs will show mergeStateStatus BLOCKED because the required check never reports (BLD-525 bit us before with bundle-gate). Bundle-gate solved this by NOT using `paths:` on the PR trigger — it runs everywhere and short-circuits in-script. **Prefer the same pattern for scenario-gate**: run on every PR (cost is low anyway); short-circuit inside the workflow (or don't bother — the whole run is 6 min).

### 5.5 Concurrency and cancellation

Add:

```yaml
concurrency:
  group: scenario-gate-pr-${{ github.ref }}
  cancel-in-progress: true
```

Same pattern as bundle-gate.yml and ci.yml. Rapid re-pushes on a PR won't stack.

## 6. Risks & mitigations

| Risk | Likelihood | Blast radius | Mitigation |
|---|---|---|---|
| Higher-than-measured PR flake rate | Medium (30-day sample is small) | Blocks PRs | Phased rollout §5.3; advisory-first |
| Font-antialiasing drift returns via a new visual spec added later | Medium | Blocks PRs | 5.1 gates ALL `toHaveScreenshot` behind env; new specs inherit the gate |
| CI-minute overrun on public repo bill | Very low | $0 (public repo unlimited) | N/A |
| Test-seed hook regression breaks all scenarios (BLD-494 class) | Low | All PRs blocked | Bundle-gate already required, catches this earlier |
| `expo export --dev` bundle regressions cause cold-start > timeout | Low | PR blocked | `timeout-minutes: 12` gives 2× headroom over p90; existing pattern in ux-audit.yml |
| A new spec (BLD-2357 pattern) with heavy setup pushes suite past 12 min | Medium | PR gate false-fails | Watch p90 monthly; raise timeout or split job if p90 crosses 8 min |
| Existing cron surfaces regression we now surface on PR too — duplicate noise | Low | Ops noise | Cron is diagnostic; PR is gate. Different signals, different responders |
| Required-check flip surprises humans mid-PR | Low | Confused authors | Phase 2 promotion announced via CHANGELOG + comment on active PRs |
| Adaptive-rest visual spec regresses on cron only (blind spot when we exclude from PR) | Medium | Undetected visual drift up to 24 h | This is the SAME status quo we have today for the full suite; no regression |

## 7. Monitoring & success criteria

**Acceptance criteria for the follow-up implementation ticket**:

- **AC1**: `scenario-gate-pr` job present in `ux-audit.yml`, running on `pull_request` and `push` to `main`.
- **AC2**: PR runs execute all `e2e/scenarios/*.spec.ts` at `--project=mobile` with `SCENARIO_ASSERT_ONLY=1` (or `--grep-invert '@visual'`) and complete in < 12 min wall-time.
- **AC3**: On a synthetic red build (deliberately-introduced `throw new Error()` in `app/nutrition/index.tsx`), the PR gate turns red on the `nutrition-tab.spec.ts` pageerror crash guard. Verified once during implementation via manual PR.
- **AC4**: Cron `capture` job unchanged: still produces full-matrix + CVD screenshots on 09:00 UTC schedule.
- **AC5**: `main` branch protection unchanged in the implementation ticket (Phase 1 = advisory). Separate follow-up ticket to promote to required after Phase 1 metrics.

**Phase 1 → Phase 2 promotion criteria** (separate ticket, not this implementation):

- ≥50 consecutive `scenario-gate-pr` runs.
- ≥98 % pass rate on that window (i.e. ≤1 flake in 50).
- All flakes have documented root causes (not "unknown").
- Wall-time p90 stays under 8 min.

**Monitoring dashboard** (implementation ticket adds):

- Weekly cron job that posts a comment to a tracking issue with: run count, pass rate, p50/p90 wall-time, list of top-3 failing specs. Simple `gh run list --workflow ux-audit.yml --event pull_request --limit 100 --json ...` piped through jq.

## 8. Implementation ticket (draft — for follow-up creation)

**Title**: `IMPLEMENT: PR-time scenario-gate job (advisory) — BLD-2855 follow-up`

**Assignee**: claudecoder

**Scope** (files touched, all in `run/claudecoder-BLD-<new>` worktree):

1. `.github/workflows/ux-audit.yml` — add `scenario-gate-pr` job per §5.2 Option A. **~40 lines added, 0 removed.**
2. `e2e/scenarios/adaptive-rest.spec.ts` — wrap the `toHaveScreenshot()` block in `if (!process.env.SCENARIO_ASSERT_ONLY)`. Keep the DOM assertions unconditional. **~4 lines added, 0 removed.**
3. `docs/CI.md` (create if absent, else append) — one section: "Playwright PR gate — how it works, how to debug a red run, how to update baselines". **~30 lines.**
4. Manual verification steps in the PR description: create a synthetic `throw` in a nutrition component, push, screenshot the red check, revert.

**Estimated LOC**: ~75 lines added, 0 removed. Single-file diff for the actual gate logic; small env-gate in one spec. Under the 300-LOC-per-commit ceiling.

**Estimated wall-time**: 1 heartbeat for claudecoder if the plan is followed verbatim.

**Out of scope for the implementation ticket** (defer to Phase 2 follow-up):

- Adding to branch-protection required checks.
- Path-filter refinement.
- Second viewport on PR gate.
- Weekly monitoring dashboard automation (start with manual review).

## 9. Alternatives considered (and rejected)

**Alt 1: "Turn off `if:` gate on the capture job — run everything on every PR"**. Rejected. That runs the full 4-viewport matrix + CVD + settings + adaptive-rest visual = 25-min timeout with real flake risk. Overkill for the PR feedback loop and would blast the flaky visual spec into every PR.

**Alt 2: "Move the assert-only run into `ci.yml` alongside typecheck/lint/jest"**. Rejected. `ci.yml` already has 4 jobs and runs on every PR; adding Playwright there mixes fast/slow concerns and makes the CI file harder to reason about. `ux-audit.yml` is the correct home — it already owns Playwright infra.

**Alt 3: "Do nothing; increase cron cadence to hourly"**. Rejected. Hourly cron would still catch regressions after merge, not before, and would burn 24× the CI minutes of PR-gating. The whole point of a PR gate is preventing merge, not detecting after.

**Alt 4: "Sample-mode — only run scenario gate on 25 % of PRs at random"**. Rejected. Non-deterministic gates are a debugging nightmare, and CI cost isn't the bottleneck (public repo, unlimited minutes).

**Alt 5: "Only crash-guard specs (nutrition-tab, progress-tab, session-pacing, completed-workout*), not structural"**. Considered but rejected. The 14 specs total ~161 assertions, and the DOM-attach assertions (e.g. `nutrition-scroll-view` present) are cheap and catch a real IA-drift class. Full assert-only is worth the extra ~2 min.

## 10. Review checklist state (for tracking)

- [x] **Behavior-Design Classification**: NO — pure dev-infra, no user-facing behavior change. See §2 non-goals. (Techlead classifies; product-manager can override.)
- [x] **Tech Lead technical feasibility**: this document.
- [ ] **Quality Director review**: does this improve the QA gate meaningfully; interaction with existing gates.
- [ ] **CEO final decision** to authorize the follow-up implementation ticket.

## 11. Open questions for reviewers

1. **@quality-director**: any prior BLD ticket where a scenario-suite crash-guard regression escaped to `main` and cost you a batch revert? If so, cite it here for the "impact" case. If not, is 30 days of clean data enough for you to sign off Phase 1?
2. **@quality-director**: are you OK with `mobile`-only viewport on the PR gate, given the Z Fold6 crash-class (BLD-2074) history? Or should Phase 1 include `store-fold7` from day 1?
3. **@ceo**: OK to spin up the implementation ticket as `high` priority + claudecoder? Or would you rather claudecoder wait until BLD-2853 (in-progress pre-push tsc gate) lands first to avoid CI-config merge conflicts?

## Appendix A — Cron run data

Sample: `gh run list --repo alankyshum/cablesnap --workflow ux-audit.yml --event schedule --limit 30`

Successful run wall-times (26 samples, ordered ascending, seconds):

```
262, 293, 297, 304, 315, 316, 322, 324, 327, 331,
332, 344, 344, 350, 350, 354, 351, 351, 366, 366,
366, 385, 389, 398, 434, 507
```

- min: 262 s (4.4 min) — 2026-06-15
- p50: 344 s (5.7 min) — 2026-06-08
- p90: 398 s (6.6 min) — 2026-06-30
- max: 507 s (8.4 min) — 2026-07-03

Single failure: 2026-07-02, run 28581885722, `adaptive-rest.spec.ts:245` `toHaveScreenshot` (1585px diff, 0.08 ratio) — mitigated on `main` by commit 223db843 same day. Not a real regression.

## Appendix B — Spec breakdown

| Spec | LOC | Uses `toHaveScreenshot` | Uses `pageerror`/crash-overlay | Viewport gates |
|---|---|---|---|---|
| `adaptive-rest.spec.ts` | 256 | **YES** (line 245) | no | mobile-narrow / mobile / mobile-large |
| `advanced-sets.spec.ts` | 607 | no | no | mobile (per test.skip filters) |
| `completed-workout.spec.ts` | 182 | no | **YES** | mobile |
| `completed-workout-prefix.spec.ts` | 146 | no | **YES** | mobile |
| `form-clip-compare.spec.ts` | 225 | no | no | mobile |
| `form-clips.spec.ts` | 112 | no | no | mobile |
| `nutrition-tab.spec.ts` | 218 | no | **YES** (multiple) | mobile / mobile-narrow / store-pixel9 / store-fold7 |
| `progress-tab.spec.ts` | 408 | no | **YES** (multiple) | mobile / mobile-narrow / store-pixel9 / store-fold7 |
| `rest-coach.spec.ts` | 129 | no | no | mobile |
| `session-pacing.spec.ts` | 303 | no | **YES** | mobile |
| `settings.spec.ts` | 190 | no | no | 4 viewports (cron) / mobile (PR — via env in impl ticket, TBD) |
| `stack-marker.spec.ts` | 112 | no | no | mobile |
| `workout-history.spec.ts` | 69 | no | no | mobile |

For the PR gate (mobile-only, assert-only), the only spec with any change in behavior vs. cron is `adaptive-rest.spec.ts` (drop `toHaveScreenshot`). Everything else runs the same code path, filtered by `--project=mobile`.
