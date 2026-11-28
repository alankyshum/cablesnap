#!/usr/bin/env tsx
// BLD-5100: deployed Worker capability, expiry, size, and rate-limit verification.
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.AGENT_RELAY_URL ?? "https://cablesnap-agent-relay.alankyshum.workers.dev";
const OUT = process.env.AGENT_RELAY_EVIDENCE ?? "/tmp/bld-5100-evidence/slice1/verify-agent-relay.txt";
const results: string[] = [];
const started = Date.now();

type Session = { sessionId: string; expiresAt: number; ownerToken: string; agentToken: string; agentUrl: string; proposalUrl: string };
type JsonResponse = { status: number; body: unknown };

const snapshot = {
  schemaVersion: "1",
  generatedAt: new Date().toISOString(),
  range: { from: new Date(Date.now() - 90 * 86400_000).toISOString(), to: new Date().toISOString(), days: 90 },
  scope: { sessions: true, templates: true, exerciseLibrary: true, personalRecords: true },
  sessions: [], templates: [], exerciseLibrary: [{ id: "exercise-1", name: "Test exercise" }], personalRecords: [],
};

async function json(method: string, url: string, token?: string, body?: unknown): Promise<JsonResponse> {
  const response = await fetch(url, {
    method,
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function create(ttlSeconds = 300): Promise<Session> {
  const value = await json("POST", `${BASE}/v1/sessions`, undefined, { snapshot, ttlSeconds });
  if (value.status !== 201) throw new Error(`create failed with ${value.status}`);
  return value.body as Session;
}

function assert(name: string, condition: boolean, detail?: string): void {
  if (!condition) throw new Error(`${name}${detail ? `: ${detail}` : ""}`);
  results.push(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
}

async function verifyCapabilities(session: Session): Promise<void> {
  assert("owner/agent tokens have 256-bit backing", session.ownerToken.length === 43 && session.agentToken.length === 43);
  assert("agent reads snapshot", (await json("GET", session.agentUrl)).status === 200);
  assert("owner cannot read agent snapshot", (await json("GET", `${BASE}/v1/sessions/${session.sessionId}/snapshot`, session.ownerToken)).status === 401);
  assert("unauthenticated snapshot rejected", (await json("GET", `${BASE}/v1/sessions/${session.sessionId}/snapshot`)).status === 401);
  assert("owner polls proposals", (await json("GET", session.proposalUrl, session.ownerToken)).status === 200);
  assert("agent cannot poll proposals", (await json("GET", session.proposalUrl, session.agentToken)).status === 401);
  assert("agent cannot revoke", (await json("DELETE", `${BASE}/v1/sessions/${session.sessionId}`, session.agentToken)).status === 401);
  assert("agent cannot create another session", (await json("POST", `${BASE}/v1/sessions`, session.agentToken, { snapshot })).status === 401);
  assert("wrong token rejected", (await json("GET", session.proposalUrl, "wrong-token")).status === 401);
}

async function verifyValidation(session: Session): Promise<void> {
  const invalid = await json("POST", session.proposalUrl, session.agentToken, {});
  assert("schema-invalid proposal rejected", invalid.status === 422, String(invalid.status));
  const extraField = await json("POST", session.proposalUrl, session.agentToken, { schemaVersion: "1", kind: "template-proposal", extra: true, template: { name: "Extra", exercises: [{ exerciseId: "exercise-1", targetSets: 2, targetReps: "8", restSeconds: 90 }] } });
  assert("extra proposal field rejected", extraField.status === 422, String(extraField.status));
  const missingField = await json("POST", session.proposalUrl, session.agentToken, { schemaVersion: "1", kind: "template-proposal", template: { name: "Missing" } });
  assert("missing proposal field rejected", missingField.status === 422, String(missingField.status));
  const outOfRange = await json("POST", session.proposalUrl, session.agentToken, { schemaVersion: "1", kind: "template-proposal", template: { name: "Range", exercises: [{ exerciseId: "exercise-1", targetSets: 21, targetReps: "8", restSeconds: 90 }] } });
  assert("out-of-range proposal rejected", outOfRange.status === 422, String(outOfRange.status));
  assert("owner cannot submit proposal", (await json("POST", session.proposalUrl, session.ownerToken, { schemaVersion: "1", kind: "template-proposal", template: { name: "Owner", exercises: [{ exerciseId: "exercise-1", targetSets: 2, targetReps: "8", restSeconds: 90 }] } })).status === 401);
  const oversized = await json("POST", session.proposalUrl, session.agentToken, `"${"x".repeat(64 * 1024)}"`);
  assert("oversized proposal rejected", oversized.status === 413, String(oversized.status));
  const proposal = {
    schemaVersion: "1",
    kind: "template-proposal",
    template: { name: "Verification template", exercises: [{ exerciseId: "exercise-1", targetSets: 2, targetReps: "8-10", restSeconds: 90 }] },
  };
  const submitted = await json("POST", session.proposalUrl, session.agentToken, proposal);
  assert("agent submits valid proposal", submitted.status === 201, String(submitted.status));
  const polled = await json("GET", session.proposalUrl, session.ownerToken);
  const proposals = (polled.body as { proposals?: unknown[] } | null)?.proposals;
  assert("owner observes proposal after write", polled.status === 200 && proposals?.length === 1);
  for (let index = 1; index < 20; index += 1) {
    const status = (await json("POST", session.proposalUrl, session.agentToken, proposal)).status;
    if (status !== 201) throw new Error(`proposal quota probe ${index} failed with ${status}`);
  }
  const limited = await json("POST", session.proposalUrl, session.agentToken, proposal);
  assert("proposal per-session limit enforced", limited.status === 429, String(limited.status));
}

async function verifyRevoke(session: Session): Promise<void> {
  assert("owner revokes immediately", (await json("DELETE", `${BASE}/v1/sessions/${session.sessionId}`, session.ownerToken)).status === 204);
  assert("agent snapshot rejected after revoke", (await json("GET", session.agentUrl)).status === 401);
  assert("owner poll rejected after revoke", (await json("GET", session.proposalUrl, session.ownerToken)).status === 401);
  assert("proposal POST rejected after revoke", (await json("POST", session.proposalUrl, session.agentToken, { schemaVersion: "1", kind: "template-proposal", template: { name: "Late", exercises: [{ exerciseId: "exercise-1", targetSets: 1, targetReps: "8", restSeconds: 60 }] } })).status === 401);
}

async function verifySnapshotLimit(): Promise<void> {
  const oversizedSnapshot = { ...snapshot, sessions: [{ notes: "x".repeat(2 * 1024 * 1024) }] };
  const value = await json("POST", `${BASE}/v1/sessions`, undefined, { snapshot: oversizedSnapshot });
  assert("oversized snapshot rejected", value.status === 413, String(value.status));
  const extraField = await json("POST", `${BASE}/v1/sessions`, undefined, { snapshot: { ...snapshot, nutrition: [] } });
  assert("out-of-scope nutrition rejected", extraField.status === 400, String(extraField.status));
}

async function verifyExpiry(): Promise<void> {
  const session = await create(30);
  const seconds = Math.round((session.expiresAt - Date.now()) / 1000);
  assert("requested TTL is clamped to short 30 seconds", seconds >= 29 && seconds <= 31, `${seconds}s`);
  assert("snapshot available before expiry", (await json("GET", session.agentUrl)).status === 200);
  await new Promise((resolve) => setTimeout(resolve, 31_500));
  assert("expired agent token rejected", (await json("GET", session.agentUrl)).status === 410);
  assert("expired proposal POST rejected", (await json("POST", session.proposalUrl, session.agentToken, { schemaVersion: "1", kind: "template-proposal", template: { name: "Late", exercises: [{ exerciseId: "exercise-1", targetSets: 1, targetReps: "8", restSeconds: 60 }] } })).status === 410);
  assert("expired owner token rejected", (await json("GET", session.proposalUrl, session.ownerToken)).status === 410);
}

async function verifyRateLimit(): Promise<void> {
  const active: Session[] = [];
  let limited = false;
  for (let count = 0; count < 15; count += 1) {
    const value = await json("POST", `${BASE}/v1/sessions`, undefined, { snapshot });
    if (value.status === 429) { limited = true; break; }
    if (value.status !== 201) throw new Error(`rate-limit probe create failed with ${value.status}`);
    active.push(value.body as Session);
  }
  for (const session of active) await json("DELETE", `${BASE}/v1/sessions/${session.sessionId}`, session.ownerToken);
  assert("session creation rate limit enforced", limited, `${active.length} requests admitted before 429`);
}

async function main(): Promise<void> {
  const health = await json("GET", `${BASE}/`);
  assert("worker health responds", health.status === 200);
  const session = await create();
  await verifyCapabilities(session);
  await verifyValidation(session);
  await verifyRevoke(session);
  await verifySnapshotLimit();
  await verifyExpiry();
  await verifyRateLimit();
  results.push(`Completed deployed verification in ${Math.round((Date.now() - started) / 1000)}s`);
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${results.join("\n")}\n`, { mode: 0o600 });
  console.log(results.join("\n"));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
