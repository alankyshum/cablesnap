# Concurrent-Agent Safety — CableSnap

> **Canonical doctrine for any agent working on `/projects/cablesnap`.**
> Source tickets: BLD-765 (incident origin: BLD-743), BLD-2039 (recurrence),
> BLD-2040 (rule made unconditional + `guard` preflight added).

## TL;DR

`/projects/cablesnap` is a single shared filesystem mount across agent
containers. If two agents are active at the same time and either runs
`git checkout` or `git switch`, the other's branch context is silently yanked
and any untracked artefacts in the working tree (image gen output, builds,
snapshots, dev-server state) are corrupted or lost.

**Rule (unconditional):** For ANY CableSnap implementation work — any
`git checkout`/`git switch`/`git branch`-then-edit, any file edit, any
build/test/artefact generation — you MUST work inside a per-ticket worktree
under `/tmp/wt-<branch>` created via `scripts/agent-worktree.sh start`.

The ONLY operations permitted directly in `/projects/cablesnap` are read-only
inspection of `origin/main`:
- `git fetch origin`
- `git log origin/main`
- Reading files (`cat`, `grep`, `ls`, etc.)

**NEVER run `git checkout <branch>` or `git switch` in `/projects/cablesnap`.**

Use `guard` as a preflight check to fail fast if you are about to work in the
wrong directory.

## The Helper Script

`scripts/agent-worktree.sh` is the canonical interface. Use it; don't roll your own.

```bash
# Preflight: refuse immediately if you are in the shared primary checkout
./scripts/agent-worktree.sh guard

# Start (idempotent — reuses if a worktree for this branch already exists)
eval "$(./scripts/agent-worktree.sh start bld-N-feature)"
cd "$AGENT_WORKTREE_DIR"

# ... implement, run npm test, generate artefacts, commit, push ...

# Stop at session end (refuses if dirty — pass --force to discard)
eval "$(./scripts/agent-worktree.sh stop bld-N-feature)"
```

The script exports three variables for downstream use:

| Variable | Meaning |
|---|---|
| `AGENT_WORKTREE_DIR` | Absolute path to the worktree (e.g., `/tmp/wt-bld-123-feature`) |
| `AGENT_WORKTREE_BRANCH` | Branch name |
| `AGENT_WORKTREE_LOCKFILE` | Lockfile holding our PID |

Subcommands:

| Command | Behaviour |
|---|---|
| `guard [<dir>]` | **Preflight.** Exits 3 with a clear error if `<dir>` (default `$PWD`) is the shared primary checkout `/projects/cablesnap`. Exits 0 if safe. Set `CABLESNAP_PRIMARY_CHECKOUT` to override the primary path (for tests). |
| `start <branch>` | Create or reuse `/tmp/wt-<branch>`. Fetches from origin if branch is missing. Recovers stale lockfiles. |
| `stop <branch> [--force]` | Remove worktree. No-op if missing. Refuses dirty without `--force`. |
| `status [<branch>]` | Show one worktree (or all). |
| `list` | `git worktree list` shorthand. |

## Standard Workflow for a New Ticket

```bash
cd /projects/cablesnap
git fetch origin

# `git branch` does NOT switch the shared working tree — safe to run here.
git branch bld-<N>-<description> origin/main

# Preflight: make sure you are still in /projects/cablesnap before spinning up
./scripts/agent-worktree.sh guard  # exits 3 here — confirms you need the worktree

# Spin up your isolated worktree and move into it for ALL real work.
eval "$(./scripts/agent-worktree.sh start bld-<N>-<description>)"
cd "$AGENT_WORKTREE_DIR"

# Optional: verify you are safe now
./scripts/agent-worktree.sh guard  # exits 0 — you are inside a worktree

# Implement, run npm test, generate artefacts, commit, push, open PR.
# Use `git push -u origin bld-<N>-<description>` from inside the worktree.

# Done — clean up.
eval "$(./scripts/agent-worktree.sh stop bld-N-feature)"
```

## What `git checkout` in `/projects/cablesnap` is OK for

Almost nothing. Acceptable cases:

- Fetching origin state: `git fetch origin && git log origin/main`.
- Reading files as-is (no branch switch; no writes).

If you find yourself typing `git checkout <branch>` or `git switch` in
`/projects/cablesnap`, **stop** and use the helper instead. Run `guard` first
to confirm you need to start a worktree.

## What `git checkout` in a worktree is fine for

Inside `/tmp/wt-<your-branch>`, you have your own working tree. `git checkout`,
`git switch`, `git rebase`, `git reset` are all safe and don't affect any other
agent. Just don't switch your worktree to a branch another agent is using in
*their* worktree (git itself enforces this — it'll refuse).

## Why This Rule Is Unconditional (BLD-2039 Recurrence)

The previous rule said *"use a worktree whenever … OR another agent **might**
be active"*. An agent doing pure source edits read condition (1) as not
applying and gambled on condition (2) ("probably no peer is active"). That
gamble lost during BLD-2029: another run's `git checkout` in `/projects/cablesnap`
silently wiped uncommitted `Masonry.tsx` + `FlowContainer` edits. The conditional
loophole is closed as of BLD-2040. Worktrees are now mandatory for all
implementation work, unconditionally.

## `guard` Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Safe — the directory is NOT the primary checkout |
| 2 | Usage / argument error |
| 3 | REFUSED — the directory IS the primary checkout |

## Edge Cases

| Scenario | Behaviour |
|---|---|
| You re-run `start` for the same branch | Reuses existing worktree (idempotent). Recovers stale lockfile. |
| `start` on a branch only on `origin` | Fetches `origin/<branch>` and creates a tracking local branch. |
| `start` on a branch that doesn't exist anywhere | Fails loudly. Create the branch first with `git branch <name> origin/main`. |
| `stop` on a missing worktree | No-op, exit 0. |
| `stop` on a dirty worktree | Refuses with exit 1 — commit/stash or pass `--force`. |
| Worktree path exists but git doesn't know about it | Auto-pruned and recreated. |

## Why `/tmp/wt-<branch>` and not `/projects/cablesnap-worktrees/<branch>`

- `/tmp` is container-local on most agent runtimes — naturally avoids cross-agent collision at the path level.
- `git worktree` uses hardlinks to the object DB, so a `/tmp` worktree is fast and disk-cheap.
- Ephemeral by design — survives crashes (recovered via stale-lock detection) but doesn't accumulate forever.
- Matches the workaround that already worked in BLD-743.

## Future Hardening (deferred, not in scope for BLD-2040)

A `post-checkout` git hook (`core.hooksPath`) wired to call `guard` could
catch accidental `git checkout` in the shared mount at the git layer rather
than relying on agents to call `guard` manually. Deferred because per-clone
hooks in a shared mount are fragile to update. Track on a future BLD ticket if
needed.

## When This Doesn't Apply

- **Solo OpenCode work** (`/projects/opencode`) — no shared-mount concurrency issue documented there yet. Use plain `git checkout`.

## Related

- Helper script: [`scripts/agent-worktree.sh`](../scripts/agent-worktree.sh)
- Project CLAUDE.md: [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) → "Concurrent-Agent Safety"
- Learning: [`.learnings/process/quality-pipeline.md`](../.learnings/process/quality-pipeline.md) → "Per-Agent Git Worktrees Are Mandatory for Concurrent CableSnap Work"
- Tickets: BLD-743 (incident), BLD-765 (first fix), BLD-2039 (recurrence), BLD-2040 (unconditional rule + guard)
