// BLD-5100: covers native restart recovery and secure cleanup for AC20.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import {
  AGENT_SESSION_STORAGE_KEY,
  clearStoredAgentSession,
  loadStoredAgentSession,
  saveStoredAgentSession,
} from "../../lib/agent-access-session-store";
import type { AgentSession } from "../../lib/agent-access-client";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(),
}));

const session: AgentSession = {
  sessionId: "session",
  expiresAt: Date.now() + 60_000,
  ownerToken: "owner",
  agentToken: "agent",
  agentUrl: "https://example.test/snapshot?token=agent",
  proposalUrl: "https://example.test/proposals",
  prompt: "prompt",
};

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
});

test("BLD-5100 AC20 recovers an active owner session from SecureStore", async () => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(session));
  await expect(loadStoredAgentSession()).resolves.toEqual(session);
});

test("BLD-5100 AC20 stores the owner token securely and clears it on expiry", async () => {
  await saveStoredAgentSession(session);
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(AGENT_SESSION_STORAGE_KEY, JSON.stringify(session));
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify({ ...session, expiresAt: 1 }));
  await expect(loadStoredAgentSession()).resolves.toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(AGENT_SESSION_STORAGE_KEY);
});

test("BLD-5100 AC20 revoke clears the owner capability", async () => {
  await clearStoredAgentSession();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(AGENT_SESSION_STORAGE_KEY);
});
