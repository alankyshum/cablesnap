# Merge-gate approval convention

`scripts/merge-gate.sh` is the pre-merge readiness check for CableSnap PRs.
It enforces what GitHub branch protection cannot enforce when all Builder
agents share one GitHub identity (and GitHub blocks self-approve).

## Modes

The gate detects the protection state of `main` and selects one of two
modes for the approval check:

- **STRICT** — branch protection requires N≥1 formal approving reviews.
  The gate requires at least one formal `APPROVED` review. This mirrors
  GitHub itself, so we never weaken the gate when GitHub is enforcing it.
- **LENIENT** — branch protection requires 0 formal approving reviews.
  The gate accepts EITHER:
  1. At least one formal `APPROVED` review, or
  2. Internal approval from BOTH `techlead` AND `quality-director`,
     resolved from PR comments.

If the protection lookup fails (e.g. token lacks scope), the gate
defaults to STRICT.

## Internal approval — sentinel convention (preferred)

When you (techlead or quality-director) approve a PR via comment, include
a single sentinel line that the gate parses unambiguously:

```
MERGE-GATE: techlead APPROVE
```

```
MERGE-GATE: quality-director APPROVE
```

To withdraw approval or block merge:

```
MERGE-GATE: techlead BLOCK
MERGE-GATE: quality-director BLOCK
```

Sentinel rules:
- One sentinel per comment (additional sentinels in the same comment are
  ignored — only the last one in a single comment is used).
- The **latest comment per role** wins. A later `BLOCK` overrides an
  earlier `APPROVE`. A later `APPROVE` overrides an earlier `BLOCK`.
- `qd` is accepted as an alias for `quality-director`.
- Case-insensitive.
- Place the sentinel on its own line. Surrounding prose is fine and
  encouraged — the sentinel is a structured marker on top of normal
  human-readable review.

Example:

```markdown
## techlead Code Review

Verified the diff scope, root cause, fix layer, and test coverage.

- Diff scope: 2 files, +40/-2. No collateral changes.
- Root cause: <…>
- Fix quality: idiomatic, minimal blast radius.
- Tests: render + invariant + regression case.

Recommendation: ship it.

MERGE-GATE: techlead APPROVE
```

## Agent Posting Protocol

### 1. Source of truth

The `MERGE-GATE: <role> APPROVE|BLOCK` sentinel **must** be posted on the
**GitHub PR comment thread**. `merge-gate.sh` reads only that surface.
Paperclip issue comments are for narrative audit and do not count toward the
gate — a sentinel that lives only on Paperclip will be silently ignored.

### 2. Direct-post requirement (default)

Reviewer agents (`techlead`, `quality-director`) post their full verdict —
rationale, evidence, and sentinel line — directly to the GitHub PR:

```bash
gh pr comment <N> --repo alankyshum/cablesnap --body "..."
```

Include the sentinel as the last line of the comment so it is unambiguous.

### 3. Fallback when `GH_TOKEN` is unavailable

If the reviewer's session lacks a working `GH_TOKEN`:

1. Post the full verdict on the Paperclip issue (audit narrative is preserved
   there).
2. Also post a Paperclip comment that **explicitly flags the GitHub-side gap**
   and **names a relay owner** (default: `@claudecoder`; fall back to `@ceo`
   if claudecoder is unavailable).

Example flag comment:

```
⚠️ GH_TOKEN unavailable — sentinel not yet on GitHub PR thread.
Relay owner: @claudecoder
Please copy the verdict above to PR #<N> with attribution.
```

### 4. Relay attribution

When a relay owner copies a verdict to the GitHub PR thread, the comment
**must** start with an attribution prefix and link the originating Paperclip
comment:

```
Relayed on behalf of @<role> (Paperclip comment <id>):

<original verdict text>

MERGE-GATE: <role> APPROVE
```

A relay without the `Relayed on behalf of @<role>` prefix is treated as the
relay owner's own verdict. In STRICT mode this will be rejected as
self-approval. In LENIENT mode it counts toward the relay owner's role, which
is almost certainly wrong.

### 5. Ready-to-copy templates

**techlead:**

```markdown
## techlead Code Review

- Diff scope: <N> files, +<added>/-<removed>. No collateral changes.
- Root cause: <description>
- Fix quality: <assessment>
- Tests: <coverage notes>

Recommendation: <ship it / needs changes>

MERGE-GATE: techlead APPROVE
```

**quality-director:**

```markdown
## Quality Director Verification

- Build: <pass / fail>
- TypeScript: <zero errors / N errors>
- Required CI checks: <all green / issues noted>
- Acceptance criteria: <met / gaps noted>

MERGE-GATE: quality-director APPROVE
```

### 6. Self-check before exit

Before ending the wake, confirm your sentinel landed on the PR:

```bash
gh pr view <N> --repo alankyshum/cablesnap --json comments \
  -q '.comments[].body' | grep '^MERGE-GATE: <your-role>'
```

If the grep returns nothing, your sentinel is not registered — post it or
escalate to a relay owner.

### Edge cases

| Scenario | Resolution |
|---|---|
| Reviewer session has `GH_TOKEN` | Post directly to GitHub PR. Done. |
| Reviewer session lacks `GH_TOKEN` | Post to Paperclip + flag gap + name relay owner. |
| Relay owner also lacks `GH_TOKEN` | Escalate via Paperclip; do **not** mark issue done. |
| Sentinel accidentally posted only on Paperclip (no gap flag) | Reviewer's next wake must self-correct: re-post on GitHub or escalate. |
| Multiple sentinels from same role across PR thread | Latest comment per role wins (existing rule — no change). |

## Internal approval — legacy prose fallback

For older PRs and as a safety net, the gate also recognizes
prose-style approvals:

- A role header (`## techlead`, `## Tech Lead`, `## Quality Director`,
  `## QA`, `## QD`) somewhere in the comment, AND
- A verdict keyword in the same comment:
  - APPROVE: `APPROVE`, `APPROVED`, `LGTM`, `PASS`, `PASSED`, `Ship it`
  - BLOCK: `BLOCK`, `NEEDS CHANGES`, `REQUEST CHANGES`, `FAIL`, `REJECT`

If both an APPROVE and BLOCK keyword appear in the same comment, BLOCK
wins. Sentinels (when present) take precedence over prose.

## What still blocks merge regardless of mode

- PR is closed, draft, or unmergeable (conflicts, behind base).
- Any required status check fails or is pending.
- Any reviewer has posted a formal `CHANGES_REQUESTED` review (still
  outstanding).

These checks are independent of the approval mode and always run.

## Debugging

Run with `MERGE_GATE_DEBUG=1` to trace verdict resolution:

```bash
MERGE_GATE_DEBUG=1 scripts/merge-gate.sh 481
```

## Tests

`scripts/test-merge-gate.sh` covers both layers (sentinel parsing and
end-to-end gate behavior with a mocked `gh`). Run after any change to
`merge-gate.sh`:

```bash
scripts/test-merge-gate.sh
```
