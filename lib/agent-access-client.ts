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

export function agentRelayBase(): string {
  const configured = Constants.expoConfig?.extra?.agentRelayUrl;
  return typeof configured === "string" && configured.length > 0
    ? configured.replace(/\/$/, "")
    : "https://cablesnap-agent-relay.alankyshum.workers.dev";
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
