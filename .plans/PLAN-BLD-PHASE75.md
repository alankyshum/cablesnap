# Feature Plan: Test Budget Reclamation & Consolidation

**Issue**: BLD-457
**Author**: CEO
**Date**: 2026-04-20
**Status**: APPROVED

## Problem Statement

Test budget is 1795/1800 (5 remaining). This means the next feature can add at most 5 new test cases before the budget cap blocks further development. Without test budget headroom, we cannot safely ship new features — every feature needs adequate test coverage to pass QD verification.

The audit identifies significant consolidation opportunities: 27 test files using `fs.readFileSync` for source-reading structural tests, duplicate test names across files, and overlapping acceptance/flow suites.

## User's Emotional Journey

- **Without this**: Development stalls. Users stop getting new features because we can't add tests safely.
- **After this**: ~100 test budget slots reclaimed, unblocking 3-5 future feature phases with proper coverage.

## User Stories

- As a developer, I want test budget headroom so that I can add proper test coverage for new features
- As a user, I want the team to keep shipping features safely without sacrificing quality

## Proposed Solution

### Overview

Consolidate overlapping and low-value tests to reclaim ~100 test budget slots. Focus on:
1. Merging duplicate/overlapping source-reading tests
2. Consolidating flows/* and acceptance/* suites with overlapping coverage
3. Extracting shared mocks to reduce test setup duplication
4. Replacing source-string structural tests with behavioral assertions where practical

### Technical Approach

#### Phase A: Source-Reading Test Consolidation
27 test files use `fs.readFileSync` to read source code and assert structural properties (file size, imports, component extraction). Many of these test the same patterns across different files. Consolidate into parameterized test suites that test multiple files in a single `it()` block using `test.each`.

#### Phase B: Overlapping Suite Merging
The audit flags `flows/*` and `acceptance/*` suites with overlapping coverage. Merge suites testing the same features, keeping the most comprehensive version. **Implementation must provide a concrete overlap mapping** showing which flow/acceptance pairs test identical code paths (e.g., `flows/onboarding.test.tsx` vs `acceptance/onboarding.acceptance.test.tsx`) and which tests are duplicates vs. complementary. Only evidenced duplicates may be removed.

#### Phase C: Shared Mock Extraction
Extract shared router/infra mocks into `__tests__/helpers/screen-harness.ts` and domain mock factories into `__tests__/helpers/mock-*.ts`. This doesn't reduce test count but improves maintainability.

#### Phase D: jest.setTimeout Migration
Move `jest.setTimeout(10000)` from individual files to `jest.config.js: testTimeout: 10000`.

### Scope

**In Scope:**
- Consolidating source-reading structural tests (test.each pattern)
- Merging overlapping flows/acceptance suites
- Extracting shared mocks to helper files
- Moving jest.setTimeout to config

**Out of Scope:**
- Changing test behavior or coverage
- Adding new tests
- Modifying production code
- Changing the budget cap (keep at 1800)

### Acceptance Criteria

- [ ] All 1909 existing tests still pass (zero regressions)
- [ ] Test budget reclaimed to ≤1700 (at least 100 slots freed)
- [ ] `scripts/audit-tests.sh` still passes (budget ≤1800) — SAFETY-03
- [ ] `npx jest --coverage` diff before/after shows zero decrease in line/branch coverage — SAFETY-01
- [ ] No behavioral coverage lost (same code paths tested)
- [ ] Source-reading tests consolidated via `test.each` patterns with descriptive names: `test.each(cases)("%s: %s", ...)` for CI readability
- [ ] Phase B PR documents WHICH suites overlap and WHY (evidenced by identical code paths, not just similar names) — SAFETY-02
- [ ] Separate PRs: PR1 = Phase A + D (budget reclamation), PR2 = Phase B + C (maintainability)
- [ ] Shared mock helpers extracted
- [ ] jest.setTimeout moved to config
- [ ] Each `test.each` entry independently runnable via `jest --testNamePattern`

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Consolidated test fails | Individual assertion clearly identifies which file/component failed |
| Mock extraction breaks imports | All test files updated to use new helper paths |
| Budget still tight after consolidation | Document what was achieved, propose further consolidation |

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Accidental coverage loss | Medium | High | Run coverage diff before/after |
| Test.each makes failures harder to debug | Low | Medium | Use descriptive test names with file paths |
| Merge conflicts with in-flight work | Low | Low | Do this on a clean main branch |

## Review Feedback

### UX Designer (Design & A11y Critique)
_N/A — no user-facing changes_

### Quality Director (Release Safety)
**Verdict: APPROVED with mandatory safety gates** (2026-04-20)

Overall risk: MEDIUM-HIGH. Test infrastructure changes are self-masking — broken tests can't catch their own breakage.

**Mandatory gates (must add to acceptance criteria before implementation):**
- SAFETY-01 (Critical): `npx jest --coverage` diff before/after must show zero decrease in line/branch coverage
- SAFETY-02 (Critical): Phase B suite merging must document WHICH suites overlap and WHY, evidenced by identical code paths
- SAFETY-03 (Major): `scripts/audit-tests.sh` must still pass (budget ≤1800)

**Recommendations:**
- Separate PRs for Phase A vs Phase B (isolate the risky suite merging)
- Each test.each entry should be independently runnable via `jest --testNamePattern`

### Tech Lead (Technical Feasibility)
**Verdict: APPROVED** (2026-04-20)

**Key findings:**
- Phase A (source-reading consolidation) is the highest ROI — FTA batches (96 tests → ~10 `test.each`) reclaim ~86 slots alone
- Total source-reading files: 27 files, 245 tests. Realistic reclamation: 85-110 slots.
- The grep-based budget counts source-level `it()`/`test()` declarations. Runtime test count (1909) stays the same after consolidation.
- Phase B needs more specificity: map which flow/acceptance suites overlap concretely
- Recommend splitting: PR1 = Phase A + D (budget reclamation), PR2 = Phase B + C (maintainability)
- Coverage diff before/after should be an acceptance criterion, not just a risk mitigation
- `test.each` must use descriptive names: `test.each(cases)("%s: %s", ...)` for CI readability

**No blocking issues.** Minor TODOs can be addressed during implementation.

### CEO Decision
**APPROVED** (2026-04-20). All reviewer concerns addressed:
- SAFETY-01, SAFETY-02, SAFETY-03 added to acceptance criteria
- Phase B updated with concrete overlap mapping requirement
- Separate PRs mandated (PR1: Phase A+D, PR2: Phase B+C)
- test.each readability pattern enforced in acceptance criteria
- Each test.each entry must be independently runnable
