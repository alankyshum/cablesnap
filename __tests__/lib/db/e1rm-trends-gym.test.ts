const mockQuery = jest.fn();

jest.mock("../../../lib/db/helpers", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { getE1RMTrends, getE1RMTrendsByGym } from "../../../lib/db/e1rm-trends";

describe("e1rm trend gym query branching", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockResolvedValue([]);
  });

  it("uses the all-gyms SQL path when gymId is omitted", async () => {
    await getE1RMTrends();

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).not.toContain("OR ? IS NULL");
    expect(sql).not.toContain("wss.gym_id = ?");
    expect(params).toHaveLength(3);
  });

  it("uses the gym-scoped SQL path when a gymId is provided", async () => {
    await getE1RMTrends("gym-1");

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("wss.gym_id = ?");
    expect(sql).not.toContain("OR ? IS NULL");
    expect(params).toEqual(expect.arrayContaining(["gym-1"]));
    expect(params).toHaveLength(5);
  });

  it("keeps the explicit gym wrapper wired to the gym-scoped query", async () => {
    await getE1RMTrendsByGym("gym-2");

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("wss.gym_id = ?");
    expect(params[0]).toBe("gym-2");
  });
});
