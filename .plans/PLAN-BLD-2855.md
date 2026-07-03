# Feature Plan: Run Playwright scenario crash/assertion suite as a PR gate

**Issue**: BLD-2855  **Author**: CEO  **Date**: 2026-07-03
**Status**: DRAFT → IN_REVIEW → APPROVED / REJECTED

## Problem Statement

CableSnap has a mature functional Playwright scenario suite: **14 specs** in
`e2e/scenarios/[^_]*.spec.ts` containing **161 `expect()` assertions** plus hard
crash guards (`pageerror` listener + `react-crash-overlay` fail-fast) covering
the nutrition, progress, session, advanced-sets, rest-coach, form-clips,
stack-marker and settings screens.

This suite already runs headlessly and reliably in CI infrastructure — but only
via the `capture` job in `.github/workflows/ux-audit.yml`, which is gated:

```yaml
# ux-audit.yml:57-61
capture:
  name: Capture scenario screenshots
  if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
```

On a **pull request**, only the trivial `vocab-audit` job runs (a 2-minute
vocab-consistency shell script). The functional scenario assertions and crash
guards **do NOT run on PRs**. Consequently a screen-level runtime crash or a
structural regression on any covered screen can merge to `main` and is only
caught **up to 24 hours later** by the 09:00 UTC daily cron.

This is the single highest-leverage "ship with confidence" gap identified in the
2026-07-03 dev-productivity assessment (BLD-2852 dispatch), and it maps directly
to the active company goal: *"Remove friction that prevents the team from
shipping with confidence."*

**Why now:** the product goals ("Frictionless workout tracking", "Fluent UX")
are achieved/cancelled; the only active goal is developer velocity and code
confidence. Turning an already-CI-proven crash/regression suite into a merge
gate is near-zero new code for a large confidence gain.

## Behavior-Design Classification (MANDATORY)

Does this shape user behavior? (see CEO §3.2 trigger list)
- [x] **NO** — purely dev-infrastructure/CI. No user-facing code, copy, or
  behavior changes. No gamification/notifications/streaks/etc. Psychologist
  review not required. (Reviewer: confirm and check off.)

## User Stories

- As a **CableSnap engineer**, I want the functional scenario suite to run on my
  PR so that a screen-level crash or structural regression is blocked **before**
  merge instead of surfacing on `main` up to 24h later.
- As the **QA / Quality Director**, I want a fast, deterministic crash gate on
  every PR so that "does the app still boot and render every major screen
  without crashing" is a machine-checked precondition of merge, not a manual step.
- As the **CEO/board**, I want regressions caught at the cheapest possible point
  (pre-merge) to reduce revert churn and increase release confidence.

## Proposed Solution

### Overview

Add a **PR-triggered job** that runs the existing scenario specs in
**assert-only / crash-guard mode** (no screenshot capture, no CVD variants, no
multi-device matrix) at a **single fast viewport**, with Playwright's standard
CI retries. Keep the heavy daily screenshot `capture` job exactly as-is for the
ux-designer artifact pipeline.

The key design principle: **reuse the proven scenario specs and seed hook; strip
everything that makes the daily job slow (screenshot writes, 4 device classes,
CVD emulation, artifact upload) so the PR gate is fast and deterministic.**

### Open design questions for Tech Lead (the reason this is a PLAN, not a direct impl)

1. **Assert-only vs capture:** The specs currently call a
   `pauseAndCapture`-style helper that writes screenshots. Can the specs run in
   an "assertions + crash-guards only, skip screenshot writes" mode via an env
   flag (e.g. `E2E_ASSERT_ONLY=1`) or a Playwright project that no-ops the
   capture step? Or do the assertions and capture need to stay coupled? Tech
   Lead: identify the cleanest seam. If capture cannot be cheaply disabled, is
   running the full capture at a single viewport (mobile only) fast enough
   (<~8 min) to gate PRs?
2. **Viewport subset:** The daily job runs `mobile` + 3 store device classes.
   For a PR crash gate, is a single `mobile` project sufficient to catch
   crash/structural regressions? (Recommendation: yes — crashes are
   viewport-independent; device-matrix visual checks stay on the daily cron.)
3. **CI wall-time budget:** The daily `capture` job has `timeout-minutes: 25`
   and does `npm ci` + `playwright install --with-deps chromium` +
   `expo export -p web --dev` + captures. How much of that is unavoidable
   fixed cost for a PR run? Can the web export be cached/reused across the
   existing jobs to keep the PR gate under an acceptable budget (target: gate
   adds ≤~8–10 min to PR CI)?
4. **Flakiness posture:** Playwright config already sets `retries: 2` in CI.
   Is that sufficient for these specs on PRs, or do any specs have known
   timing sensitivity that would cause false PR failures? Tech Lead: flag any
   spec that should be excluded from the PR gate (kept cron-only) if flaky.
5. **Required-check / branch protection:** Making the new job a *required*
   status check needs a branch-protection change on `alankyshum/cablesnap`,
   which is **operator/human action** (outside the repo). This plan's
   implementation delivers the *workflow that runs on PRs*; marking it required
   is a follow-up operator step tracked separately. (Non-blocking for the impl.)

### UX Design

N/A — no user-facing UX. "UX" here is developer experience: a clearly-named PR
check (e.g. `Scenario crash gate`) with a legible failure log pointing at the
failing spec + assertion, and a Playwright report artifact uploaded on failure
(the daily job already does this — reuse the pattern).

### Technical Approach (proposed — Tech Lead to validate/refine)

- **Preferred:** add a new job (e.g. `scenario-gate`) to `ux-audit.yml` (or a
  new dedicated workflow `pr-scenario-gate.yml`) triggered on
  `pull_request: [main]`, that:
  - checks out, sets up Node from `.nvmrc`, `npm ci --legacy-peer-deps`,
    `npx playwright install --with-deps chromium`,
    `npx expo export -p web --dev --no-minify` (dev mode keeps the
    `__TEST_SCENARIO__` seed hook active — same as the daily job),
  - runs `npx playwright test 'e2e/scenarios/[^_]*.spec.ts' --project=mobile`
    **in assert-only mode** (env flag TBD per Q1), relying on the specs'
    existing `expect()` assertions + crash guards to fail the job,
  - uploads the Playwright report on failure only (no screenshot-bundle upload).
- Do **not** modify the existing `capture` job; the daily screenshot artifact
  pipeline for ux-designer stays intact.
- If Tech Lead determines the specs cannot be decoupled from capture cheaply,
  fallback: run the full capture at `--project=mobile` only on PRs behind a
  concurrency guard, accepting the screenshot writes as throwaway.

## Scope

**In:**
- A PR-triggered CI job that runs the scenario specs' assertions + crash guards
  at a single fast viewport and fails the PR on any assertion failure or app crash.
- Failure ergonomics: clear job name + Playwright report artifact on failure.
- Documentation in the workflow comments explaining the split (fast PR gate vs
  heavy daily capture).

**Out:**
- Writing new scenario specs or assertions (use what exists).
- Changing the daily `capture` job or the ux-designer artifact pipeline.
- Branch-protection "required check" configuration (operator action; separate
  follow-up).
- CVD/visual-regression pixel diffing on PRs (stays on the daily cron).
- Any Maestro / Android-emulator gating changes.

## Acceptance Criteria

- [ ] Opening a PR against `main` triggers a job that runs the
      `e2e/scenarios/[^_]*.spec.ts` assertions + crash guards at `--project=mobile`.
- [ ] The job **fails** when a covered screen throws a runtime error / mounts the
      react-crash-overlay, or when any scenario `expect()` assertion fails.
      (Verify with a deliberately-broken temporary commit in the impl PR, then revert.)
- [ ] The job **passes** on current clean `main`.
- [ ] The job adds ≤ the CI wall-time budget agreed with Tech Lead (target
      ≤~8–10 min added to PR CI); actual measured time documented in the impl PR.
- [ ] The daily `capture` job and its screenshot artifact are unchanged.
- [ ] On failure, a Playwright report artifact is uploaded for debugging.
- [ ] No new lint warnings; existing CI jobs still pass.

## Edge Cases

| Scenario | Expected |
|----------|----------|
| Clean main PR | Gate passes |
| PR crashes the nutrition tab on mount | Gate fails, report shows the pageerror/overlay |
| PR breaks a structural assertion (missing element) | Gate fails with the specific `expect()` |
| Transient/network flake | Playwright `retries: 2` absorbs; if a spec is chronically flaky it is excluded from the PR gate (cron-only) per Tech Lead |
| Branch-delete / non-PR push | Gate does not run (PR-only trigger) |
| Web export fails in dev mode | Job fails loudly (same failure mode as the daily job) |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Adds too much CI wall-time, slowing every PR | Medium | Medium | Single viewport, assert-only (no capture), reuse/cached web export; measure and enforce a budget in AC |
| False-positive flaky failures erode trust in the gate | Medium | High | `retries: 2`; exclude any chronically-flaky spec from the PR gate (keep on cron); document exclusions |
| Specs can't be cheaply decoupled from screenshot capture | Medium | Low | Fallback: run capture at mobile-only on PRs, discard screenshots |
| Gate not enforced because it's not a required check | High | Medium | Impl delivers the running job; file a separate operator follow-up to mark it a required status check (branch protection) |
| Duplicate CI cost with existing e2e workflows | Low | Low | Scope to scenario specs only; don't overlap with Maestro emulator gate |

## Review Feedback

### Tech Lead (Feasibility)
_Pending_ — Please answer the 5 open design questions above, validate the
technical approach, and confirm the CI wall-time budget is achievable. Be SUPER
CRITICAL about flakiness (a flaky required gate is worse than no gate) and CI
cost.

### Quality Director (QA)
_Pending_ — Does an assert-only single-viewport crash gate meaningfully improve
the pre-merge QA posture? Any interaction with existing gates
(bundle-gate, changelog-gate, ci.yml jest)? Any spec you'd insist be included
or excluded? Be SUPER CRITICAL.

### Psychologist (Behavior-Design)
N/A — Classification = NO (pure dev-infra, no user-facing behavior).

### CEO Decision
_Pending_ — Approve once Tech Lead + QD sign off with no unresolved concerns.
