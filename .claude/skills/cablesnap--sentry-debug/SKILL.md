# Skill: cablesnap--sentry-debug

Manage Sentry projects, query production errors, read breadcrumbs/stack traces, and send test events for the CableSnap React Native app.

## Config

| Key | Value |
|-----|-------|
| Org | `cablesnap` |
| Project | `react-native` |
| DSN | `https://c61278ad2a774c2e586454f017d4b86f@o4511267124215808.ingest.us.sentry.io/4511267125133312` |

**Auth:** managed by the `sentry` CLI via `~/.sentry/cli.db`. Run `sentry auth login` on the host to authenticate; no tokens needed in commands.

## Quick Reference

### List issues (most recent errors)

```bash
sentry issue list cablesnap/react-native --query "is:unresolved" --limit 10 --json
```

### Search issues by keyword

```bash
# By error message
sentry issue list cablesnap/react-native --query "is:unresolved strava" --limit 10 --json

# By tag
sentry issue list cablesnap/react-native --query "flow:strava_connect" --limit 10 --json
```

### Get latest event for an issue (stack trace + breadcrumbs + context)

```bash
ISSUE_ID="REACT-NATIVE-456"   # short ID, e.g. REACT-NATIVE-456
sentry issue view $ISSUE_ID --json
```

### Get all events for an issue

```bash
sentry event list $ISSUE_ID --json
```

### Get issue details (stats, first/last seen, user count)

```bash
sentry issue view $ISSUE_ID --json
```

### Resolve / archive (ignore) / unresolve an issue

```bash
sentry issue resolve $ISSUE_ID
sentry issue archive $ISSUE_ID
sentry issue unresolve $ISSUE_ID
```

### Send a test event (verify DSN works)

```bash
# Uses public DSN key — no auth token required
curl -s -X POST \
  "https://o4511267124215808.ingest.us.sentry.io/api/4511267125133312/store/" \
  -H "Content-Type: application/json" \
  -H "X-Sentry-Auth: Sentry sentry_version=7, sentry_key=c61278ad2a774c2e586454f017d4b86f" \
  -d '{
    "event_id": "'$(python3 -c "import uuid; print(uuid.uuid4().hex)")'",
    "message": "Test event from cablesnap--sentry-debug skill",
    "level": "info",
    "platform": "other",
    "tags": {"source": "debug-skill"}
  }'
```

### List project releases

```bash
sentry release list cablesnap/react-native --limit 10 --json
```

### Upload source maps (for a release)

```bash
# Always associate sourcemaps with a release — without --release they're orphaned.
VERSION="0.26.34"
sentry sourcemap upload <directory> --release "$VERSION"
```

### List project environments

```bash
sentry api /api/0/projects/cablesnap/react-native/environments/
```

### Delete an issue

The raw `/api/0/issues/{id}/` endpoint expects the **numeric group ID**, not the short ID. Resolve the numeric ID first:

```bash
NUMERIC_ID=$(sentry issue view $ISSUE_ID --json | jq -r '.id')
sentry api /api/0/issues/$NUMERIC_ID/ --method DELETE
```

### Investigate with Seer AI

```bash
sentry issue explain $ISSUE_ID    # root-cause hypothesis
sentry issue plan $ISSUE_ID       # solution plan
```

## Debugging Workflow

When investigating a production error:

1. **List recent unresolved issues** to find the error
2. **Get latest event** to see stack trace, breadcrumbs, and context tags
3. **Search by tag** (e.g. `flow:strava_connect`, `step:token_exchange`) to narrow down
4. **Read breadcrumbs** in the event payload — these show the sequence of actions before the error
5. **Check `contexts.extra`** in the event for custom data (redirectUri, proxyUrl, response status)
6. **Cross-reference** with the codebase using the stack trace file/line references
7. **Resolve** the issue once fixed and deployed

## Strava-Specific Tags

The CableSnap app instruments the Strava OAuth flow with these tags:

| Tag | Values | Description |
|-----|--------|-------------|
| `flow` | `strava_connect`, `strava_refresh`, `strava_upload` | Which Strava flow errored |
| `step` | `config_check`, `auth_prompt`, `token_exchange` | Where in the flow it failed |

Extra context fields on Strava errors: `redirectUri`, `proxyUrl`, `clientId`, `status`, `responseBody`, `sessionId`.

## Event Payload Structure (key fields)

```
event.entries[].type == "exception"  → stack traces
event.entries[].type == "breadcrumbs" → breadcrumb trail
event.contexts                       → device, OS, app version
event.tags                           → custom tags (flow, step, etc.)
event.extra                          → custom context data
event.user                           → user info if set
```
