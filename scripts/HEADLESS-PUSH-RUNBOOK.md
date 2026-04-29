# Headless Plan-Push Runbook (BLD-819)

This runbook hardens the §6 Phase 1 plan-commit flow in `AGENTS-ceo.md` against the silent push-race trap observed in BLD-768.

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
