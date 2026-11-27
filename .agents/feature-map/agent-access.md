---
id: agent-access
title: Agent access
aliases: ["Agent access", "AI agent", "ChatGPT", "Claude", "Codex", "workout snapshot", "proposal", "paste proposal"]
routes: ["/settings/agent-access"]
paths: ["app/settings/agent-access.tsx", "components/agent-access/**", "hooks/useAgentAccess.ts", "lib/agent-access-*.ts", "lib/db/agent-access.ts", "shared/agent-access.ts", "workers/agent-relay/**"]
---
# Agent access

Create a short-lived capability-scoped workout snapshot for an AI agent the user already trusts. Agents can answer questions and submit proposed templates; only the user can review and import them.

## User journey
- Open **Settings → Integrations → Agent access**.
- Choose snapshot scope/history (90 days by default), start the session, and copy the generated prompt into ChatGPT, Claude, Codex, or another agent.
- Review incoming proposals, or paste JSON from a browse-only agent, then explicitly import a proposal to workout templates.
- Revoke at any time; the relay expires after 30 minutes by default.

## Code entry points
- `shared/agent-access.ts` — versioned schema, validator, and generated skill text.
- `workers/agent-relay/` — separate Cloudflare Worker with SQLite-backed Durable Objects.
- `lib/agent-access-snapshot.ts` — Drizzle export builder with nutrition exclusion.
- `app/settings/agent-access.tsx` — session, prompt, poll, review and paste UI.
- `lib/db/agent-access.ts` — user-approved import into template tables.

## Security boundaries
- Owner and agent tokens are distinct 256-bit capabilities; only token hashes are stored, with constant-time role comparison.
- Agent requests may read one snapshot and submit proposals; owner requests may list or revoke. Neither capability can cross into the other role or create a credentialed session.
- The GET snapshot URL intentionally carries the agent capability for browse-only support; Worker request logging is disabled. Agent/chat/proxy history can still retain that URL.
- Relay and app independently reject schema-invalid proposals and unknown exercise IDs. Limits cover snapshot/proposal bytes, proposals per session, and per-IP session creation.
- Active native sessions recover from Expo SecureStore. Expiry/revoke clear the stored owner token; relay alarms and revocation delete Durable Object data.
- Imports show current exercise names and block missing library IDs. Long review cards remain scrollable, and nothing writes to the app DB before explicit import.
