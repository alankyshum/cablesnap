import Constants from "expo-constants";
import type { AgentSnapshot, AgentTemplateProposal } from "@/shared/agent-access";

export type AgentProposal = {
  id: string;
  submittedAt: string;
  proposal: AgentTemplateProposal;
};
export type AgentSession = {
  sessionId: string;
  expiresAt: number;
  ownerToken: string;
  agentToken: string;
  agentUrl: string;
  proposalUrl: string;
  prompt: string;
};

export const AGENT_RELAY_ORIGIN = "https://cablesnap-agent-relay.alankyshum.workers.dev";

export function resolveAgentRelayOrigin(candidate?: string, allowLocal = __DEV__): string {
  if (candidate === undefined) return AGENT_RELAY_ORIGIN;
  try {
    const url = new URL(candidate);
    const isProduction = url.origin === AGENT_RELAY_ORIGIN;
    const isLocal = allowLocal && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if ((isProduction || isLocal) && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password) {
      return url.origin;
    }
  } catch {
    // Reject invalid or non-allowlisted origins below.
  }
  throw new Error("Agent access relay origin is not allowed.");
}

export function agentRelayBase(): string {
  const configured = Constants.expoConfig?.extra?.agentRelayUrl;
  return resolveAgentRelayOrigin(typeof configured === "string" ? configured : undefined);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${agentRelayBase()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error || `Agent access request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function createAgentSession(snapshot: AgentSnapshot, ttlSeconds?: number): Promise<AgentSession> {
  return request<AgentSession>("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({ snapshot, ...(ttlSeconds === undefined ? {} : { ttlSeconds }) }),
  });
}

export async function pollAgentSession(session: Pick<AgentSession, "sessionId" | "ownerToken">) {
  return request<{ expiresAt: number; proposals: AgentProposal[] }>(
    `/v1/sessions/${session.sessionId}/proposals`,
    { method: "GET", headers: { Authorization: `Bearer ${session.ownerToken}` } },
  );
}

export async function revokeAgentSession(session: Pick<AgentSession, "sessionId" | "ownerToken">): Promise<void> {
  const response = await fetch(`${agentRelayBase()}/v1/sessions/${session.sessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.ownerToken}` },
  });
  if (!response.ok) throw new Error(`Could not revoke Agent access (${response.status})`);
}
