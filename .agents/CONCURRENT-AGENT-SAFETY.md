# Concurrent-Agent Safety — CableSnap

> **Canonical doctrine for any agent working on `/projects/cablesnap`.**
> Source ticket: BLD-765 (incident origin: BLD-743).

## TL;DR

`/projects/cablesnap` is a single shared filesystem mount across agent
containers. If two agents are active at the same time and either of them
runs `git checkout`, the other's branch context is silently yanked and
any **untracked** artefacts in the working tree (image gen output, builds,
snapshots, dev-server state) are corrupted or lost.

**Rule:** Use a per-branch git worktree whenever the work
1. generates untracked artefacts (image generation, builds, snapshots, dev server), OR
2. requires a stable branch checkout while another CableSnap agent might be active.

When in doubt, use a worktree. The cost is sub-second; the upside is no clobbered work.

## The Helper Script

`scripts/agent-worktree.sh` is the canonical interface. Use it, don't roll your own.

```bash
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

# Spin up your isolated worktree and move into it for ALL real work.
eval "$(./scripts/agent-worktree.sh start bld-<N>-<description>)"
cd "$AGENT_WORKTREE_DIR"

# Implement, run npm test, generate artefacts, commit, push, open PR.
# Use `git push -u origin bld-<N>-<description>` from inside the worktree.

# Done — clean up.
eval "$(./scripts/agent-worktree.sh stop bld-<N>-<description>)"
```

## What `git checkout` in `/projects/cablesnap` is OK for

Almost nothing. Acceptable cases:

- Reading the current `main` (no switch): `git fetch origin && git log origin/main`.
- Quick read-only inspection where you can guarantee no other agent is active (rare — assume there always is one).

If you find yourself typing `git checkout <branch>` in `/projects/cablesnap`, stop and use the helper instead.

## What `git checkout` in a worktree is fine for

Inside `/tmp/wt-<your-branch>`, you have your own working tree. `git checkout`, `git switch`, `git rebase`, `git reset` are all safe and don't affect any other agent. Just don't switch your worktree to a branch another agent is using in *their* worktree (git itself enforces this — it'll refuse).

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

## When This Doesn't Apply

- **Solo OpenCode work** (`/projects/opencode`) — no shared-mount concurrency issue documented there yet. Use plain `git checkout`.
- **Single-agent CableSnap maintenance** with full certainty no peer is active — still cheap enough to use a worktree, but not strictly required.

## Related

- Helper script: [`scripts/agent-worktree.sh`](../scripts/agent-worktree.sh)
- Project CLAUDE.md: [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) → "Concurrent-Agent Safety"
- Learning: [`.learnings/process/quality-pipeline.md`](../.learnings/process/quality-pipeline.md) → "Per-Agent Git Worktrees Are Mandatory for Concurrent CableSnap Work"
- Tickets: BLD-743 (incident), BLD-765 (this fix)
