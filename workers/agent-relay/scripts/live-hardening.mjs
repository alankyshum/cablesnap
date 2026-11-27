// BLD-5100: redacted live acceptance matrix against the deployed Worker.
import { mkdir, writeFile } from "node:fs/promises";

const BASE = process.env.AGENT_RELAY_URL ?? "https://cablesnap-agent-relay.alankyshum.workers.dev";
const EVIDENCE = "/tmp/bld-5100-evidence/hardening/live-negative-matrix.txt";
const transcript = [];
const record = (caseName, status, expected) => {
  transcript.push(`${caseName}\t${status}\t${expected}`);
  if (!String(expected).split("|").includes(String(status))) throw new Error(`${caseName}: got ${status}, expected ${expected}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const snapshot = {
  schemaVersion: "1",
  generatedAt: new Date().toISOString(),
  range: { from: new Date(Date.now() - 90 * 86400000).toISOString(), to: new Date().toISOString(), days: 90 },
  scope: { sessions: true, templates: true, exerciseLibrary: true, personalRecords: true },
  sessions: [14, 35, 72].map((days, index) => ({ id: `seed-session-${index}`, name: ["Push", "Pull", "Legs"][index], started_at: new Date(Date.now() - days * 86400000).toISOString(), completed_at: new Date(Date.now() - days * 86400000 + 3600000).toISOString(), sets: [{ exerciseId: "bench-press", weight: 80 + index * 5, reps: 8 }] })),
  templates: [{ id: "seed-template", name: "Balanced A" }],
  exerciseLibrary: [{ id: "bench-press", name: "Bench Press" }],
  personalRecords: [{ exerciseId: "bench-press", exerciseName: "Bench Press", maxWeight: 90 }],
};
const validProposal = {
  schemaVersion: "1", kind: "template-proposal",
  template: { name: "Agent Balanced", notes: "Review before import", exercises: [{ exerciseId: "bench-press", targetSets: 3, targetReps: "8-10", restSeconds: 90 }] },
};

async function call(path, init = {}) {
  return fetch(`${BASE}${path}`, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
}
async function create(extra = {}) {
  const response = await call("/v1/sessions", { method: "POST", body: JSON.stringify({ snapshot, ...extra }) });
  const json = response.ok ? await response.json() : null;
  return { response, json };
}
function agentHeaders(session) { return { Authorization: `Bearer ${session.agentToken}` }; }
function ownerHeaders(session) { return { Authorization: `Bearer ${session.ownerToken}` }; }
function proposalRequest(session, body = validProposal) {
  return call(`/v1/sessions/${session.sessionId}/proposals`, { method: "POST", headers: agentHeaders(session), body: JSON.stringify(body) });
}

await mkdir("/tmp/bld-5100-evidence/hardening", { recursive: true });
transcript.push("Awaiting a fresh rate-limit window (61s)");
await sleep(61_000);

const created = await create();
record("create session", created.response.status, "201");
const session = created.json;
const secondCreated = await create();
record("create second session", secondCreated.response.status, "201");
const second = secondCreated.json;
record("schema resource", (await call("/v1/schema.json")).status, "200");
record("skill resource", (await call("/v1/skill.md")).status, "200");
record("agent snapshot GET", (await call(session.agentUrl.replace(BASE, ""))).status, "200");
record("owner token as agent", (await call(`/v1/sessions/${session.sessionId}/snapshot`, { headers: ownerHeaders(session) })).status, "401");
record("agent token list owner endpoint", (await call(`/v1/sessions/${session.sessionId}/proposals`, { headers: agentHeaders(session) })).status, "401");
record("agent token revoke", (await call(`/v1/sessions/${session.sessionId}`, { method: "DELETE", headers: agentHeaders(session) })).status, "401");
record("owner token proposal POST", (await call(`/v1/sessions/${session.sessionId}/proposals`, { method: "POST", headers: ownerHeaders(session), body: JSON.stringify(validProposal) })).status, "401");
record("missing snapshot token", (await call(`/v1/sessions/${session.sessionId}/snapshot`)).status, "401");
record("wrong snapshot token", (await call(`/v1/sessions/${session.sessionId}/snapshot`, { headers: { Authorization: "Bearer definitely-wrong" } })).status, "401");
record("cross-session token", (await call(`/v1/sessions/${second.sessionId}/snapshot`, { headers: agentHeaders(session) })).status, "401");
record("agent token create session", (await call("/v1/sessions", { method: "POST", headers: agentHeaders(session), body: JSON.stringify({ snapshot }) })).status, "403");

for (const [name, invalid] of [
  ["wrong schemaVersion", { ...validProposal, schemaVersion: "999" }],
  ["extra field", { ...validProposal, extra: true }],
  ["missing field", { schemaVersion: "1", kind: "template-proposal", template: { name: "Missing" } }],
  ["out-of-range value", { ...validProposal, template: { ...validProposal.template, exercises: [{ ...validProposal.template.exercises[0], targetSets: 21 }] } }],
  ["unknown exercise id", { ...validProposal, template: { ...validProposal.template, exercises: [{ ...validProposal.template.exercises[0], exerciseId: "not-shared" }] } }],
]) record(name, (await proposalRequest(session, invalid)).status, "422");
record("proposal body cap", (await call(`/v1/sessions/${session.sessionId}/proposals`, { method: "POST", headers: agentHeaders(session), body: "x".repeat(65537) })).status, "413");
record("snapshot upload cap", (await call("/v1/sessions", { method: "POST", body: JSON.stringify({ snapshot: { ...snapshot, exerciseLibrary: [{ id: "bench-press", name: "x".repeat(2 * 1024 * 1024 + 1) }] } }) })).status, "413");

for (let index = 0; index < 20; index++) record(`proposal ${index + 1}`, (await proposalRequest(session)).status, "201");
record("proposal limit 21", (await proposalRequest(session)).status, "429");
record("owner poll", (await call(`/v1/sessions/${session.sessionId}/proposals`, { headers: ownerHeaders(session) })).status, "200");

record("revoke", (await call(`/v1/sessions/${second.sessionId}`, { method: "DELETE", headers: ownerHeaders(second) })).status, "204");
record("snapshot after revoke", (await call(`/v1/sessions/${second.sessionId}/snapshot`, { headers: agentHeaders(second) })).status, "401");
record("proposal POST after revoke", (await proposalRequest(second)).status, "401");

const expiring = await create({ ttlSeconds: 30 });
record("create short TTL session", expiring.response.status, "201");
transcript.push("Waiting 31s for Durable Object expiry alarm");
await sleep(31_000);
record("snapshot after expiry", (await call(`/v1/sessions/${expiring.json.sessionId}/snapshot`, { headers: agentHeaders(expiring.json) })).status, "410|401");
record("proposal POST after expiry", (await proposalRequest(expiring.json)).status, "410|401");

let rateStatus = 0;
let attempts = 0;
while (rateStatus !== 429 && attempts < 12) {
  attempts += 1;
  rateStatus = (await create()).response.status;
}
record("session creation rate limit", rateStatus, "429");
transcript.push(`Rate limit reached after ${attempts} follow-up create attempts`);
await writeFile(EVIDENCE, `${transcript.join("\n")}\nAll tokens and request payloads intentionally omitted.\n`);
process.stdout.write(`Saved redacted live matrix: ${EVIDENCE}\n`);
