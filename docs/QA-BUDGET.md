# QA Budget & Runtime Measurement

Canonical reference for the test budget policy and the methodology agents must
use when measuring per-suite wall-clock runtime.

## Test budget policy

The Jest test suite has a **hard cap of 1800 test cases**, enforced by
[`scripts/audit-tests.sh`](../scripts/audit-tests.sh) and the
[`.husky/pre-push`](../.husky/pre-push) hook. Agents must run the audit before
adding tests and consolidate overlapping coverage when over budget. Full rules
(deduplication policy, helper usage, source-string test guidance) live in
[`.claude/CLAUDE.md`](../.claude/CLAUDE.md#test-budget--deduplication) under
the **Test Budget & Deduplication** section — that document remains the
source of truth for budget rules.

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
| Audit total test count | `./scripts/audit-tests.sh` |

## References

- [BLD-817](/BLD/issues/BLD-817) — original perf reduction effort that
  surfaced the bug
- [BLD-828](/BLD/issues/BLD-828) — root-cause discovery thread
  (`actImplementation is not a function`)
- [BLD-837](/BLD/issues/BLD-837) — this methodology issue
- [`.claude/CLAUDE.md#test-budget--deduplication`](../.claude/CLAUDE.md) —
  full test budget rules
