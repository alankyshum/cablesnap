import { DurableObject } from "cloudflare:workers";
import {
  AGENT_ACCESS_JSON_SCHEMA,
  AGENT_ACCESS_SCHEMA_VERSION,
  AGENT_ACCESS_SKILL,
  MAX_PROPOSALS_PER_SESSION,
  MAX_PROPOSAL_BYTES,
  MAX_SNAPSHOT_BYTES,
  validateAgentSnapshot,
  validateAgentTemplateProposal,
  type AgentSnapshot,
  type AgentTemplateProposal,
} from "../../../shared/agent-access";

type StoredSession = {
  ownerHash: string;
  agentHash: string;
  expiresAt: number;
  snapshot: AgentSnapshot;
};
type StoredProposal = { id: string; submittedAt: string; proposal: AgentTemplateProposal };

interface Env {
  AGENT_RELAY: DurableObjectNamespace<RelaySession>;
  CREATE_LIMITER: DurableObjectNamespace<CreationLimiter>;
  SESSION_TTL_SECONDS?: string;
  CREATE_RATE_LIMIT_PER_MINUTE?: string;
  WORKER_BASE_URL?: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

function response(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS });
}

function error(message: string, status: number): Response {
  return response({ error: message }, status);
}

async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function bearer(request: Request): string {
  const value = request.headers.get("Authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : "";
}

function authorizedToken(request: Request, url: URL): string {
  return bearer(request) || url.searchParams.get("token") || "";
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let different = 0;
  for (let index = 0; index < a.length; index++) different |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return different === 0;
}

function numericEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

async function readJson(request: Request, maximum: number): Promise<unknown> {
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > maximum) throw new RequestError("request body too large", 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maximum) throw new RequestError("request body too large", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new RequestError("invalid JSON", 400);
  }
}

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export class RelaySession extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS session (id INTEGER PRIMARY KEY CHECK(id = 1), owner_hash TEXT NOT NULL, agent_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, snapshot TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, submitted_at TEXT NOT NULL, proposal TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS session_state (id INTEGER PRIMARY KEY CHECK(id = 1), state TEXT NOT NULL);
      `);
    });
  }

  async create(session: StoredSession): Promise<void> {
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO session VALUES (1, ?, ?, ?, ?)", session.ownerHash, session.agentHash, session.expiresAt, JSON.stringify(session.snapshot));
    this.ctx.storage.sql.exec("DELETE FROM proposals");
    this.ctx.storage.sql.exec("DELETE FROM session_state");
    await this.ctx.storage.setAlarm(session.expiresAt);
  }

  async snapshot(agentHash: string): Promise<AgentSnapshot> {
    const row = this.active(agentHash, "agent");
    return JSON.parse(row.snapshot) as AgentSnapshot;
  }

  async submit(agentHash: string, proposal: AgentTemplateProposal): Promise<StoredProposal> {
    this.active(agentHash, "agent");
    const count = Number(this.ctx.storage.sql.exec("SELECT count(*) AS count FROM proposals").toArray()[0]?.count ?? 0);
    if (count >= MAX_PROPOSALS_PER_SESSION) throw new RequestError("proposal limit exceeded", 429);
    const item = { id: crypto.randomUUID(), submittedAt: new Date().toISOString(), proposal };
    this.ctx.storage.sql.exec("INSERT INTO proposals VALUES (?, ?, ?)", item.id, item.submittedAt, JSON.stringify(proposal));
    return item;
  }

  async poll(ownerHash: string): Promise<{ expiresAt: number; proposals: StoredProposal[] }> {
    const row = this.active(ownerHash, "owner");
    const proposals = this.ctx.storage.sql.exec<{ id: string; submitted_at: string; proposal: string }>(
      "SELECT id, submitted_at, proposal FROM proposals ORDER BY submitted_at ASC",
    ).toArray().map((entry) => ({ id: entry.id, submittedAt: entry.submitted_at, proposal: JSON.parse(entry.proposal) as AgentTemplateProposal }));
    return { expiresAt: row.expires_at, proposals };
  }

  async revoke(ownerHash: string): Promise<void> {
    this.active(ownerHash, "owner");
    this.deletePayloads("revoked");
    await this.ctx.storage.deleteAlarm();
  }

  async alarm(): Promise<void> {
    this.deletePayloads("expired");
  }

  private deletePayloads(state: "expired" | "revoked"): void {
    this.ctx.storage.sql.exec("DELETE FROM proposals");
    this.ctx.storage.sql.exec("DELETE FROM session");
    this.ctx.storage.sql.exec("INSERT OR REPLACE INTO session_state VALUES (1, ?)", state);
  }

  private active(tokenHash: string, role: "owner" | "agent"): { expires_at: number; snapshot: string } {
    const row = this.ctx.storage.sql.exec<{ owner_hash: string; agent_hash: string; expires_at: number; snapshot: string }>(
      "SELECT owner_hash, agent_hash, expires_at, snapshot FROM session WHERE id = 1",
    ).toArray()[0];
    if (!row) {
      const state = this.ctx.storage.sql.exec<{ state: string }>(
        "SELECT state FROM session_state WHERE id = 1",
      ).toArray()[0]?.state;
      throw new RequestError(state === "expired" ? "session expired" : "session revoked or not found", state === "expired" ? 410 : 401);
    }
    if (row.expires_at <= Date.now()) {
      this.deletePayloads("expired");
      throw new RequestError("session expired", 410);
    }
    const expected = role === "owner" ? row.owner_hash : row.agent_hash;
    if (!safeEqual(tokenHash, expected)) throw new RequestError("invalid token", 401);
    return row;
  }
}

export class CreationLimiter extends DurableObject<Env> {
  async allow(limit: number): Promise<boolean> {
    const now = Date.now();
    const stored = await this.ctx.storage.get<{ count: number; resetAt: number }>("window");
    if (!stored || stored.resetAt <= now) {
      await this.ctx.storage.put("window", { count: 1, resetAt: now + 60_000 });
      await this.ctx.storage.setAlarm(now + 60_000);
      return true;
    }
    if (stored.count >= limit) return false;
    await this.ctx.storage.put("window", { count: stored.count + 1, resetAt: stored.resetAt });
    return true;
  }
  async alarm(): Promise<void> { await this.ctx.storage.deleteAll(); }
}

function publicBase(request: Request, env: Env): string {
  return (env.WORKER_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
}

async function createSession(request: Request, env: Env): Promise<Response> {
  if (bearer(request)) return error("capability tokens cannot create sessions", 401);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const limit = numericEnv(env.CREATE_RATE_LIMIT_PER_MINUTE, 10, 1, 60);
  const allowed = await env.CREATE_LIMITER.getByName(await digest(ip)).allow(limit);
  if (!allowed) return error("session creation rate limit exceeded", 429);

  const body = await readJson(request, MAX_SNAPSHOT_BYTES + 1024) as { snapshot?: unknown; ttlSeconds?: number };
  const validated = validateAgentSnapshot(body.snapshot);
  if (!validated.success) return error(validated.error, 400);
  if (new TextEncoder().encode(JSON.stringify(validated.data)).byteLength > MAX_SNAPSHOT_BYTES) return error("snapshot too large", 413);
  const configuredTtl = numericEnv(env.SESSION_TTL_SECONDS, 1800, 30, 1800);
  const ttl = Number.isInteger(body.ttlSeconds)
    ? Math.max(30, Math.min(configuredTtl, body.ttlSeconds!))
    : configuredTtl;
  const sessionId = randomToken();
  const ownerToken = randomToken();
  const agentToken = randomToken();
  const expiresAt = Date.now() + ttl * 1000;
  const stub = env.AGENT_RELAY.getByName(sessionId);
  await stub.create({
    ownerHash: await digest(ownerToken),
    agentHash: await digest(agentToken),
    expiresAt,
    snapshot: validated.data,
  });
  const base = publicBase(request, env);
  const agentUrl = `${base}/v1/sessions/${sessionId}/snapshot?token=${encodeURIComponent(agentToken)}`;
  const proposalUrl = `${base}/v1/sessions/${sessionId}/proposals`;
  return response({
    sessionId,
    expiresAt,
    ownerToken,
    agentToken,
    agentUrl,
    proposalUrl,
    prompt: `Read ${base}/v1/skill.md, ${base}/v1/schema.json, and ${agentUrl}. If HTTP works, POST exactly one validated proposal to ${proposalUrl} with Authorization: Bearer ${agentToken}; otherwise return exactly one fenced JSON proposal for paste-back.`, 
  }, 201);
}

async function handleSession(request: Request, env: Env, url: URL, segments: string[]): Promise<Response> {
  const [, , sessionId, action] = segments;
  if (!sessionId) return error("not found", 404);
  const stub = env.AGENT_RELAY.getByName(sessionId);
  if (request.method === "GET" && action === "snapshot") {
    return response(await stub.snapshot(await digest(authorizedToken(request, url))));
  }
  const tokenHash = await digest(bearer(request));
  if (request.method === "GET" && action === "proposals") return response(await stub.poll(tokenHash));
  if (request.method === "POST" && action === "proposals") {
    const parsed = await readJson(request, MAX_PROPOSAL_BYTES);
    const validated = validateAgentTemplateProposal(parsed);
    if (!validated.success) return error(validated.error, 422);
    return response(await stub.submit(tokenHash, validated.data), 201);
  }
  if (request.method === "DELETE" && action === undefined) {
    await stub.revoke(tokenHash);
    return new Response(null, { status: 204, headers: CORS });
  }
  return error("not found", 404);
}

function publicResource(request: Request, url: URL): Response | null {
  if (request.method !== "GET") return null;
  if (url.pathname === "/") return response({ service: "cablesnap-agent-relay", schemaVersion: AGENT_ACCESS_SCHEMA_VERSION });
  if (url.pathname === "/v1/skill.md") return new Response(AGENT_ACCESS_SKILL, { headers: { ...CORS, "Content-Type": "text/markdown; charset=utf-8" } });
  if (url.pathname === "/v1/schema.json") return response(AGENT_ACCESS_JSON_SCHEMA);
  return null;
}

function caughtResponse(caught: unknown): Response {
  if (caught instanceof RequestError) return error(caught.message, caught.status);
  if (caught instanceof Error) {
    if (caught.message.includes("invalid token")) return error("invalid token", 401);
    if (caught.message.includes("session expired")) return error("session expired", 410);
    if (caught.message.includes("session revoked or not found")) return error("session revoked or not found", 401);
  }
  return error("internal error", 500);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
      const url = new URL(request.url);
      const published = publicResource(request, url);
      if (published) return published;
      if (request.method === "POST" && url.pathname === "/v1/sessions") return await createSession(request, env);
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments[0] === "v1" && segments[1] === "sessions") return await handleSession(request, env, url, segments);
      return error("not found", 404);
    } catch (caught) {
      return caughtResponse(caught);
    }
  },
};
