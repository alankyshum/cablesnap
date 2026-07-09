import { getOrCreateAnonUserId, clearCachedAnonUserId } from "../../lib/anon-user";
import { getAppSetting, setAppSetting } from "../../lib/db/settings";

jest.mock("../../lib/db/settings", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));

jest.mock("../../lib/uuid", () => ({
  uuid: () => "mocked-uuid-9999",
}));

describe("anon-user identity helper", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCachedAnonUserId();
  });

  it("generates a new uuid once, persists it to settings, and caches it", async () => {
    (getAppSetting as jest.Mock).mockResolvedValue(null);
    (setAppSetting as jest.Mock).mockResolvedValue(undefined);

    const id1 = await getOrCreateAnonUserId();
    expect(id1).toBe("mocked-uuid-9999");
    expect(getAppSetting).toHaveBeenCalledWith("anon_user_id");
    expect(setAppSetting).toHaveBeenCalledWith("anon_user_id", "mocked-uuid-9999");

    jest.clearAllMocks();

    // Second call should return cached without DB lookups
    const id2 = await getOrCreateAnonUserId();
    expect(id2).toBe("mocked-uuid-9999");
    expect(getAppSetting).not.toHaveBeenCalled();
    expect(setAppSetting).not.toHaveBeenCalled();
  });

  it("reads existing anon_user_id from settings and caches it", async () => {
    (getAppSetting as jest.Mock).mockResolvedValue("existing-uuid-1111");

    const id1 = await getOrCreateAnonUserId();
    expect(id1).toBe("existing-uuid-1111");
    expect(getAppSetting).toHaveBeenCalledWith("anon_user_id");
    expect(setAppSetting).not.toHaveBeenCalled();

    jest.clearAllMocks();

    const id2 = await getOrCreateAnonUserId();
    expect(id2).toBe("existing-uuid-1111");
    expect(getAppSetting).not.toHaveBeenCalled();
  });
});
