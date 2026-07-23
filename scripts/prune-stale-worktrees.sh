#!/usr/bin/env bash
#
# prune-stale-worktrees.sh — safely remove stale Paperclip per-run git worktrees.
#
# WHY THIS EXISTS (BLD-3596):
#   The Paperclip runtime creates a per-run git worktree under
#   .paperclip/worktrees/run/<agent>-<issue> for every heartbeat run, but never
#   tears them down when a run finishes. They accumulate (BLD-3594 pruned 276 of
#   them) and eventually re-trigger "worktree expected branch X but found Y"
#   crashes (BLD-3562, BLD-3586, BLD-3588). This script is designed to be run on
#   a recurring schedule (weekly Paperclip routine) to keep the count bounded.
#
# SAFETY MODEL — this script must NEVER delete work that could be in-flight:
#   1. Never touches the main checkout ($REPO itself).
#   2. Only operates inside $REPO/.paperclip/worktrees/.
#   3. KEEPS any worktree checked out on a real feature branch (bld-*) — these
#      may hold un-pushed in-flight implementation work.
#   4. AGE GUARD (the critical protection for LIVE runs): skips any worktree
#      whose directory was modified within PRUNE_MIN_AGE_HOURS (default 24h).
#      A currently-executing run — including a run/* branch like the one this
#      very script may execute inside — has a fresh mtime and is preserved.
#      Only genuinely stale (idle > age threshold) run/* and detached-HEAD
#      worktrees are removed.
#
# Tunables via env:
#   REPO                 default /projects/cablesnap
#   PRUNE_MIN_AGE_HOURS  default 24   (only remove worktrees idle at least this long)
#   PRUNE_DRY_RUN        default 0    (set 1 to log actions without removing)
#   PRUNE_LOG            default /tmp/prune_result.txt
#
# Exit code is always 0 on a completed sweep; per-worktree failures are counted
# and logged but do not abort the sweep.

set -uo pipefail

REPO="${REPO:-/projects/cablesnap}"
MIN_AGE_HOURS="${PRUNE_MIN_AGE_HOURS:-24}"
DRY_RUN="${PRUNE_DRY_RUN:-0}"
LOG="${PRUNE_LOG:-/tmp/prune_result.txt}"
: > "$LOG"

now_epoch=$(date +%s)
min_age_secs=$(( MIN_AGE_HOURS * 3600 ))

removed=0
kept=0
failed=0

log() { echo "$*" | tee -a "$LOG" >/dev/null; }

log "PRUNE start repo=$REPO min_age_hours=$MIN_AGE_HOURS dry_run=$DRY_RUN"

# Parse `git worktree list --porcelain` into parallel path/branch arrays.
declare -a WT_PATHS
declare -a WT_BRANCHES
cur_path=""
cur_branch="__detached__"
while IFS= read -r line; do
  case "$line" in
    worktree\ *) cur_path="${line#worktree }"; cur_branch="__detached__" ;;
    branch\ *)   cur_branch="${line#branch refs/heads/}" ;;
    "")
      if [ -n "$cur_path" ]; then WT_PATHS+=("$cur_path"); WT_BRANCHES+=("$cur_branch"); fi
      cur_path=""; cur_branch="__detached__" ;;
  esac
done < <(git -C "$REPO" worktree list --porcelain)
# flush last record (porcelain may not end with a blank line)
if [ -n "$cur_path" ]; then WT_PATHS+=("$cur_path"); WT_BRANCHES+=("$cur_branch"); fi

for i in "${!WT_PATHS[@]}"; do
  p="${WT_PATHS[$i]}"
  b="${WT_BRANCHES[$i]}"

  # 1) Never touch the main checkout.
  if [ "$p" = "$REPO" ]; then continue; fi

  # 2) Only operate inside the managed worktrees dir.
  case "$p" in
    "$REPO"/.paperclip/worktrees/*) : ;;
    *) log "SKIP(non-wt) $p"; kept=$((kept+1)); continue ;;
  esac

  # 3) Preserve feature-branch worktrees (may hold in-flight work).
  case "$b" in
    bld-*) log "KEEP(feature-branch:$b) $p"; kept=$((kept+1)); continue ;;
  esac

  # 4) AGE GUARD — preserve anything touched recently (protects LIVE runs).
  if [ -e "$p" ]; then
    mtime=$(stat -c %Y "$p" 2>/dev/null || echo 0)
    age=$(( now_epoch - mtime ))
    if [ "$age" -lt "$min_age_secs" ]; then
      log "KEEP(recent age=${age}s < ${min_age_secs}s) $p ($b)"
      kept=$((kept+1))
      continue
    fi
  fi

  # Candidate for removal: run/* bookmark worktree or detached-HEAD worktree,
  # older than the age threshold.
  if [ "$DRY_RUN" = "1" ]; then
    log "DRY-REMOVE $p ($b)"
    removed=$((removed+1))
    continue
  fi

  if git -C "$REPO" worktree remove --force "$p" 2>>"$LOG"; then
    log "REMOVED $p ($b)"
    removed=$((removed+1))
    # Delete the dangling run/* bookmark, if present.
    case "$b" in
      run/*) git -C "$REPO" update-ref -d "refs/heads/$b" 2>>"$LOG" && log "  BOOKMARK-DELETED $b" ;;
    esac
    # Remove any orphaned directory left after metadata removal.
    if [ -d "$p" ]; then
      rm -rf "$p" 2>>"$LOG" && log "  ORPHAN-DIR-REMOVED $p"
    fi
  else
    log "FAILED $p ($b)"
    failed=$((failed+1))
  fi
done

git -C "$REPO" worktree prune >> "$LOG" 2>&1

summary="SUMMARY removed=$removed kept=$kept failed=$failed"
log "$summary"
echo "$summary"
exit 0
