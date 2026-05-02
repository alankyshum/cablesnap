# `scripts/` — operational runbooks and audit drivers

This directory hosts non-app shell scripts and TypeScript drivers used for
CI, local audits, release plumbing, and asset curation. Each script is
self-documenting (docstring or `# header` block at the top); the notes
below cover the moving parts that span multiple files.

---

## `daily-audit.sh` — visual UX regression catcher

Runs the Playwright scenario specs under `e2e/scenarios/` against:

1. **Current HEAD** — every real-screen scenario (`completed-workout`,
   `workout-history`, `adaptive-rest`, …). Output → `.pixelslop/audits/<date>/HEAD/`.
2. **BLD-480 pre-fix fixture** — the regression-catcher (QD#1/QD#2 trust
   anchor). Renders `MusclesWorkedCard` wrapped in a regressed
   `maxHeight: 200` clamp so the ux-designer vision pipeline can prove,
   every day, that it still detects cropping defects on a freshly rendered
   buggy view. Output → `.pixelslop/audits/<date>/BLD_480_PRE_FIX/`.

### BLD-480 pre-fix fixture (BLD-951)

Until 2026-05-02 the pre-fix capture was produced by `git checkout`-ing
the old commit `cce2ac1f...` (the parent of PR #292's fix) and running
the scenarios against the old tree. That stopped working when the
workspace upgraded to Node 22 — the old Expo SDK shipped at that commit
had an ESM import resolution issue under Node 22, which silently
dropped the regression-catcher bundle from the audit for two consecutive
days (BLD-924, BLD-941, BLD-943).

The permanent fix (BLD-951) replaces the SHA checkout with a fixture
that lives in the modern tree:

| File                                                                       | Purpose                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `components/session/summary/__fixtures__/MusclesWorkedCardPreFix.tsx`      | Wraps the modern `MusclesWorkedCard` in a `View` that re-imposes `maxHeight: 200` + `overflow: hidden`.            |
| `app/__fixtures__/bld-480-prefix.tsx`                                      | Dev-only Expo Router route at `/__fixtures__/bld-480-prefix`. Seeds via `__TEST_SCENARIO__='completed-workout'`.   |
| `app/__fixtures__/_layout.tsx`                                             | Stack layout for the fixture route directory.                                                                      |
| `e2e/scenarios/completed-workout-prefix.spec.ts`                           | Playwright scenario: navigates the fixture route, gates on `body[data-test-ready='true']`, captures via `captureWithCvd`. |
| `scripts/daily-audit.sh`                                                   | Runs the fixture spec as the second leg of the audit; copies output to `BLD_480_PRE_FIX/` for downstream stability.    |

#### Freeze contract

The pre-fix fixture is **intentionally buggy** and **MUST NOT be
"modernized"**:

- Do not "fix" the wrapper's `maxHeight: 200` clamp — that's the bug.
- Do not relax the `overflow: hidden` — that's how the crop becomes
  visible in the screenshot.
- Do not replace `MusclesWorkedCard` with a different component — the
  fixture must keep mounting the production card so the body-figure SVG
  rendering is bug-for-bug identical to the live summary screen.

If a future refactor of `MusclesWorkedCard` makes the underlying
MuscleMap intrinsically smaller than 200px tall (so the clamp is no
longer visible in the capture), tighten the clamp (e.g. lower to 150)
or vendor the pre-fix component verbatim — but only after re-running
the QD#2 acceptance to confirm the visual defect remains unambiguous.

#### Acceptance (QD#2)

After the audit runs, the ux-designer agent's findings for the
`BLD_480_PRE_FIX/` bundle MUST contain at least one finding whose
description matches (case-insensitive):

```
crop | truncat | clip | maxHeight | cut off | MusclesWorkedCard | body-figure
```

The match-check is performed by the ux-designer agent itself on intake
(see `AGENTS-ux-designer.md`). If the gate ever fails, that means the
vision pipeline has silently regressed — exactly the failure mode this
fixture exists to catch.

#### Adding a new BLD-class regression-catcher

If a future visual bug warrants its own permanent regression-catcher,
follow the BLD-951 pattern:

1. Add a wrapper fixture under
   `components/<area>/__fixtures__/<Component>PreFix.tsx` that re-creates
   the defect on top of the modern source.
2. Add a dev-only route under `app/__fixtures__/<bug-id>.tsx` (or extend
   the existing one) that mounts the wrapper using existing seed data.
3. Add `e2e/scenarios/<bug-id>.spec.ts` modelled on
   `completed-workout-prefix.spec.ts`.
4. Wire it into `scripts/daily-audit.sh` as a separate `run_scenarios`
   call with its own bundle output dir, then update this README.

---

## Other scripts in this directory

The remaining scripts are documented at the top of each file. The most
commonly-touched ones:

- `clip.sh` — Paperclip API helper (used by every agent's heartbeat).
- `merge-gate.sh` — required check before `gh pr merge` on internal PRs.
- `audit-bundle.sh` — packages a `.pixelslop/audits/<date>/` directory
  for upload to GH Releases.
- `verify-scenario-hook-not-in-bundle.sh` — PR-time check that dev-only
  seed/fixture strings are tree-shaken out of the production web bundle.
- `safe-plan-push.sh` — enforces the plan-then-push convention for
  long-running implementation work.

When in doubt, `head -40 scripts/<file>` — every script's intent is
documented in the header.
