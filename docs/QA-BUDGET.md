# QA Budget & Runtime Measurement

Canonical reference for the test budget policy and the methodology agents must
use when measuring per-suite wall-clock runtime.

## Test budget policy (updated 2026-05-09 per BLD-1123)

The previous **global cap of 2500 test cases** has been **REMOVED**. With
acceptance-criteria coverage now enforced per ticket
(`scripts/audit-acceptance-criteria.sh`), the suite is expected to grow
legitimately, and a global ceiling created perverse incentives to skip AC
tests. Two policies remain:

1. **Runtime budget** — `npm test` wall-clock must stay under
   `RUNTIME_BUDGET_SECONDS` (default 150s). Slow CI is bad regardless of test
   count. Enforced by `scripts/audit-tests.sh` (used in pre-push and CI).
2. **Per-ticket reporting** — `scripts/audit-tests.sh` groups tests by the
   `BLD-XXXX` reference declared in each test file's header comment and
   prints a per-ticket count. Soft warn at `PER_TICKET_WARN_TESTS` (default
   50) per ticket. **Informational only — does not fail the build.** Reviewers
   use this to spot pathological per-feature growth.

### How a test file declares its ticket

Add a header comment near the top of the file (any of these patterns work):

```ts
// BLD-1108: covers AC1, AC5, AC6 from PLAN-BLD-1105.md
// or
/**
 * BLD-1108 — form-clips inline record (AC1, AC2a, AC2b)
 */
```

The audit script greps the top 20 lines for the first `BLD-XXXX` match.
Files without a header reference are reported as `UNTAGGED` so they can be
backfilled.

## Acceptance-criteria coverage policy (BLD-1123)

Every `## Acceptance Criteria` bullet in `.plans/PLAN-BLD-*.md` must satisfy
ONE of:

1. The bullet contains an explicit `[test: <path>[::"<test name>"]]`
   annotation pointing at an existing file under `__tests__/` or
   `e2e/scenarios/`. Example:

   ```md
   - [ ] **AC1** Given an exercise with no clips, When the user taps Record,
     Then FormVideoSheet opens. [test: __tests__/acceptance/form-clips-record.test.tsx::"opens FormVideoSheet on tap"]
   ```

2. There is at least one test under `__tests__/acceptance/` or
   `e2e/scenarios/` whose contents reference the plan's BLD ticket (in a
   header comment) AND the AC label (`AC1`, `AC2a`, …) in a `describe`/`it`
   name.

For ACs that genuinely cannot be unit/e2e tested today (e.g. CI-workflow
asserts, manual a11y walk-throughs, process steps), prepend
`[TODO-test: BLD-1123-followup]` to the bullet. The audit treats this as an
intentional gap (`~`) rather than a failure (`X`).

Pre-push enforces this on **changed plans only** (`--changed-vs origin/main`)
so legacy plans don't block dev. Backfill incrementally on plan revisions.

### Legacy opt-out

Add `<!-- ac-audit: legacy -->` anywhere in a plan to grandfather it. Use
sparingly — the goal is to backfill, not exempt.

## Runtime measurement (CRITICAL)

Per-suite wall-clock measurements **MUST** be taken via `npm test` OR with
`NODE_ENV=test` explicitly set on the command. Examples:

```bash
# Preferred — uses the canonical wrapper
./scripts/measure-suite.sh __tests__/components/SomeComponent.test.tsx

# Equivalent — npm test forwards through cross-env NODE_ENV=test
npm test -- __tests__/components/SomeComponent.test.tsx

# Manual — only if you set NODE_ENV=test yourself
NODE_ENV=test npx jest --json __tests__/components/SomeComponent.test.tsx
```

### Why this matters

The container shell defaults to `NODE_ENV=production`. The `npm test` script
in `package.json` overrides this via `cross-env NODE_ENV=test jest`, but
**direct `npx jest` invocations inherit `production`** from the shell.

Under `NODE_ENV=production`, React 19's production build elides the `act`
test hook. `react-test-renderer.act` becomes `undefined`. Acceptance suites
that wrap work in `act(...)` either exit early or hit the 10 s Jest timeout.
Recorded suite times become noise — typically 5–10 s of timeout/error
overhead, not real render cost. Top-N "slowest suite" lists built from those
numbers point at the wrong suites.

### Symptoms of measuring with the wrong NODE_ENV

If you see any of the following, **stop, fix `NODE_ENV`, and re-measure**:

- `TypeError: actImplementation is not a function`
- Every acceptance suite reporting ~5–10 s wall-clock
- Suites failing only when invoked via direct `npx jest`, but passing under
  `npm test`

### Canonical commands

| Goal | Command |
|------|---------|
| Measure one suite (preferred) | `./scripts/measure-suite.sh <pattern>` |
| Measure one suite (alt) | `npm test -- <pattern>` |
| Run the whole suite | `npm test` |
| Audit per-ticket counts + runtime | `./scripts/audit-tests.sh` |
| Audit AC coverage (changed plans) | `./scripts/audit-acceptance-criteria.sh --changed-vs origin/main` |
| Audit AC coverage (rolling 7d window) | `./scripts/audit-acceptance-criteria.sh --shipped-window 7 --warn-only` |

## References

- [BLD-817](/BLD/issues/BLD-817) — original perf reduction effort that
  surfaced the runtime measurement bug
- [BLD-828](/BLD/issues/BLD-828) — root-cause discovery thread
  (`actImplementation is not a function`)
- [BLD-837](/BLD/issues/BLD-837) — runtime methodology issue
- [BLD-1123](/BLD/issues/BLD-1123) — global cap removal + AC enforcement
- [BLD-1124](/BLD/issues/BLD-1124) — settings overflow re-regression that
  motivated the rolling visual-audit gate
- [`.claude/CLAUDE.md#test-budget--deduplication`](../.claude/CLAUDE.md) —
  full test convention rules
