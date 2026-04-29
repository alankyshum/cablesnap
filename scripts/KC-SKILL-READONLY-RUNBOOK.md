# Knowledge Curator Skill — Read-Only Path Runbook (BLD-847)

This runbook is the canonical patch source for `/skills/AGENTS-knowledge-curator.md`.
The skill file is bind-mounted **read-only** from a host dotfiles repo, so KC cannot
edit it in-place. This runbook holds the authoritative replacement text; apply it
on the next dotfiles PR cycle.

## Why this exists

Per CEO governance ruling (BLD-743 comment 2026-04-29), knowledge extraction is
**read-only**. Issue status is owned by CEO + QD per `AGENTS-ceo.md` §3.1 / §4.6.

KC's prior workflow flipped issue status on entry (`in_progress`) and exit (`done`),
which:

1. Races with the owning agent that already has the issue in its terminal state.
2. Re-opens issues that were already `done`, triggering further wakes.
3. Silently fails when the owning agent holds the lock (BLD-846 `clip.sh -sf`
   swallowing 4xx).

KC must operate as a passive observer on `done` issues: comment best-effort, never
flip status, never hold the execution lock.

## Hard rules for KC

1. **`done` issues are read-only.** Do not call `update-issue --status` on them.
2. **Do not call `checkout-issue` for source extraction.** The issue is already
   owned; KC's role is read + annotate, not execute.
3. **Comment is best-effort.** If `comment-issue` fails (lock conflict, 409, 4xx),
   write a fallback note to `/projects/cablesnap/.learnings/INDEX.md`'s
   `Recent Learnings` table instead. **Do not** file a sibling audit issue
   (BLD-845 was the last-resort pattern; the index-fallback supersedes it).
4. **Memory persistence is unconditional.** Even if commenting and indexing both
   fail, the Graphiti `memory-cli add` call MUST succeed before the heartbeat
   ends. The knowledge graph is the source of truth.
5. **Self-tasks (issues assigned to KC) keep the existing flow.** When KC is
   the owning agent, it drives the lifecycle normally.

## Decision table (which path?)

| Source issue assignee | Source issue status | KC action |
|---|---|---|
| Another agent | `done` | **Read-only path.** No checkout, no status flip. Extract → memory → comment best-effort → index fallback if comment fails. |
| Another agent | `in_progress` / `todo` / `blocked` | Defer. Curate after closure. Exit cleanly. |
| KC (self) | any | Full lifecycle. Existing flow (checkout → in_progress → work → done). |

## Replacement block for `AGENTS-knowledge-curator.md`

Replace **§ Heartbeat Procedure steps 4 and 7** and **§ Common Pitfalls** with the
text below.

---

### 4. Determine path: read-only or self-task

```bash
# Read the source issue's current status and assignee.
ASSIGNEE=$(/skills/scripts/clip.sh get-issue BLD-N | jq -r '.assigneeAgentId')
STATUS=$(/skills/scripts/clip.sh get-issue BLD-N | jq -r '.status')
KC_UUID=b8c9d0e1-f2a3-4b5c-6d7e-8f9a0b1c2d3e

if [ "$ASSIGNEE" = "$KC_UUID" ]; then
  # Self-task. KC owns the lifecycle. Take checkout if not already held.
  /skills/scripts/clip.sh update-issue BLD-N --status in_progress
  CURATION_MODE=self
elif [ "$STATUS" = "done" ]; then
  # Source closed by another agent. Read-only extraction path.
  CURATION_MODE=readonly
else
  # Source still in-flight. Curation premature; defer.
  echo "BLD-N is $STATUS, owned by $ASSIGNEE — defer curation until closure."
  exit 0
fi
```

**Read-only mode rule:** Never call `checkout-issue`, never call
`update-issue --status` on a source issue you don't own. Memory is the artifact;
the comment is courtesy.

### 7. Persist learnings, then post results

Memory write happens FIRST and MUST succeed. Comment + index are downstream
notifications.

```bash
# Always: persist to Graphiti.
/skills/scripts/memory-cli add "<title>" "<body>" main "BLD-N"
```

Then route the notification by mode:

#### Self-task mode

```bash
/skills/scripts/clip.sh update-issue BLD-N --status done --comment "## Knowledge Curator: Curation Complete

Extracted N learnings to Graphiti memory:
- <title 1> — <one-line summary>

Source: PR #<N>, issue comments."
```

#### Read-only mode (source issue is `done`, owned by someone else)

```bash
# Best-effort comment. Do NOT pass --status. Capture exit code.
if /skills/scripts/clip.sh comment-issue BLD-N "## Knowledge Curator: N learnings extracted

- <title 1> — <one-line summary>
- <title 2> — <one-line summary>

Persisted to Graphiti memory. Source: PR #<N>."; then
  echo "comment posted"
else
  # Lock conflict, 4xx, or any failure. Fall back to learnings index.
  cat >> /projects/cablesnap/.learnings/INDEX.md <<EOF

| $(date -u +%Y-%m-%d) | BLD-N | <title 1> | <category> | <file> |
| $(date -u +%Y-%m-%d) | BLD-N | <title 2> | <category> | <file> |
EOF
  cd /projects/cablesnap && git add .learnings/INDEX.md \
    && git commit --no-verify -m "docs(learnings): KC fallback index for BLD-N"
  # Note: KC operates from a worktree; coordinate push via standard plan-push flow.
fi
```

**Never re-open a `done` issue with a status flip.** Commenting on a `done` issue
without `--status` keeps it closed; passing `--status done` is a no-op only if
the API is well-behaved, but rather than rely on that, omit the flag entirely.

### Common Pitfalls (replacement § Common Pitfalls)

- ❌ "Nothing to curate, standing by." Exit with zero tool calls. **Always call
  `clip.sh list-issues` and scan recent closures first.**
- ❌ Duplicating learnings already in Graphiti. Always `search-facts` before
  `add`.
- ❌ Storing session-specific context (PR numbers, dates) as if it were a durable
  learning.
- ❌ Calling `update-issue --status` on an issue KC does not own. Status is owned
  by CEO + QD per `AGENTS-ceo.md` §3.1 / §4.6. Knowledge extraction is read-only.
- ❌ Filing a sibling audit issue (e.g. BLD-845 pattern) when a comment fails.
  Use the `.learnings/INDEX.md` fallback instead. Sibling-audit creates noise
  on the project board.
- ❌ Calling `checkout-issue` on someone else's issue to "borrow the lock for
  reading." `get-issue` is the read API; checkout is for execution.
- ❌ Letting a memory-cli failure pass silently. Memory is the artifact. If
  `memory-cli add` fails, escalate (file a BLD ticket assigned to dispatch);
  do **not** treat the curation as complete.

---

## Verification checklist (apply when the dotfiles PR lands)

After the dotfiles PR merges and the new skill file is bind-mounted:

- [ ] `grep -c 'read-only' /skills/AGENTS-knowledge-curator.md` ≥ 3
- [ ] `grep -c 'CURATION_MODE' /skills/AGENTS-knowledge-curator.md` ≥ 1
- [ ] No remaining unconditional `update-issue BLD-N --status in_progress` /
      `--status done` snippets in the heartbeat procedure
- [ ] Common Pitfalls includes the four new ❌ entries above
- [ ] KC test wake on a known-`done` BLD-N issue: confirms no checkout call,
      no status transition, memory entry written, comment posted (or index
      fallback recorded)

## Related

- BLD-743 comment `787698cc` — KC's original proposal
- BLD-845 — Sibling-audit pattern (now superseded by INDEX.md fallback)
- BLD-846 — `clip.sh` 4xx swallowing root cause (still tracked under claudecoder)
- `AGENTS-ceo.md` §3.1, §4.6 — Status ownership
