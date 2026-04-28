# CableSnap Test Budget Policy

**Owner:** Quality Director (independent of CEO)
**Last reconciled:** 2026-04-28 (BLD-814)
**Source of truth:** this document. `scripts/audit-tests.sh` enforces the numbers below.
**Charter override:** the Builder QD charter mentions a `1800` figure historically. That figure is **deprecated** in favor of the values here.

---

## TL;DR

| Signal | Threshold | Behavior |
|---|---|---|
| `it()`/`test()` declarations (grep) | warn ≥ 2000, **hard cap 2100** | pre-push fails over hard cap |
| Wall-clock `npm test` runtime | warn ≥ 120s, **hard cap 150s** | pre-push fails over hard cap |
| Test files / suites | none | not a budgeted metric |
| Jest-expanded test cases (`it.each`) | none | not a budgeted metric |

**Primary signal:** runtime. **Secondary signal:** declaration count.
**Suite count is not a budget signal** — it's a workload distribution metric only.

---

## Why these are the numbers

### Declaration count (warn 2000 / hard 2100)

`scripts/audit-tests.sh` uses `grep -r "^\s*\(it\|test\)("` on `__tests__/**`. This counts **source-level declarations**, not Jest-expanded test cases. A single `test.each([...10 cases])` counts as **1 declaration** but produces **10 runtime tests**.

The 2100 ceiling is set ~25% above the 2026-04-28 reconciliation baseline (2207 — see "Current state" below) so we have headroom while we land the consolidation work, and is then expected to drop back to **warn 2000 / hard 2100** as the steady-state policy.

### Runtime budget (warn 120s / hard 150s)

CI test stage is the dominant slow signal. 150s wall-clock is the practical ceiling before developer feedback loops degrade. The 120s warn gives a 30s cushion to react before a push is blocked.

### Suite count is NOT a signal

237 test files vs. 238 vs. 249 is irrelevant. A 50-line snapshot test is cheaper than a 500-line acceptance test. Counting files punishes good organization (splitting a 2000-line god-test into 10 focused files is a *win*).

The "238 suites" figure that triggered BLD-814 was a misread of `find . -name '*.test.*'` output as if it were comparable to the `1800` declaration cap. The two metrics measure different things.

---

## Current state — 2026-04-28 reconciliation (BLD-814)

Measured on `origin/main` at commit `80d1f349`:

| Metric | Count |
|---|---|
| Test files (`*.test.{ts,tsx}` under `__tests__/`) | 236 |
| Jest test suites (passing) | 237 |
| Jest test cases (after `test.each` expansion) | 2557 |
| `it()`/`test()` declarations (grep, audit-tests.sh metric) | **2207** |
| Wall-clock `npm test` runtime | **149.3 s** |

### Verdict

🟡 **OVER DECLARATION BUDGET, AT RUNTIME LIMIT, NOT YET BLOCKING.**

- Declaration count (2207) is **107 over** the audit-tests hard cap of 2100.
- Runtime (149.3s) is **0.7s under** the 150s hard cap, **29.3s over** the 120s warn.
- `audit-tests.sh` would currently fail on `--skip-runtime`. With runtime checked, it's a coin-flip per push (variance can flip 149.3 → 150+).
- `.husky/pre-push` is therefore **effectively broken on `main`** for any agent who runs the full audit. Most pushes succeed only because devs run with `SKIP_RUNTIME=1` or because variance lands them under 150s.

### Top 10 slowest suites (parallel wall-clock contributors)

```
6.74s    3 tests  __tests__/components/history/CalendarGrid-7col-layout.test.tsx
6.26s   29 tests  __tests__/acceptance/history.acceptance.test.tsx
6.00s   19 tests  __tests__/acceptance/workout-session.acceptance.test.tsx
5.87s   47 tests  __tests__/lib/db.test.ts
3.37s   20 tests  __tests__/acceptance/accessibility.acceptance.test.tsx
2.38s    3 tests  __tests__/lib/db/test-seed-timestamps.test.ts
2.35s   28 tests  __tests__/acceptance/settings.test.tsx
2.23s    1 tests  __tests__/acceptance/hydration-log.acceptance.test.tsx
2.04s    3 tests  __tests__/components/session/GroupCardHeader-prev-perf-affordance.test.tsx
2.04s    4 tests  __tests__/components/SummaryFooter.styles.test.tsx
```

Sum of suite durations = 145s; parallel wall-clock = 149s — Jest is already saturating workers. Optimization opportunity is **per-suite**, not parallelism.

---

## Policy (canonical)

### Hard caps (pre-push **WILL** block)

1. `it()`/`test()` declaration count > **2100**
2. Wall-clock `npm test` runtime > **150 s**
3. Either of the above triggered → `git push` fails. `--no-verify` is allowed only for emergency hotfixes that touch zero test files.

### Warning thresholds (loud but non-blocking)

1. Declaration count ≥ **2000**
2. Runtime ≥ **120 s**
3. Any single suite > **5 s** wall-clock — flagged in audit output, must be justified in the suite's top-of-file comment

### Banned patterns (block at PR review, not pre-push)

1. New `__tests__/**` files containing only `fs.readFileSync` source-string assertions when a behavioral test already exists
2. Adding `it()` to a file that already has > 30 declarations — split or consolidate first
3. New top-level `describe` block whose name duplicates an existing one in another file (see audit-tests.sh "Repeated describe topics" output)
4. `jest.setTimeout(>10000)` inside a test file — set in `jest.config.js` instead

### When you cross a threshold

| Situation | Required action |
|---|---|
| At warn (2000–2099 decls / 120–149s) | New tests need a one-line justification in the PR description |
| At hard cap (>2100 decls / >150s) | Net-zero or net-negative test count change; consolidate first |
| Already over (current state) | **Reclamation phase active** — see follow-ups below |

---

## Why runtime is the primary signal (CEO position accepted)

CEO argued in BLD-814 thread that runtime should be the primary signal. **QD agrees.** Reasoning:

- Declaration count is a poor proxy for cost — a 1-line `test.each` row and a 200-line acceptance test both count as `1`.
- Runtime is what actually gates developer iteration speed and CI cost.
- Declaration count is retained as a *secondary* signal because it's cheap to compute (no `npm test` run needed, runs in `--skip-runtime` mode in milliseconds) and catches "death by 10,000 small tests" before runtime catches it.

Pre-push fails on **either** signal independently — runtime first if available, declaration count always.

---

## Follow-ups filed

This reconciliation produced two child tickets:

1. **BLD-???** — Test reclamation phase: bring declaration count from 2207 → ≤2000. Owner: claudecoder. Estimate: 2–3 phases of consolidation similar to BLD-PHASE75. Target the top-20 file list above and source-string tests.
2. **BLD-???** — Runtime reduction: cut top-10 slowest suites by 30%. Targets `acceptance/history`, `acceptance/workout-session`, `db.test.ts`, `accessibility.acceptance.test.tsx`. Owner: techlead to scope.

(IDs filled in by the QD comment on BLD-814.)

---

## How to measure (canonical commands)

```bash
# Fast — declaration count + per-file breakdown, no runtime
./scripts/audit-tests.sh --skip-runtime

# Full — declaration count + runtime + top suites (5–10 min)
./scripts/audit-tests.sh

# Just runtime + suite count + slowest 10 (jest-native)
NODE_ENV=test npx jest --silent --json > /tmp/j.json
node -e "const r=require('/tmp/j.json'); const s=r.testResults.map(t=>({n:t.name.replace('/projects/cablesnap/',''),d:t.endTime-t.startTime,c:t.assertionResults.length})); s.sort((a,b)=>b.d-a.d); console.log('suites:',s.length,'tests:',r.numTotalTests); s.slice(0,10).forEach(x=>console.log((x.d/1000).toFixed(2)+'s',x.c,x.n))"
```

---

## Changelog

- **2026-04-28** (BLD-814): Initial canonical policy. Reconciled the historical `1800` charter figure with reality (now `2100` declarations / `150s` runtime). Confirmed runtime as primary signal. Confirmed suite/file count is NOT a budget metric. Filed follow-ups for current-state over-budget reclamation.
