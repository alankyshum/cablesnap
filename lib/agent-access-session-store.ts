import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AgentSession } from "./agent-access-client";

export const AGENT_SESSION_STORAGE_KEY = "agent-access-active-session-v1";

export async function loadStoredAgentSession(): Promise<AgentSession | null> {
  if (Platform.OS === "web") return null;
  const raw = await SecureStore.getItemAsync(AGENT_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as AgentSession;
    if (!Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || !session.sessionId || !session.ownerToken) {
      await clearStoredAgentSession();
      return null;
    }
    return session;
  } catch {
    await clearStoredAgentSession();
    return null;
  }
}

export async function saveStoredAgentSession(session: AgentSession): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.setItemAsync(AGENT_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export async function clearStoredAgentSession(): Promise<void> {
  if (Platform.OS === "web") return;
  await SecureStore.deleteItemAsync(AGENT_SESSION_STORAGE_KEY);
}
