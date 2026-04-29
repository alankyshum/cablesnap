# Headless Agent Git Safety Runbook

This runbook covers two related hazards when multiple agents share `/projects/cablesnap`:

1. **Push-race trap** (BLD-819) — `git push` silently succeeds from the wrong branch.
2. **Worktree isolation** (BLD-840) — concurrent checkouts corrupt each other's work.

---

## Worktree Isolation (BLD-840)

### The problem

`/projects/cablesnap` is a single shared filesystem mount. When two agents work concurrently:

- Agent A starts a rebase on branch X
- Agent B runs `git checkout Y` in the same directory
- Agent A's rebase is silently corrupted

**Real incident:** BLD-783 — two foreign branch checkouts mid-rebase aborted work silently.

### Decision: per-branch worktrees (adopted)

After evaluating three options:

| Option | Verdict |
|--------|---------|
| Per-branch worktrees at `/tmp/wt-<branch>` | **ADOPTED** — simple, proven, already working |
| Per-agent persistent worktrees | Rejected — over-provisions storage, doesn't add safety beyond per-branch |
| Detached worktree pattern | Rejected — more complex, no clear benefit |

### Mandatory workflow for all agents

**Every agent that mutates the repo MUST use a worktree.** `/projects/cablesnap` is for read-only queries only.

```bash
# 1. Start worktree (idempotent — reuses if exists)
eval "$(bash /projects/cablesnap/scripts/agent-worktree.sh start <branch-name>)"
cd "$AGENT_WORKTREE_DIR"

# 2. Do all work here: commits, rebases, builds, tests

# 3. Push from the worktree
git push origin <branch-name>

# 4. Clean up when done (optional — worktrees persist for reuse)
eval "$(bash /projects/cablesnap/scripts/agent-worktree.sh stop <branch-name>)"
```

### Rules

1. **Never `git checkout` in `/projects/cablesnap`** — use `agent-worktree.sh start` instead.
2. **Never `git rebase` in `/projects/cablesnap`** — always in a worktree.
3. **Read-only operations are fine** in `/projects/cablesnap`: `git log`, `git show`, `git diff`, file reads.
4. **One branch per worktree** — `agent-worktree.sh` enforces this via `/tmp/wt-<branch>`.
5. **Two agents on the same branch** share the worktree — coordinate via the ticket.

### Script reference

See `scripts/agent-worktree.sh` for full documentation. Key subcommands:

- `start <branch>` — create or reuse worktree, emits eval-friendly env vars
- `stop <branch>` — remove worktree (refuses if dirty unless `--force`)
- `list` — show all active worktrees
- `status [<branch>]` — check one or all

---

## Push-Race Trap (BLD-819)

This section hardens the §6 Phase 1 plan-commit flow in `AGENTS-ceo.md` against the silent push-race trap observed in BLD-768.

## The trap

`git push origin main` pushes the LOCAL `main` to remote `main`. If the heartbeat
silently started on a feature branch and the commit landed there, local `main`
is unchanged, so `git push origin main` returns `(up-to-date)` and exit 0.
**Truthful, but the plan never shipped.** Reviewers wait; the pipeline stalls.

## Hard rules for any plan commit

1. **Branch verification (mandatory, first step)**
   ```bash
   [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "WRONG BRANCH"; exit 1; }
   ```
2. **Stash hygiene** — `git stash list` first; never assume a clean stack.
3. **Stage explicitly** — `git add .plans/PLAN-BLD-N.md`, never `git add .` / `-A`.
4. **Remote-state push verification** — exit code is not enough:
   ```bash
   LOCAL=$(git rev-parse HEAD)
   git push --no-verify origin main
   REMOTE=$(git ls-remote origin main | awk '{print $1}')
   [ "$LOCAL" = "$REMOTE" ] || { echo "PUSH FAILED: $LOCAL ≠ $REMOTE"; exit 1; }
   ```

## Recommended path: use the wrapper

In CableSnap (`alankyshum/cablesnap`):

```bash
scripts/safe-plan-push.sh .plans/PLAN-BLD-N.md "plan: BLD-N — <short title>"
```

The wrapper enforces all four guards above and exits non-zero (loudly) on any
violation. See `scripts/safe-plan-push.sh` for the full check list.

## Replacement block for AGENTS-ceo.md §6 Phase 1

Replace the current `Write the plan file and commit it:` snippet with:

```bash
cd /projects/cablesnap && mkdir -p .plans
# Write .plans/PLAN-BLD-N.md using the template below

# ---- BLD-819 hardened push ----
scripts/safe-plan-push.sh .plans/PLAN-BLD-N.md "plan: BLD-N — [feature name]"
# Wrapper aborts on wrong branch, divergent remote, or silent push failure.
# Manual fallback if the script is unavailable:
#   [ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || git checkout main
#   git add .plans/PLAN-BLD-N.md
#   git commit --no-verify -m "plan: BLD-N — [feature name]"
#   LOCAL=$(git rev-parse HEAD); git push --no-verify origin main
#   REMOTE=$(git ls-remote origin main | awk '{print $1}')
#   [ "$LOCAL" = "$REMOTE" ] || { echo "PUSH RACE: see BLD-819"; exit 1; }
```

## Anti-pattern (add to §9)

> ❌ Trusting `git push` exit code without verifying `git ls-remote` matches
> local HEAD. The "up-to-date" message is truthful but can mean "your commit
> never reached this branch" (BLD-819).
