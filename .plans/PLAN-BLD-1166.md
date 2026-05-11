# Feature Plan: Bridge Paperclip approvals → GitHub merge-gate sentinels

**Issue**: BLD-1166  **Author**: CEO  **Date**: 2026-05-11
**Status**: DRAFT → IN_REVIEW (rev 2 — addresses QD blockers + techlead refinements)

## Problem Statement

`scripts/merge-gate.sh` (LENIENT mode) reads `MERGE-GATE: <role> APPROVE|BLOCK` sentinel verdicts **only from GitHub PR comments**. Internal reviewer agents (techlead, quality-director) post their verdicts in **Paperclip**, never on GitHub. The two surfaces never meet, so on every PR a human (CEO) must hand-mirror each verdict from Paperclip to the GitHub PR before merge-gate.sh will PASS.

Observed cost: BLD-1163 / PR #563 — CEO had to post comments `4424125163` (techlead) and `4424125389` (quality-director) on the PR by hand, citing the originating Paperclip approvals. This is mechanical toil that scales linearly with PR volume, blocks fully-autonomous merge, and is forgotten under pressure (premature `done` risk per HARD RULE #0).

## Behavior-Design Classification (MANDATORY)
- [x] **NO** — purely CI/automation plumbing. No user-facing surface, no behavior shaping. Psychologist review N/A.

## User Stories
- As CEO, I never have to mirror an internal agent verdict from Paperclip to a GitHub PR.
- As a reviewer agent (techlead/QD), I post my verdict once, in Paperclip, and merge-gate.sh recognises it.
- As an engineer waiting on merge, I see the gate flip green within one heartbeat of the final approval landing.

## Proposed Solution

### Overview

Three candidates were surfaced on BLD-1166. CEO recommendation, **subject to techlead feasibility verdict**, is **Option B (dual-post from reviewer agents)** because it keeps `merge-gate.sh` self-contained (no Paperclip API auth in CI), preserves the existing GitHub-only sentinel format, and is implementable as a tiny shared helper invoked by techlead + QD when they post their final verdict.

#### Options on the table

**A. Extend `merge-gate.sh` to call Paperclip API.**
- Pros: zero agent changes; single source of truth (Paperclip).
- Cons: merge-gate.sh runs in CI on `alankyshum`'s GitHub runners — requires a Paperclip API token in CI secrets, network reachability from GitHub Actions to the Paperclip API (currently internal), and a stable PR↔Issue mapping. **Blocked by the Paperclip API not being publicly reachable.**

**B. Reviewer agents dual-post (Paperclip + GitHub PR).** ⭐ recommended
- Pros: no new CI dependency; merge-gate.sh stays simple; verdict authorship is preserved on GitHub (audit trail visible to humans without Paperclip access).
- Cons: two write paths per verdict → drift risk if one post fails. Mitigated by (i) shared helper that posts to Paperclip first, then GitHub, treating GitHub post as best-effort retryable; (ii) idempotent sentinel (latest wins, dupes harmless); (iii) helper logs every dual-post for CEO sweep.

**C. Hybrid: Paperclip comment hook → GitHub PR sync.**
- Pros: agents stay single-write; no drift.
- Cons: requires a new server-side hook in Paperclip core — out of BLD's repo and slow to ship.

### UX Design
N/A — no user-facing surface. Effective UX is: CEO never has to copy verdicts between systems.

### Technical Approach (Option B — APPROVED by techlead, rev 2 incorporates QD blockers)

1. **New shared helper**: `scripts/post-merge-gate-verdict.sh` — **single-purpose: posts the GitHub sentinel only.** It does NOT post to Paperclip; the reviewer agent continues to use the existing `clip.sh comment-issue` flow for the authoritative Paperclip verdict.

   - **Signature**: `post-merge-gate-verdict.sh <role: techlead|quality-director> <verdict> <issue-identifier: BLD-N>`
     - No body-file argument. The GitHub sentinel body is templated (see #6).
     - `<verdict>` accepts `APPROVE|PASS|BLOCK|FAIL|REQUEST_CHANGES`. Anything else → exit non-zero with `error: unknown verdict '<v>'` BEFORE any post or trace beyond a crash row.
   - **Verdict normalisation** (in helper, before any GitHub call):
     - `APPROVE | PASS` → `APPROVE`
     - `BLOCK | FAIL | REQUEST_CHANGES` → `BLOCK`
   - **Hard requirements**:
     - `set -euo pipefail` at top.
     - `trap` on EXIT writes the trace row even on crash (with `outcome=crash` if not yet set).
     - Target repo hard-coded: `REPO="${MERGE_GATE_REPO:-alankyshum/cablesnap}"` — env override for tests only.
     - External deps: only `gh` (and `jq` for parsing `gh ... --json` output). No `clip.sh`, no Paperclip API client.

2. **PR resolution heuristic** (strict priority, no fallback guessing):
   1. **Authoritative Paperclip linkage first.** Query `clip.sh get-issue BLD-N` and walk `relatedWork.outbound[]` + `relatedWork.inbound[]` for any reference whose `matchedText` or comment body contains `https://github.com/alankyshum/cablesnap/pull/<N>` or `PR #<N>` in the configured repo. If exactly one open PR identified → use it.
   2. **GitHub search fallback.** `gh pr list --repo "$REPO" --search "BLD-N in:body" --state open --json number,createdAt,headRefName,isDraft`. If exactly one result → use it.
   3. **Ambiguity (≥2 candidates from either step) or zero candidates** → DO NOT POST. Write trace row with `outcome=skip-no-pr` or `outcome=skip-ambiguous-N-candidates` and exit 0. Never pick "highest-numbered" or "newest" out of multiple matches; a wrong sentinel is a false approval, not a recoverable nuisance.

3. **Idempotency — precise definition.**
   - Fetch existing PR comments via `gh pr view <N> --repo "$REPO" --json comments --jq '.comments[].body'`.
   - Filter to lines matching the anchored regex `^MERGE-GATE: (techlead|quality-director) (APPROVE|BLOCK)$` (first line of comment body).
   - Take the **latest** comment (highest `createdAt`) for the current `<role>`.
   - If its normalised verdict equals the new normalised verdict → skip the post. Trace row `outcome=skip-idempotent`.
   - If it differs (APPROVE↔BLOCK flip) → post the new sentinel. Trace row `outcome=posted-flip`.
   - If no prior sentinel from this role → post. Trace row `outcome=posted-first`.

4. **Trace log — mandatory on every invocation, every code path.**
   - File: `/tmp/merge-gate-verdict-trace.log` (append-only).
   - Format (TSV, one line per invocation):
     ```
     <iso8601-utc>\t<role>\t<verdict-raw>\t<verdict-normalized>\t<issue>\t<pr-or-none>\t<outcome>\t<error-msg-or-empty>
     ```
   - `outcome` ∈ { `posted-first`, `posted-flip`, `skip-idempotent`, `skip-no-pr`, `skip-ambiguous-N-candidates`, `error-unknown-verdict`, `error-gh-failure`, `crash` }.
   - Trap-installed writer ensures even uncaught failures leave a row.

5. **GitHub-failure handling.** On `gh` post failure (network, rate limit): trace `outcome=error-gh-failure` with stderr captured, exit 0 (do not break the agent's verdict flow). CEO heartbeat sweep reads the trace log and re-posts orphans.

6. **Sentinel body template (locked):**
   ```
   MERGE-GATE: <role> <verdict>

   Posted by post-merge-gate-verdict.sh on behalf of @<role>.
   Full verdict and rationale: Paperclip issue BLD-N.
   ```
   The first line is the only thing `merge-gate.sh` parses. Helper MUST emit this exact format (variable interpolation only on `<role>`, `<verdict>`, `BLD-N`).

7. **Agent wiring** (no Paperclip post change):
   - `AGENTS-techlead.md`: after the existing "post final verdict to Paperclip via `clip.sh comment-issue`" step, add: "If the verdict is APPROVE/BLOCK on an issue with a linked PR, also run `scripts/post-merge-gate-verdict.sh techlead <verdict> <BLD-N>`. This is the only sanctioned path for GitHub sentinels; manual `gh pr comment` mirroring is deprecated except as emergency fallback."
   - `AGENTS-quality-director.md`: identical addition with `quality-director` role. Note PASS/FAIL normalisation happens inside the helper — QD agent passes its raw verdict token through.

8. **No changes to `merge-gate.sh` itself.** It keeps reading GitHub PR comments only. Existing tests in `scripts/test-merge-gate.sh` (28/0 passing on current head) continue to pass.

9. **Documentation**:
   - `AGENTS-techlead.md` + `AGENTS-quality-director.md`: new "Posting verdicts" subsection.
   - `scripts/merge-gate.sh` header: note that sentinels are posted automatically by reviewer agents via `post-merge-gate-verdict.sh`; manual mirroring is deprecated.

### Storage / Data Model / Perf
N/A — script + agent doc only. No DB, no app code.

## Scope
**In:**
- New `scripts/post-merge-gate-verdict.sh` helper (GitHub-sentinel-only; no Paperclip writes).
- Updates to `AGENTS-techlead.md`, `AGENTS-quality-director.md`.
- Header note in `scripts/merge-gate.sh`.
- A new test file `scripts/test-post-merge-gate-verdict.sh` (sibling to `test-merge-gate.sh`) that mocks `gh` and `clip.sh get-issue` and asserts all paths in §Acceptance Criteria.

**Out:**
- Changing what counts as APPROVE (still techlead + QD; psychologist veto path unchanged).
- Changing merge mechanics (still `gh pr merge --squash`).
- Sentinels for other roles (reviewer agent's score, psychologist verdict) — separate issue if needed.
- Server-side Paperclip hooks (Option C) — explicitly deferred.

## Acceptance Criteria
- [ ] `scripts/post-merge-gate-verdict.sh` exists, is executable, starts with `set -euo pipefail`, and `shellcheck` passes clean.
- [ ] Helper does NOT call `clip.sh comment-issue` or any Paperclip write endpoint. Only reads (`clip.sh get-issue`) and `gh` writes are permitted. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] Given a Paperclip issue BLD-N whose `relatedWork` references exactly one open PR `#K` When `post-merge-gate-verdict.sh techlead APPROVE BLD-N` runs Then a comment whose first line is `MERGE-GATE: techlead APPROVE` lands on PR #K and a trace row with `outcome=posted-first` is appended. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **Idempotency**: re-invoking with the same role+normalized verdict when the latest matching `^MERGE-GATE: <role> (APPROVE|BLOCK)$` comment already matches → no new GitHub comment, trace `outcome=skip-idempotent`. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **Verdict flip**: prior latest sentinel `APPROVE`, new invocation `BLOCK` → new comment posted, trace `outcome=posted-flip`. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **PASS normalization**: invocation with raw `PASS` writes a sentinel whose first line ends `APPROVE` (not `PASS`). Same for `FAIL`/`REQUEST_CHANGES` → `BLOCK`. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **Unknown verdict**: invocation with raw `MAYBE` exits non-zero, NO `gh` write call made, trace `outcome=error-unknown-verdict`. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **No-PR case**: BLD-N with empty `relatedWork` and no `gh pr list` matches → no GitHub post, exit 0, trace `outcome=skip-no-pr`. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **Ambiguous PR**: 2+ open PR candidates from the resolution heuristic → no GitHub post, exit 0, trace `outcome=skip-ambiguous-2-candidates` (or higher count). [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **GitHub failure trace**: when mocked `gh pr comment` returns non-zero, helper exits 0 and trace row has `outcome=error-gh-failure` with stderr captured in error-msg field. [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] **Crash trace**: trap-installed writer leaves a row with `outcome=crash` if helper is killed mid-execution (test simulates with explicit `kill -TERM` before exit). [test: `scripts/test-post-merge-gate-verdict.sh`]
- [ ] `merge-gate.sh` PASSes on a feature PR where techlead + QD verdicts were posted via the new helper (no human mirror step). Demonstrated on the BLD-1166 PR itself (helper bootstraps its own merge).
- [ ] No regression on legacy PRs that already have GitHub-only sentinels: `scripts/test-merge-gate.sh` continues to pass `28 / 0`.
- [ ] `AGENTS-techlead.md` and `AGENTS-quality-director.md` document the new posting path; the old "post-on-behalf" pattern is marked deprecated except as emergency fallback.
- [ ] PR description for BLD-1166 shows trace-log lines proving the helper was used on its own merge.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Paperclip issue has no linked PR yet | Trace `skip-no-pr`, exit 0. Sentinel re-trigger once PR exists (CEO sweep or next reviewer invocation). |
| Issue references one closed + one open PR | Closed PRs filtered out by `--state open`. The single open PR is used. |
| Issue references multiple **open** PRs | Trace `skip-ambiguous-N-candidates`, no post, exit 0. CEO must disambiguate manually. |
| GitHub API rate-limited or down | Trace `error-gh-failure` with captured stderr, exit 0. CEO heartbeat sweep replays from trace log. |
| Role posts BLOCK after earlier APPROVE | Trace `posted-flip`. `merge-gate.sh` latest-wins logic flips gate red. |
| QD prose uses `PASS` not `APPROVE` | Helper normalises `PASS → APPROVE` BEFORE writing sentinel and trace row. |
| Unknown verdict token (`MAYBE`, typo) | Helper exits non-zero with `error: unknown verdict`, NO `gh` write call. Trace `error-unknown-verdict`. |
| Duplicate run (sentinel already matches) | Trace `skip-idempotent`, no GitHub post. |
| Cross-repo BLD-N reference (e.g. PR in `persoack/opencode` mentions `BLD-1166`) | Helper hard-codes `REPO=alankyshum/cablesnap`; cross-repo PRs invisible to `gh pr list --repo`. Cannot misfire. |
| A11y / accessibility | N/A — script-only, no UI surface. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Drift between Paperclip and GitHub if GH post fails | Medium | Medium | Trace log + CEO heartbeat sweep; failure non-fatal |
| Helper picks wrong PR for an issue referenced by multiple | Low | High (false sentinel on innocent PR) | Strict skip-on-ambiguity rule; never guess |
| Helper posts to a non-related PR if `relatedWork` is empty AND a stray `BLD-N` reference exists in another repo's PR | Low | High | Hard-coded `REPO=alankyshum/cablesnap`; cross-repo refs invisible to `gh pr list --repo` |
| Reviewer agent forgets to use helper, falls back to direct `clip.sh comment-issue` only | Medium | Low | AGENTS-*.md prescribes helper; merge-gate.sh stays compatible with manual sentinels |
| Paperclip CLI changes `get-issue` JSON shape breaks PR resolution step #1 | Low | Medium | Helper falls through to `gh pr list` heuristic; trace row exposes the regression |
| Sensitive verdict body posted publicly to GitHub | Low | Medium | Helper template is sentinel-only; full prose stays in Paperclip |
| Trace log fills `/tmp` over time | Low | Low | One line per invocation; rotate via cron if it ever exceeds 10MB (out of scope) |

## Review Feedback
### Quality Director (UX / Quality)
**rev 1 (2026-05-11T21:08Z, comment 8569317a):** REQUEST CHANGES. Six blockers — see comment for full text. All addressed in rev 2 (this revision):
- Blocker 1 (decouple Paperclip/GitHub writes) → §Technical Approach #1 sets helper to GitHub-only; Paperclip writes stay on `clip.sh comment-issue`. Edge-case row "Agent calls helper without a Paperclip checkout (BLD-824 lock)" removed — non-issue.
- Blocker 2 (PR resolution: Paperclip first, then `gh pr list --search ... --state open`, skip on ambiguity) → §Technical Approach #2 reorders accordingly; ambiguity = skip + trace, never pick.
- Blocker 3 (mandatory trace row, all paths, including crash via trap) → §Technical Approach #4; `set -euo pipefail` + EXIT trap explicit; outcome enum closed.
- Blocker 4 (precise idempotency: latest `^MERGE-GATE: <role> (APPROVE|BLOCK)$` via `gh pr view --json comments`) → §Technical Approach #3; AC re-stated.
- Blocker 5 (`PASS|APPROVE → APPROVE`, `FAIL|BLOCK|REQUEST_CHANGES → BLOCK`, reject unknown) → §Technical Approach #1 normalisation table; AC for unknown verdict added.
- Blocker 6 (test coverage: first-post, idempotent rerun, flip, PASS-norm, no-PR, ambiguous, GitHub-failure) → ACs expanded; new file `scripts/test-post-merge-gate-verdict.sh` declared; each AC has `[test: …]` annotation for husky ac-audit.

_Pending re-review by @quality-director on rev 2._

### Tech Lead (Feasibility)
**APPROVE — Option B with refinements** (rev 1, 2026-05-11T21:05Z, comment 5b15aa6e). Option A blocked by Paperclip API not being publicly reachable from GitHub Actions; Option C deferred (server-side hooks out of repo). Seven refinements requested — all incorporated in rev 2:
- Refinement 1 (helper does NOT post Paperclip; drop body-file arg; drop BLD-824 edge case) → done.
- Refinement 2 (Paperclip linkage first, then `gh pr list --search "BLD-N in:body" --state open`, hard-coded repo via env) → done.
- Refinement 3 (trace log mandatory + trap) → done.
- Refinement 4 (idempotency precise) → done.
- Refinement 5 (PASS/FAIL normalisation in helper) → done.
- Refinement 6 (locked sentinel template) → done.
- Refinement 7 (test mocks `gh`, covers all paths) → done.
- Plus risk-table addition (cross-repo `BLD-N` ref) → done.

Techlead pre-approved inline rev 2 land ("small enough that CEO can land them in the plan inline rather than re-spinning a full review cycle"). No re-review needed unless CEO deviated — rev 2 strictly implements the requested refinements.

### Psychologist (Behavior-Design)
N/A — Classification = NO.

### CEO Decision
_Pending @quality-director re-review of rev 2._
