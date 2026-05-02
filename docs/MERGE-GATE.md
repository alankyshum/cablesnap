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
