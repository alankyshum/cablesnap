#!/usr/bin/env bash
# CableSnap agent worktree helper
#
# Why this exists
# ---------------
# /projects/cablesnap is a single shared filesystem mount across agent
# containers. When two agents work in parallel, `git checkout` on one yanks
# the working tree out from under the other and silently corrupts untracked
# artefacts (image generation output, build outputs, snapshots, dev-server
# state). Discovered in BLD-743, tracked in BLD-765.
#
# Solution: any agent that does work which (a) generates untracked artefacts
# OR (b) requires a stable branch checkout while another agent might be
# active, runs in a per-branch git worktree at /tmp/wt-<branch> instead of
# the shared /projects/cablesnap working copy.
#
# Subcommands
# -----------
#   start <branch>        Create or reuse worktree at /tmp/wt-<branch>.
#                         Emits eval-friendly KEY=VALUE lines on stdout and
#                         human log lines on stderr.
#   stop  <branch>        Remove worktree. No-op if missing. Will refuse if
#                         the worktree has uncommitted changes (override
#                         with --force).
#   status [<branch>]     Show status of one or all worktrees.
#   list                  List all known worktrees.
#
# Eval-friendly usage (recommended)
# ---------------------------------
#   eval "$(./scripts/agent-worktree.sh start bld-123-feature)"
#   cd "$AGENT_WORKTREE_DIR"
#   ... do work ...
#   eval "$(./scripts/agent-worktree.sh stop bld-123-feature)"
#
# Variables exported by `start`:
#   AGENT_WORKTREE_DIR      Absolute path to the worktree
#   AGENT_WORKTREE_BRANCH   Branch name
#   AGENT_WORKTREE_LOCKFILE Lockfile path
#
# Edge cases handled
# ------------------
#   * Existing worktree for the branch  → reuse (idempotent start)
#   * Stop on missing worktree          → no-op, exit 0
#   * Branch missing locally            → `git fetch origin <branch>` then add
#   * Stale lockfile from crashed agent → PID check, recover on start
#   * Worktree path exists but not in git's worktree list → repair
#
# Out of scope
# ------------
#   * Concurrency between two agents on the SAME branch — we reuse, both share
#     the worktree (this matches `git worktree`'s native model). For untracked
#     artefacts, agents on the same branch should coordinate via the ticket.

set -euo pipefail

# Resolve the cablesnap repo from the script location (repo/scripts/foo.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

WORKTREE_ROOT="${AGENT_WORKTREE_ROOT:-/tmp}"

# Logging — go to stderr so stdout stays eval-clean
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { printf "${GREEN}[wt]${NC} %s\n" "$*" >&2; }
warn() { printf "${YELLOW}[wt]${NC} %s\n" "$*" >&2; }
err()  { printf "${RED}[wt]${NC} %s\n" "$*" >&2; }
info() { printf "${CYAN}[wt]${NC} %s\n" "$*" >&2; }

require_branch_arg() {
    if [ -z "${1:-}" ]; then
        err "Missing required <branch> argument"
        usage
        exit 2
    fi
    # Reject path-traversal characters; git allows / but we forbid .. for safety
    case "$1" in
        *..*|*' '*|/*) err "Invalid branch name: $1"; exit 2 ;;
    esac
}

worktree_path_for() {
    printf "%s/wt-%s" "$WORKTREE_ROOT" "$1"
}

lockfile_for() {
    printf "%s/wt-%s.lock" "$WORKTREE_ROOT" "$1"
}

# Acquire (or recover) lockfile. Writes our PID into it. Returns 0 on success.
acquire_lock() {
    local lockfile="$1"
    if [ -e "$lockfile" ]; then
        local prev_pid
        prev_pid="$(cat "$lockfile" 2>/dev/null || echo "")"
        if [ -n "$prev_pid" ] && kill -0 "$prev_pid" 2>/dev/null; then
            # Another live process holds the lock. For per-branch worktrees we
            # treat this as success — the worktree is already set up. The
            # caller can use it.
            info "Lock held by live PID $prev_pid (reusing worktree)"
            return 0
        fi
        warn "Stale lockfile (PID $prev_pid not running) — recovering"
        rm -f "$lockfile"
    fi
    echo "$$" > "$lockfile"
}

release_lock() {
    local lockfile="$1"
    [ -e "$lockfile" ] && rm -f "$lockfile" || true
}

# Returns 0 if `git worktree list` knows about $1, else 1
worktree_registered() {
    git -C "$REPO_DIR" worktree list --porcelain 2>/dev/null \
        | awk -v p="$1" '$1=="worktree" && $2==p { found=1 } END { exit !found }'
}

ensure_branch_local() {
    local branch="$1"
    if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$branch"; then
        return 0
    fi
    if git -C "$REPO_DIR" show-ref --verify --quiet "refs/remotes/origin/$branch"; then
        info "Local branch '$branch' missing — using origin/$branch"
        return 0
    fi
    info "Branch '$branch' not found locally — fetching from origin"
    if git -C "$REPO_DIR" fetch origin "$branch" 2>/dev/null; then
        return 0
    fi
    err "Branch '$branch' does not exist on origin either"
    return 1
}

cmd_start() {
    require_branch_arg "${1:-}"
    local branch="$1"
    local wt_dir
    wt_dir="$(worktree_path_for "$branch")"
    local lockfile
    lockfile="$(lockfile_for "$branch")"

    ensure_branch_local "$branch"

    # Case 1: directory exists AND git knows about it → reuse
    if [ -d "$wt_dir" ] && worktree_registered "$wt_dir"; then
        info "Reusing existing worktree at $wt_dir"
        acquire_lock "$lockfile"
        emit_env "$wt_dir" "$branch" "$lockfile"
        return 0
    fi

    # Case 2: directory exists but git does not know → repair
    if [ -d "$wt_dir" ] && ! worktree_registered "$wt_dir"; then
        warn "Directory $wt_dir exists but is not a registered worktree — pruning"
        git -C "$REPO_DIR" worktree prune
        if [ -d "$wt_dir" ]; then
            err "Cannot reclaim $wt_dir — please remove it manually and retry"
            return 1
        fi
    fi

    # Case 3: fresh add
    log "Creating worktree: $wt_dir → $branch"
    if git -C "$REPO_DIR" show-ref --verify --quiet "refs/heads/$branch"; then
        git -C "$REPO_DIR" worktree add "$wt_dir" "$branch" >&2
    else
        # Branch only on origin — create a tracking local branch
        git -C "$REPO_DIR" worktree add -b "$branch" "$wt_dir" "origin/$branch" >&2
    fi
    acquire_lock "$lockfile"
    emit_env "$wt_dir" "$branch" "$lockfile"
}

emit_env() {
    local wt_dir="$1" branch="$2" lockfile="$3"
    # Stdout — eval-friendly. Quote values defensively.
    printf 'export AGENT_WORKTREE_DIR=%q\n' "$wt_dir"
    printf 'export AGENT_WORKTREE_BRANCH=%q\n' "$branch"
    printf 'export AGENT_WORKTREE_LOCKFILE=%q\n' "$lockfile"
}

cmd_stop() {
    require_branch_arg "${1:-}"
    local branch="$1"
    local force=0
    shift
    while [ $# -gt 0 ]; do
        case "$1" in
            --force|-f) force=1; shift ;;
            *) err "Unknown stop flag: $1"; return 2 ;;
        esac
    done
    local wt_dir
    wt_dir="$(worktree_path_for "$branch")"
    local lockfile
    lockfile="$(lockfile_for "$branch")"

    if [ ! -d "$wt_dir" ] && ! worktree_registered "$wt_dir"; then
        info "No worktree for '$branch' (already stopped)"
        release_lock "$lockfile"
        # Still emit unset commands so callers can `eval` safely
        emit_unset
        return 0
    fi

    # Refuse to remove if dirty (unless --force)
    if [ -d "$wt_dir" ] && [ $force -eq 0 ]; then
        local dirty
        dirty="$(git -C "$wt_dir" status --porcelain 2>/dev/null || true)"
        if [ -n "$dirty" ]; then
            err "Worktree $wt_dir has uncommitted changes:"
            git -C "$wt_dir" status --short >&2 || true
            err "Commit/stash them, or re-run with --force to discard."
            return 1
        fi
    fi

    log "Removing worktree $wt_dir"
    if [ $force -eq 1 ]; then
        git -C "$REPO_DIR" worktree remove --force "$wt_dir" >&2 2>/dev/null || true
    else
        git -C "$REPO_DIR" worktree remove "$wt_dir" >&2 2>/dev/null || true
    fi
    # Final cleanup if git remove didn't take (e.g., directory already gone)
    [ -d "$wt_dir" ] && rm -rf "$wt_dir" || true
    git -C "$REPO_DIR" worktree prune >&2 2>/dev/null || true
    release_lock "$lockfile"
    emit_unset
}

emit_unset() {
    printf 'unset AGENT_WORKTREE_DIR\n'
    printf 'unset AGENT_WORKTREE_BRANCH\n'
    printf 'unset AGENT_WORKTREE_LOCKFILE\n'
}

cmd_status() {
    if [ -n "${1:-}" ]; then
        local branch="$1"
        local wt_dir
        wt_dir="$(worktree_path_for "$branch")"
        if worktree_registered "$wt_dir"; then
            echo "active   $branch  $wt_dir"
        else
            echo "missing  $branch  $wt_dir"
        fi
        return 0
    fi
    cmd_list
}

cmd_list() {
    git -C "$REPO_DIR" worktree list
}

usage() {
    cat <<'EOF' >&2
agent-worktree.sh — per-agent git worktree helper for CableSnap

USAGE:
  scripts/agent-worktree.sh start <branch>
  scripts/agent-worktree.sh stop  <branch> [--force]
  scripts/agent-worktree.sh status [<branch>]
  scripts/agent-worktree.sh list

ENVIRONMENT:
  AGENT_WORKTREE_ROOT   Override worktree parent dir (default: /tmp)

EXAMPLES:
  # Start an isolated worktree, cd into it, work, then clean up
  eval "$(./scripts/agent-worktree.sh start bld-123-feature)"
  cd "$AGENT_WORKTREE_DIR"
  npm test
  eval "$(./scripts/agent-worktree.sh stop bld-123-feature)"

  # Inspect everything currently checked out
  ./scripts/agent-worktree.sh list

See BLD-765 and .agents/CONCURRENT-AGENT-SAFETY.md for full context.
EOF
}

main() {
    local sub="${1:-}"
    shift || true
    case "$sub" in
        start)  cmd_start "$@" ;;
        stop)   cmd_stop "$@" ;;
        status) cmd_status "$@" ;;
        list)   cmd_list ;;
        ""|-h|--help|help) usage ;;
        *) err "Unknown subcommand: $sub"; usage; exit 2 ;;
    esac
}

main "$@"
