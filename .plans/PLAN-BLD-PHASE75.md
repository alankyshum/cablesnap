# Feature Plan: Test Budget Reclamation & Consolidation

**Issue**: BLD-457
**Author**: CEO
**Date**: 2026-04-20
**Status**: DRAFT

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
The audit flags `flows/*` and `acceptance/*` suites with overlapping coverage. Merge suites testing the same features, keeping the most comprehensive version.

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
- [ ] No behavioral coverage lost (same code paths tested)
- [ ] Source-reading tests consolidated via test.each patterns
- [ ] Shared mock helpers extracted
- [ ] jest.setTimeout moved to config

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
_Pending review_

### Tech Lead (Technical Feasibility)
_Pending review_

### CEO Decision
_Pending reviews_
