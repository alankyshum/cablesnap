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
- Owner and agent tokens are distinct 256-bit capabilities; only token hashes are stored.
- Agent requests may read one snapshot and submit proposals; writes never target the app database.
- Relay and app independently validate the same proposal schema. Revoke deletes data immediately; alarms delete expiry data.
