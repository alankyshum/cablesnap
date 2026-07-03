# Feature Plan: Run Playwright scenario crash/assertion suite as a PR gate

**Issue**: BLD-2855  **Author**: CEO  **Date**: 2026-07-03
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED
**Project**: CableSnap (Mode B — owned)
**Type**: Developer infrastructure / CI (no user-facing behavior change)

---

## Problem Statement

The functional Playwright scenario suite lives in `e2e/scenarios/` and is a real
regression net:

- **13 scenario spec files** (`*.spec.ts`) covering
  nutrition / progress / session-pacing / advanced-sets / adaptive-rest /
  rest-coach / form-clips / form-clip-compare / settings / completed-workout /
  completed-workout-prefix / stack-marker / workout-history.
- **161 `expect()` assertions** total across those specs (verified 2026-07-03
  by counting `expect(` on `origin/main`).
- **Hard crash guards** in each spec: every test registers a `page.on("pageerror", …)`
  listener and asserts no unhandled JS error fired, plus asserts the primary
  screen container `testID` is mounted and that no `data-testid="react-crash-overlay"`
  (React error-boundary overlay) is attached.

These specs are exercised by the `capture` job in `.github/workflows/ux-audit.yml`.
That job is gated:

```yaml
capture:
  if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
```

(`ux-audit.yml:61`). So **on a pull request only the trivial `vocab-audit` job runs**
(a 2-minute shell script). The scenario suite — the thing that would catch a
screen-level crash or a structural regression — only runs:

1. On the **09:00 UTC daily cron**, or
2. On a manual `workflow_dispatch`.

**Consequence**: a change that white-screens the Nutrition tab, removes a
required container `testID`, or throws inside a screen's render path can merge to
`main` and stay green in PR CI. The regression only surfaces up to **~24 hours
later** when the ux-audit cron runs and a human/agent triages the failed capture.

### Why now

The company's active engineering-infra goal is "internal development
productivity and engineering infrastructure" (ship with confidence). We have a
high-signal crash/structural suite already written and already runs green in CI
infra (the cron path) — we are simply **not running it at the one moment it
matters most: before merge.** Closing this gap is the single highest-leverage
confidence win available, because the suite already exists; this is a wiring
change, not new test authoring.

### Why this needs a plan (not a trivial fix)

The naive fix — "delete the `if:` guard so `capture` runs on PRs" — is wrong and
would harm the pipeline:

1. **Cost / wall-time**: the current `capture` job also produces baseline + 3
   CVD-emulated full-page screenshots per scenario per viewport and uploads a
   14-day artifact. On a PR we do not need screenshots — we need the assertions.
   Running the full capture on every PR wastes CI minutes and disk, and makes
   the check slow enough that engineers route around it.
2. **Flakiness → required-check risk**: `playwright.config.ts` already sets
   `retries: 2` and `workers: 1` in CI, but full-page screenshotting + CDP CVD
   sessions add rendering/IO surface that can flake. A flaky **blocking** check
   erodes trust and invites `--admin` merges.
3. **Required vs advisory**: `main` branch protection currently requires only
   two contexts (`"Verify scenario hook not in production bundle"`,
   `"Backup XML validation"`) with `strict: false`. Even `ci.yml`
   (typecheck/lint/jest) is **not** a required check today. Making this a
   *required* check is a branch-protection API change with real consequences
   (blocks all merges when the runner is degraded) and needs an explicit
   decision.

These tradeoffs need **techlead feasibility input** and **QD gate-design input**
before we write code — hence a PLAN, not a direct implementation issue.

---

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list: gamification,
streaks, notifications, onboarding, rewards, progress viz, social, habit loops,
goal-setting, motivational copy, identity framing, re-engagement)

- [ ] YES
- [x] **NO** — This is purely developer-facing CI infrastructure. It changes
  when an existing automated test suite runs (PR vs cron). No user-facing code,
  UI, copy, or product behavior changes. **Psychologist review N/A.**

---

## User Stories

- As a **CableSnap engineer/agent opening a PR**, I want the crash/structural
  scenario assertions to run on my PR so that a screen-level crash or missing
  container is caught **before merge**, not up to 24h later via cron.
- As the **CEO/QD verifying an `in_review` issue**, I want a green PR-level
  scenario check so that "PR merged + CI green" (HARD RULE #0) actually implies
  the app's key screens still mount without crashing.
- As a **maintainer**, I want the PR gate to be **fast and reliable** so it does
  not become a bottleneck or a check people learn to ignore/override.

---

## Proposed Solution

### Overview

Introduce an **assert-only PR run of the scenario suite** that runs the existing
161 assertions + crash guards **without** producing screenshots/CVD variants,
scoped to a **single representative viewport**, wired to `pull_request` — while
leaving the existing full-capture `capture` job exactly as-is for cron/dispatch
(it still produces the CVD screenshot artifact the ux-designer consumes).

Two decisions are deliberately left OPEN for reviewer input (see Open Questions):
whether to (A) add a new `assert` job inside `ux-audit.yml` or a new workflow
file; and whether the new check should be **required** (branch-protection change)
or **blocking-by-CI-status but not required** in v1.

### Assert-only mechanism (the core technical question for techlead)

The assertions and the screenshots are **interleaved in the same test** today.
`captureWithCvd()` (`e2e/scenarios/capture-with-cvd.ts`) does:
`page.screenshot({fullPage:true})` (baseline) + a CDP loop of 3 more full-page
screenshots + a meta JSON write. The `expect()` crash/structural guards run in
the same test body, mostly *before* the capture call.

Proposed approach: gate the **capture side-effects** behind an env flag so the
same specs run in assert-only mode on PRs.

```ts
// capture-with-cvd.ts
export async function captureWithCvd(options: CaptureWithCvdOptions) {
  if (process.env.E2E_ASSERT_ONLY === "1") return; // no-op: skip all screenshots
  // …existing capture logic…
}
```

- Assertions (crash guard, `toBeVisible()` on container testIDs) are **outside**
  `captureWithCvd` and keep running — they are the value of the gate.
- No spec-file edits required beyond the single helper guard (to be confirmed by
  techlead — a few specs may take screenshots inline rather than via the helper;
  those must be audited and guarded too).
- The cron/dispatch path sets no flag → full capture + artifact unchanged.

**Alternatives for techlead to weigh** (see Open Questions Q1).

### Viewport subset (wall-time control)

The cron capture runs `mobile` for all specs plus a device-class matrix
(`mobile-narrow`, `store-pixel9`, `store-fold7`) for `settings.spec.ts`, and
some specs run 4 viewports. For a PR **crash/structural** gate we do not need the
full device matrix — one representative viewport (`mobile`, 390×844) exercises
every mount/crash path. Proposal: PR assert run uses **`--project=mobile` only**.
(Reviewer input welcome on whether one extra narrow viewport, e.g.
`mobile-narrow` 320×640, is worth it to catch small-screen layout crashes — Q2.)

### Build cost

Both the cron capture and any PR assert run need the dev web bundle
(`npx expo export -p web --dev --no-minify`) so the `__DEV__`-gated scenario seed
hook is active (BLD-517 context). That export + `npm ci` + `playwright install
--with-deps chromium` is the dominant wall-time, not the assertions themselves.
The PR assert job pays this build cost. Estimated wall-time to be measured
empirically in implementation (target: **well under the existing 25-min capture
budget**, likely ~8–14 min dominated by install+export). `concurrency` with
`cancel-in-progress: true` already prevents pile-up on rapid pushes.

### Interaction with existing gates

- `ci.yml` (typecheck/lint/jest) — unchanged, complementary (unit-level).
- `bundle-gate.yml`, `changelog-gate.yml` — unchanged.
- `"Verify scenario hook not in production bundle"` (a required check) — unchanged;
  this plan does not touch the production bundle, only the dev-export test path.
- The new assert run is the **first PR-level integration/crash gate** for the web
  screens. It does not duplicate the Android Maestro e2e (`e2e-android-emulator.yml`,
  which already runs on `pull_request` with a KVM probe + 45-min timeout).

---

## Scope

**In:**
- Add an assert-only mode to the scenario suite (env-flag-gated no-op of
  screenshot capture; assertions preserved).
- Wire an assert-only scenario run to `pull_request` (job in `ux-audit.yml` or a
  new workflow — Open Q3).
- Single representative viewport for the PR run (`mobile`, ± one narrow — Open Q2).
- Keep the existing full `capture` job (cron/dispatch) producing CVD screenshots
  unchanged.
- Document the new check's purpose and the assert-only flag in the workflow file
  header comment (matching the repo's heavily-commented workflow convention).

**Out:**
- Visual-regression / pixel-diff gating on PRs (screenshots stay cron-only).
- Adding new scenario coverage or new assertions (separate tickets).
- The Android Maestro emulator path (already PR-gated).
- Coverage thresholds, matrix expansion beyond the chosen PR viewport.
- **Branch-protection required-check flip is CONDITIONAL** — see Open Q4; if we
  decide v1 ships as non-required, the protection change is a fast-follow ticket
  after the check proves stable over N green PRs.

---

## Acceptance Criteria

- [ ] AC1 — On a `pull_request` to `main`, the scenario assertion suite runs
  (all 13 specs, 161 assertions, crash guards) at the chosen viewport(s), in
  assert-only mode (no screenshots produced).
- [ ] AC2 — Given a PR whose diff throws a `pageerror` on a covered screen (or
  removes a required container `testID`), When PR CI runs, Then the assert job
  **fails** and the failure names the failing spec/screen. (Verified by a
  deliberate throwaway break in a scratch commit during implementation, then
  reverted — not merged.)
- [ ] AC3 — Given a PR with no regression, When PR CI runs, Then the assert job
  **passes** and completes in **< 15 minutes** wall-time (target; hard ceiling
  `timeout-minutes` ≤ 20).
- [ ] AC4 — The existing cron/`workflow_dispatch` `capture` job still produces
  the baseline + 3 CVD screenshots per scenario and uploads the
  `ux-audit-<run_id>` artifact (no regression to the ux-designer feed).
- [ ] AC5 — Assert-only mode is a documented, explicit switch
  (`E2E_ASSERT_ONLY=1` or equivalent); with the flag unset, behavior is
  byte-for-byte the current capture behavior.
- [ ] AC6 — No new lint/type errors; `ci.yml` stays green.
- [ ] AC7 — The workflow uses `concurrency: cancel-in-progress: true` so stacked
  pushes don't pile up runners.
- [ ] AC8 — (If v1 is required-check per Q4 decision) `main` branch protection
  lists the new context; **and** a documented rollback (remove the context) is
  recorded on the issue. (If v1 is non-required, this AC is explicitly waived and
  a fast-follow ticket is created.)

### Headless Verification Path

All acceptance criteria are headless-feasible — this is CI infrastructure.
| AC | Risk it covers | Headless proxy |
|----|----------------|----------------|
| AC2 | Gate actually fails on a real crash | Scratch commit that throws in a covered screen render path → observe red check → revert scratch commit before merge. Fully reproducible in CI logs. |
| AC3 | Wall-time acceptable for a blocking gate | Read the GitHub Actions run duration from the PR's own check run; assert < 15 min. |
| AC4 | No regression to ux-designer screenshot feed | Trigger `workflow_dispatch` on the branch, confirm `ux-audit-<run_id>` artifact contains PNGs (non-empty-bundle marker). |
No device/manual verification is required for any AC.

---

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| GitHub runner degraded / Playwright browser install fails | Job fails loudly (red check). If v1 is non-required, merges are not blocked; if required, this blocks — documented tradeoff (Q4). No silent-pass. |
| A scenario spec is legitimately flaky under assert-only | `retries: 2` (existing CI config) absorbs transient flake; a spec that flakes past retries is quarantined via a tracked follow-up ticket, not by weakening the gate. |
| Dev-export produces an empty/blank bundle (BLD-517 class) | Specs fail on `data-test-ready` / container `toBeVisible()` timeout → red check surfaces the build problem, which is the desired signal. |
| PR touches only docs / non-app files | Job still runs (cheap enough; path-filtering is an optional optimization, out of scope for v1 unless techlead recommends `paths:` filter — noted in Q5). |
| Concurrent pushes to same PR branch | `cancel-in-progress: true` cancels the superseded run. |
| Fork PR (external contributor) | `pull_request` (not `pull_request_target`) runs with read-only token; assert-only run needs no secrets (no artifact upload required on PR path) — safe for forks. |
| Assert-only flag accidentally leaks into cron path | AC5 guards this: flag unset ⇒ full capture. Cron/dispatch job must not set the flag. |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| PR gate is flaky, erodes trust, invites `--admin` merges | Medium | High | Ship v1 **non-required** (blocking-by-status but not branch-protection-required) OR bake for N green PRs before flipping required (Q4). Keep single viewport to shrink flake surface. Rely on existing `retries: 2`. |
| Wall-time too long, engineers route around it | Low–Med | Medium | Assert-only (no screenshots) + single viewport + `cancel-in-progress`. Measure in impl; hard `timeout-minutes` ceiling. |
| Assert-only refactor accidentally disables assertions too | Low | High | Guard only the `captureWithCvd` side-effects; assertions live outside it. AC5 + a test that the gate FAILS on a real break (AC2) proves assertions still run. |
| Branch-protection flip blocks all merges when runner infra is down | Med (if required) | High | Q4 decision; if required, document the emergency rollback (remove context via API) on the issue. Prefer non-required v1. |
| Duplicate/confusing checks in PR UI | Low | Low | Clear job `name:`; header comment documents intent; distinct from `ci.yml` and Android e2e. |
| Some specs screenshot inline (not via helper) and aren't guarded | Med | Medium | Implementation must audit all 13 specs for direct `page.screenshot` calls, not just `captureWithCvd` usages. Called out as an explicit impl step. |

---

## Open Questions for Reviewers

These are the decisions that gate implementation — please answer explicitly.

- **Q1 (techlead)** — Assert-only mechanism: is the `E2E_ASSERT_ONLY` no-op-in-
  `captureWithCvd` approach the cleanest, or do you prefer (a) Playwright
  `grep`/tag-based selection, (b) a separate slimmer spec entry point, or
  (c) `test.info().project` conditioning? Concern: keeping assertions and skipped
  captures from drifting.
- **Q2 (techlead + QD)** — Viewport subset for the PR gate: `mobile` only, or add
  `mobile-narrow` (320×640) to catch small-screen render crashes? Cost vs. signal.
- **Q3 (techlead)** — New `assert` job inside `ux-audit.yml` vs. a dedicated
  `scenario-assert.yml` workflow. (New file = clearer separation & independent
  check name; same file = shares the "UX Audit" identity.)
- **Q4 (techlead + QD + CEO)** — v1 as **required** branch-protection check now,
  or **non-required** (blocking-by-status only) with a fast-follow "flip to
  required after N green PRs" ticket? Note branch protection today requires only
  2 contexts and `strict:false`; even `ci.yml` is not required. **Recommendation:
  ship non-required v1, flip required as a fast-follow** — lower blast radius.
- **Q5 (techlead)** — Worth a `paths:` filter (skip docs-only PRs) or a
  `paths-ignore`, or keep it unconditional for simplicity in v1?
- **Q6 (QD)** — Does this meaningfully strengthen the QA gate given you already
  independently build+test on verification? Where does the automated PR crash
  gate sit relative to your manual verification — does it let you fast-path
  low-risk PRs, or is it purely additive?

---

## Review Feedback

### Tech Lead (Feasibility)
_Pending_

### Quality Director (Gate design / QA value)
_Pending_

### Psychologist (Behavior-Design)
N/A — Behavior-Design Classification = NO (pure dev-infra, no user-facing behavior).

### CEO Decision
_Pending_
