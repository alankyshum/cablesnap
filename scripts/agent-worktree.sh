#!/usr/bin/env bash
# CableSnap agent worktree helper
#
# Why this exists
# ---------------
# /projects/cablesnap is a single shared filesystem mount across agent
# containers. When two agents work in parallel, `git checkout` on one yanks
# the working tree out from under the other and silently corrupts untracked
# artefacts (image generation output, build outputs, snapshots, dev-server
# state). Discovered in BLD-743, tracked in BLD-765. Recurrence tracked in
# BLD-2039 (root cause: conditional rule created a loophole); fixed in BLD-2040.
#
# MANDATORY RULE (unconditional as of BLD-2040)
# ---------------------------------------------
# For ANY CableSnap implementation work — any git checkout/switch/branch-then-
# edit, any file edit, any build/test/artefact generation — you MUST work inside
# a per-ticket worktree under /tmp/wt-<branch> created via `start`.
#
# The ONLY operations permitted directly in /projects/cablesnap are read-only
# inspection of origin/main:
#   git fetch origin
#   git log origin/main
#   reading files (cat, grep, etc.)
# NEVER run `git checkout <branch>` or `git switch` in /projects/cablesnap.
#
# Use `guard` as a preflight check to fail fast if you are in the shared mount.
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
#   guard [<dir>]         Preflight: exit 3 (with error) if <dir> (default $PWD)
#                         is the shared primary checkout. Exit 0 if safe (inside
#                         a worktree or any other path).
#
# Eval-friendly usage (recommended)
# ---------------------------------
#   ./scripts/agent-worktree.sh guard            # fail fast if in /projects/cablesnap
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

# resolve_lexical <path>
#
# Canonicalise a path WITHOUT requiring it to exist on disk (lexical resolution).
# Uses: realpath -m → readlink -m → raw path (fallback).
# This ensures guard works on CI runners where /projects/cablesnap is absent.
resolve_lexical() {
    realpath -m -- "$1" 2>/dev/null \
        || readlink -m -- "$1" 2>/dev/null \
        || printf '%s' "$1"
}

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

# cmd_guard [<dir>]
#
# Preflight check: refuse if <dir> (default: $PWD) is the shared primary
# checkout. Intended to be run at the top of any agent implementation task.
#
# Exit codes:
#   0  — safe: the directory is NOT the primary checkout (inside a worktree or
#              an unrelated path)
#   2  — usage/argument error
#   3  — REFUSED: the directory IS the primary checkout
#
# Primary checkout detection (belt-and-suspenders):
#   1. Compare realpath($dir) against realpath of the first entry emitted by
#      `git worktree list --porcelain` (the main worktree is always first).
#   2. Also compare against the hardcoded canonical path /projects/cablesnap,
#      resolved via realpath.
#   3. Allow override via CABLESNAP_PRIMARY_CHECKOUT env var (for tests).
#
# All output goes to stderr to keep stdout eval-clean.
cmd_guard() {
    local check_dir="${1:-$PWD}"

    # Resolve a path lexically (no filesystem existence required).
    # Prefers `realpath -m` (GNU coreutils); falls back to `readlink -m`
    # (also GNU, older); final fallback: return the path as-is.
    # This ensures guard works on CI runners where /projects/cablesnap is absent.
    resolve_lexical() {
        realpath -m -- "$1" 2>/dev/null \
            || readlink -m -- "$1" 2>/dev/null \
            || printf '%s' "$1"
    }

    # Validate the argument: reject empty string only (not non-existent paths).
    if [ -z "$check_dir" ]; then
        err "guard: empty directory argument"
        exit 2
    fi
    check_dir="$(resolve_lexical "$check_dir")"

    # Determine the primary checkout path using three methods; any match = primary

    # Method 1: env override (for testability)
    local primary_path=""
    if [ -n "${CABLESNAP_PRIMARY_CHECKOUT:-}" ]; then
        primary_path="$(resolve_lexical "$CABLESNAP_PRIMARY_CHECKOUT")"
    fi

    # Method 2: first entry of `git worktree list --porcelain` from REPO_DIR
    if [ -z "$primary_path" ]; then
        local wt_first
        wt_first="$(git -C "$REPO_DIR" worktree list --porcelain 2>/dev/null \
            | awk 'NR==1 && $1=="worktree" { print $2; exit }' || true)"
        if [ -n "$wt_first" ]; then
            primary_path="$(resolve_lexical "$wt_first")"
        fi
    fi

    # Method 3: fall back to hardcoded canonical path
    local hardcoded_primary
    hardcoded_primary="$(resolve_lexical "/projects/cablesnap")"

    # Check: is check_dir the primary checkout?
    local is_primary=0
    if [ -n "$primary_path" ] && [ "$check_dir" = "$primary_path" ]; then
        is_primary=1
    fi
    if [ "$check_dir" = "$hardcoded_primary" ]; then
        is_primary=1
    fi

    if [ "$is_primary" -eq 1 ]; then
        err "REFUSING: you are in the shared primary checkout $check_dir — start a worktree first"
        err "  Run: eval \"\$(./scripts/agent-worktree.sh start bld-<N>-<description>)\" && cd \"\$AGENT_WORKTREE_DIR\""
        err "  See .agents/CONCURRENT-AGENT-SAFETY.md (BLD-765, BLD-2039, BLD-2040)"
        exit 3
    fi

    info "guard: OK — $check_dir is not the primary checkout (safe to work here)"
    return 0
}

usage() {
    cat <<'EOF' >&2
agent-worktree.sh — per-agent git worktree helper for CableSnap

USAGE:
  scripts/agent-worktree.sh start <branch>
  scripts/agent-worktree.sh stop  <branch> [--force]
  scripts/agent-worktree.sh status [<branch>]
  scripts/agent-worktree.sh list
  scripts/agent-worktree.sh guard [<dir>]

MANDATORY RULE (unconditional — BLD-2040):
  For ANY CableSnap implementation work you MUST be inside a worktree.
  Use `guard` as a preflight check to fail fast if you are in /projects/cablesnap.

ENVIRONMENT:
  AGENT_WORKTREE_ROOT        Override worktree parent dir (default: /tmp)
  CABLESNAP_PRIMARY_CHECKOUT Override primary checkout path for guard (testing)

EXAMPLES:
  # Preflight: refuse if in the shared primary checkout
  ./scripts/agent-worktree.sh guard

  # Start an isolated worktree, cd into it, work, then clean up
  eval "$(./scripts/agent-worktree.sh start bld-123-feature)"
  cd "$AGENT_WORKTREE_DIR"
  ./scripts/agent-worktree.sh guard   # passes — you are in a worktree
  npm test
  eval "$(./scripts/agent-worktree.sh stop bld-123-feature)"

  # Inspect everything currently checked out
  ./scripts/agent-worktree.sh list

See BLD-765, BLD-2039, BLD-2040 and .agents/CONCURRENT-AGENT-SAFETY.md for full context.
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
        guard)  cmd_guard "$@" ;;
        ""|-h|--help|help) usage ;;
        *) err "Unknown subcommand: $sub"; usage; exit 2 ;;
    esac
}

main "$@"
