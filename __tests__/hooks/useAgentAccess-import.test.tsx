// BLD-5100: review UI must not mark a proposal imported when durable persistence fails.
import { act, renderHook } from "@testing-library/react-native";

const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockImportAgentTemplate = jest.fn();

jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({ error: mockToastError, success: mockToastSuccess }),
}));
jest.mock("@/lib/db/agent-access", () => ({
  getAgentExerciseNames: jest.fn(async () => ({})),
  importAgentTemplate: (...args: unknown[]) => mockImportAgentTemplate(...args),
}));
jest.mock("@/lib/agent-access-client", () => ({
  createAgentSession: jest.fn(), pollAgentSession: jest.fn(), revokeAgentSession: jest.fn(),
}));
jest.mock("@/lib/agent-access-snapshot", () => ({ buildAgentSnapshot: jest.fn() }));
jest.mock("@/lib/agent-access-session-store", () => ({
  clearStoredAgentSession: jest.fn(async () => undefined),
  loadStoredAgentSession: jest.fn(async () => null),
  saveStoredAgentSession: jest.fn(),
}));

import { useAgentAccess } from "../../hooks/useAgentAccess";

const proposal = {
  schemaVersion: "1" as const,
  kind: "template-proposal" as const,
  template: { name: "Rolled back", exercises: [{ exerciseId: "bench-press", targetSets: 3, targetReps: "8", restSeconds: 90 }] },
};

describe("BLD-5100 Agent access review failure", () => {
  it("reports durable import failure and leaves the proposal unimported", async () => {
    mockImportAgentTemplate.mockRejectedValue(new Error("Workout template transaction did not persist completely"));
    const { result } = renderHook(() => useAgentAccess());

    await act(async () => {
      await expect(result.current.importProposal(proposal, "proposal-1")).resolves.toBeNull();
    });

    expect(mockToastError).toHaveBeenCalledWith("Workout template transaction did not persist completely");
    expect(mockToastSuccess).not.toHaveBeenCalled();
    expect(result.current.importedIds.has("proposal-1")).toBe(false);
  });
});
