// BLD-5100: import durability blocks false success after an implicit SQLite rollback.
const mockSelectAll = jest.fn();
const mockInsertValues = jest.fn();
const mockWithTransaction = jest.fn(async (callback: () => Promise<void>) => callback());
const mockGetTemplateById = jest.fn();

jest.mock("../../../lib/db/helpers", () => ({
  getDrizzle: jest.fn(async () => ({
    select: () => ({ from: () => ({ where: () => ({ all: mockSelectAll }) }) }),
    insert: () => ({ values: mockInsertValues }),
  })),
  withTransaction: (callback: () => Promise<void>) => mockWithTransaction(callback),
}));
jest.mock("../../../lib/db/templates", () => ({
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
}));
jest.mock("../../../lib/uuid", () => ({ uuid: () => "agent-template-id" }));

import { importAgentTemplate } from "../../../lib/db/agent-access";

const proposal = {
  schemaVersion: "1" as const,
  kind: "template-proposal" as const,
  template: {
    name: "Rolled back proposal",
    exercises: [{ exerciseId: "bench-press", targetSets: 3, targetReps: "8-10", restSeconds: 120 }],
  },
};

describe("BLD-5100 Agent access import durability", () => {
  beforeEach(() => {
    mockSelectAll.mockResolvedValue([{ id: "bench-press" }]);
    mockInsertValues.mockResolvedValue(undefined);
    mockWithTransaction.mockImplementation(async (callback) => callback());
    mockGetTemplateById.mockResolvedValue({ id: "agent-template-id", exercises: [] });
  });

  it("rejects a swallowed rollback instead of reporting a template import", async () => {
    await expect(importAgentTemplate(proposal)).rejects.toThrow("Workout template transaction did not persist completely");
    expect(mockGetTemplateById).toHaveBeenCalledWith("agent-template-id");
  });
});
