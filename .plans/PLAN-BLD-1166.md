# Feature Plan: Bridge Paperclip approvals → GitHub merge-gate sentinels

**Issue**: BLD-1166  **Author**: CEO  **Date**: 2026-05-11
**Status**: DRAFT → IN_REVIEW

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

### Technical Approach (Option B — to be confirmed by techlead)

1. **New shared helper**: `scripts/post-merge-gate-verdict.sh`
   - Signature: `post-merge-gate-verdict.sh <role: techlead|quality-director> <verdict: APPROVE|BLOCK> <issue-identifier: BLD-N> <paperclip-comment-body-file>`
   - Behaviour:
     a. Post the verdict body to Paperclip via `clip.sh comment-issue BLD-N --body @<file>` (existing path).
     b. Resolve the linked GitHub PR: query Paperclip issue `relatedWork` and/or scan comments for `PR #(\d+)` / `pull/(\d+)` references. If multiple, pick the highest-numbered open one. If none, exit 0 with a warning — Paperclip-only post is sufficient when no PR exists yet.
     c. Post the sentinel-only comment to the resolved PR:
        ```
        MERGE-GATE: <role> <verdict>

        Posted automatically. Full verdict on Paperclip issue BLD-N.
        ```
        Idempotency: if the latest existing sentinel from this role already matches the new verdict, skip the GitHub post.
     d. On GitHub post failure: log to stderr, exit 0 (do not break the agent's main verdict flow). Helper writes a one-line trace to `/tmp/merge-gate-verdict-trace.log` so CEO heartbeat sweep can spot orphans.

2. **Agent wiring**:
   - `AGENTS-techlead.md`: update the "Post final verdict" step to call `post-merge-gate-verdict.sh techlead <verdict> <BLD-N> <verdict-body.md>` instead of `clip.sh comment-issue` directly.
   - `AGENTS-quality-director.md`: same, with `quality-director` role. Note: QD uses `PASS` in prose; helper translates `PASS → APPROVE` and `FAIL → BLOCK` when writing the sentinel.

3. **PR resolution heuristic** (in priority order):
   1. `gh pr list --repo <repo> --search "BLD-N in:body"` → newest open PR mentioning the issue identifier.
   2. Paperclip issue's `referencedIssueIdentifiers` + comment scan for `PR #\d+`.
   3. If still ambiguous, log and skip — never post to the wrong PR.

4. **No changes to `merge-gate.sh` itself.** It keeps reading GitHub PR comments only. Existing tests in `test-merge-gate.sh` continue to pass.

5. **Documentation**:
   - `AGENTS-techlead.md` and `AGENTS-quality-director.md`: new "Posting verdicts" subsection.
   - `scripts/merge-gate.sh` header: note that sentinels are posted automatically by reviewer agents via `post-merge-gate-verdict.sh`; manual mirroring is deprecated.

### Storage / Data Model / Perf
N/A — script + agent doc only. No DB, no app code.

## Scope
**In:**
- New `scripts/post-merge-gate-verdict.sh` helper.
- Updates to `AGENTS-techlead.md`, `AGENTS-quality-director.md`.
- Header note in `scripts/merge-gate.sh`.
- A new test in `scripts/test-merge-gate.sh` (or a sibling test script) covering the sentinel-only PR scenario.

**Out:**
- Changing what counts as APPROVE (still techlead + QD; psychologist veto path unchanged).
- Changing merge mechanics (still `gh pr merge --squash`).
- Sentinels for other roles (reviewer agent's score, psychologist verdict) — separate issue if needed.
- Server-side Paperclip hooks (Option C) — explicitly deferred.

## Acceptance Criteria
- [ ] `scripts/post-merge-gate-verdict.sh` exists, is executable, and shellchecks clean.
- [ ] Given a Paperclip issue BLD-N with a linked open PR `#K` When techlead invokes `post-merge-gate-verdict.sh techlead APPROVE BLD-N body.md` Then a comment lands on Paperclip AND a comment matching `MERGE-GATE: techlead APPROVE` lands on PR #K.
- [ ] Idempotency: re-invoking the same helper with the same role+verdict on the same PR does NOT post a duplicate GitHub comment.
- [ ] Given a Paperclip issue with no linked PR When the helper is invoked Then it posts to Paperclip only, logs the skip, and exits 0.
- [ ] `merge-gate.sh` PASSes on a feature PR where techlead + QD verdicts were posted via the new helper (no human mirror step).
- [ ] No regression on legacy PRs that already have GitHub-only sentinels (`scripts/test-merge-gate.sh` continues to pass).
- [ ] `AGENTS-techlead.md` and `AGENTS-quality-director.md` document the new posting path; the old "post-on-behalf" pattern is marked deprecated.
- [ ] PR description shows the helper was used on its own merge.

## Edge Cases
| Scenario | Expected |
|----------|----------|
| Paperclip issue has no linked PR yet | Helper posts to Paperclip only, exits 0 with warning. Sentinel will need re-trigger once PR exists (covered by agent docs). |
| Issue references multiple PRs (1 closed, 1 open) | Pick newest **open** PR. If all closed, exit 0 with warning. |
| GitHub API rate-limited or down | Helper logs failure, exits 0 (don't break agent's verdict). Trace written to `/tmp/merge-gate-verdict-trace.log` for CEO heartbeat sweep. |
| Role posts BLOCK after earlier APPROVE | New BLOCK sentinel posted; latest-wins logic in `merge-gate.sh` flips gate red. |
| QD prose uses `PASS` not `APPROVE` | Helper normalises `PASS → APPROVE` when writing the sentinel; Paperclip body unchanged. |
| Duplicate run (sentinel already matches) | Skip GitHub post, log "idempotent — sentinel unchanged". |
| Agent calls helper without a Paperclip checkout (BLD-824 lock) | Helper short-circuits with a clear error; agent falls back to write-verdict-to-file + manual post-on-behalf path documented today. |

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Drift between Paperclip and GitHub if GH post fails | Medium | Medium | Trace log + CEO heartbeat sweep; failure non-fatal |
| Helper picks wrong PR for an issue referenced by multiple | Low | High (false sentinel on innocent PR) | Strict newest-open-only rule; if ambiguous, skip + warn |
| Reviewer agent forgets to use helper, falls back to direct `clip.sh comment-issue` | Medium | Low | AGENTS-*.md prescribes helper; merge-gate.sh stays compatible with manual sentinels too |
| Paperclip CLI/API change breaks helper | Low | Medium | Helper has narrow surface; covered by sibling test |
| Sensitive verdict body posted publicly to GitHub | Low | Medium | Helper posts sentinel-only stub to GH; full prose stays in Paperclip |

## Review Feedback
### Quality Director (UX / Quality)
_Pending_

### Tech Lead (Feasibility)
_Pending_ — please confirm Option B vs A vs C, validate PR-resolution heuristic, and call out anything missing in the helper contract.

### Psychologist (Behavior-Design)
N/A — Classification = NO.

### CEO Decision
_Pending reviewer verdicts._
