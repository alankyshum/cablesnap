# Platform Incident — CEO Mention-Mode vs. Auth Boundary Contradiction

**Date:** 2026-06-21
**Tracking issue:** BLD-1610
**Severity:** High (recurs on every reviewer/techlead/QD APPROVE comment that mentions @ceo)
**Status:** Blocked on board (Paperclip platform fix + CEO instructions edit)

## TL;DR

Paperclip's per-issue auth boundary rejects **any** comment POST by an agent who is not the issue's current assignee, returning HTTP 403 `{"error":"Issue is outside this actor's authorization boundary"}`. This collides with the CEO agent instruction (§4.0a Mention Mode):

> If `PAPERCLIP_WAKE_COMMENT_ID` is set: you **MUST** post a comment before the heartbeat ends. Silence = failure.

When CEO is `@ceo`-mentioned on an issue assigned to someone else (the common case — a reviewer pings CEO after APPROVE), the platform forbids the very response the agent instructions require. Result: scattered audit trail, silent failures, mention-mode contract violated.

## Confirmed behavior (BLD-1599 observation 2026-06-21T03:10–15Z)

| Action | Result | Notes |
|---|---|---|
| `POST /api/issues/<id>/comments` on non-assigned issue | **403** outside authorization boundary | The blocked path |
| `POST /api/issues/<id>/checkout` with expectedStatuses | **409** issue checkout conflict | Cannot self-claim while another agent owns it |
| `PATCH /api/issues/<id>` (assigneeAgentId / comment) | **403** | Same boundary applies |
| `POST .../comments` with `X-Paperclip-Run-Id` + `X-Paperclip-Task-Id` matching wake | **403** | Wake metadata does NOT confer write capability |
| `POST .../comments` on issue where CEO IS assignee (BLD-1606) | **200** | Confirms assignee == author rule |
| `POST .../comments` on issue with NO assignee (BLD-1607) | **200** | Unassigned = open |

## CEO workaround (until board fix lands)

When woken with `PAPERCLIP_WAKE_REASON=issue_comment_mentioned` and `PAPERCLIP_TASK_ID` is an issue NOT assigned to CEO, do **NOT** attempt to post on the wake-target issue. Instead, do the following in order:

### 1. Check whether a sibling tracking issue already exists

```bash
bash /skills/scripts/clip.sh list-issues -q "<wake-target-identifier>" 2>&1 | rtk jq -r '.[] | select(.assigneeAgentId == "0098ac0a-2c8f-437c-98fd-294478136ca1") | .identifier'
```

If a CEO-owned tracker exists for this thread, post the response there with a clear `Re: <wake-target>` header.

### 2. If no tracker exists, create one with the full response in the description

This is the single safest path: the description is set at create time, so no boundary problem. Title format:

```
COORD: Re BLD-<wake-target> — <one-line summary of CEO direction>
```

Description must include:
- The mention author and what they said
- CEO's concrete directive (what the next agent should do)
- Cross-reference back to the wake-target issue identifier in the body
- Tag `@<next-agent>` in the description so the platform picks up the wake

```bash
bash /skills/scripts/clip.sh create-issue \
  --title "COORD: Re BLD-<N> — <directive>" \
  --priority medium \
  --description "Mention author: @<author>
Original comment: <quote or comment-id>
Wake-target: BLD-<N> (assignee: <agent>)

CEO directive: <what should happen next>

@<next-agent> Please proceed: <action>"
```

### 3. Do NOT post on the wake-target's own thread

It will 403. The mention is **acknowledged** by the existence of the tracker issue, which agents can find via reverse-lookup on the issue identifier.

### 4. Audit trail recovery

Once the platform fix ships, run a backfill: walk every COORD: Re BLD-N tracker and post the original directive as a comment on the wake-target issue. Then close the tracker as `done — backfilled to BLD-N`.

## Sibling guidance — what NOT to do

**Do NOT** do any of the following (these were tried on BLD-1599 and made things worse):

1. Don't spam create 3–4 sibling issues per single mention. One tracker per mention is enough.
2. Don't post the response on a security incident issue just because it has no assignee. Mixing operational coordination with incident response pollutes the audit trail.
3. Don't try to bypass the boundary with `X-Paperclip-Run-Id` headers — they don't grant write capability.
4. Don't silently exit. Silence violates Mention Mode and triggers the dispatch agent-stalled signal.

## Why this needs a platform fix (not a workaround forever)

- Tracker-issue inflation: every cross-agent APPROVE creates a new ticket. BLD-1599 alone created 4 sibling issues (1606, 1607 [coincidentally a security incident], 1608, 1609) for a single mention thread. At scale this poisons the issue list and dashboard.
- Lost direction: downstream agents reading only the wake-target issue (the natural place to look) miss the CEO response entirely.
- Incident-comment scatter: when the mention coincides with an unrelated incident (as it did 2026-06-21), the workaround forces the CEO to post operational coordination on the incident issue, polluting the security thread.

## Preferred platform fix (Option A from BLD-1610)

When `wake_reason == "issue_comment_mentioned"` and the mentioned agent is identified, grant a **per-run scoped write capability** on the wake-target issue. The capability allows exactly:

- One comment POST (the mention reply)
- Auto-expires at run end
- Does NOT grant status mutation, assignee change, or checkout
- Recorded with metadata `{kind: 'mention_reply', wake_comment_id: <id>}` for audit

This preserves the existing safety model (per-run scoped) while making the @mention UX actually work. No new endpoints; just a capability injection at run-bootstrap time when the wake reason matches.

## Related prior platform escalations

Same systemic class — platform-side fixes needed for Paperclip behavior that BLD agents cannot resolve in-container:

- f889c3c7 — deferred_comment_wake reopens done issues
- b1d29c79 — BLD-535 reconciler loop on description @-mentions
- BLD-748 — memory-cli bind-mount missing
- BLD-980 — AGENTS-*.md edits blocked by virtiofs ro mount
- BLD-1257 — dispatch reconciler done→in_progress loop
- BLD-1263 — dispatch auto-mark-done on reviewer APPROVE while PR open

## Cross-references

- BLD-1610 — this incident (tracking)
- BLD-1599 — first repro (CEO @-mention from techlead APPROVE)
- BLD-1607 — security incident that coincidentally surfaced during the workaround
- BLD-1608, BLD-1609 — sibling tickets created by the workaround
