jest.mock("../../lib/db/settings", () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));
jest.mock("../../lib/coach-gym-photo", () => ({
  GYM_PHOTO_DISCLOSURE: "direct provider disclosure",
  hasGymPhotoConsent: jest.fn(),
  acceptGymPhotoConsent: jest.fn(),
  pickAndPrepareGymPhoto: jest.fn(),
  cleanupGymPhoto: jest.fn(),
}));

import { act, renderHook, waitFor } from "@testing-library/react-native";
import { useCoachGymPhoto } from "../../hooks/useCoachGymPhoto";
import * as photo from "../../lib/coach-gym-photo";
import * as settings from "../../lib/db/settings";

describe("useCoachGymPhoto", () => {
  const prepared = { uri: "file:///cache/gym.jpg", bytes: new Uint8Array([1]), mediaType: "image/jpeg" as const, width: 100, height: 100, delete: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (settings.getAppSetting as jest.Mock).mockResolvedValue(null);
    (photo.acceptGymPhotoConsent as jest.Mock).mockResolvedValue(undefined);
    (photo.pickAndPrepareGymPhoto as jest.Mock).mockResolvedValue(prepared);
  });

  it("hydrates stored consent and exposes the persistent disclosure without prompting", async () => {
    (settings.getAppSetting as jest.Mock).mockResolvedValue("accepted");
    (photo.hasGymPhotoConsent as jest.Mock).mockResolvedValue(true);
    const { result } = renderHook(() => useCoachGymPhoto());
    await waitFor(() => expect(result.current.consented).toBe(true));
    expect(result.current.disclosure).toBe("direct provider disclosure");
    expect(photo.acceptGymPhotoConsent).not.toHaveBeenCalled();
  });

  it("cleans the old prepared file before replacement and clears it explicitly", async () => {
    const { result } = renderHook(() => useCoachGymPhoto());
    await act(async () => { await result.current.pick(); });
    await act(async () => { result.current.cleanup(); });
    expect(photo.cleanupGymPhoto).toHaveBeenCalledWith(prepared);
  });

  it("does not retain a stale replacement when preparation is cancelled or fails", async () => {
    const { result } = renderHook(() => useCoachGymPhoto());
    await act(async () => { await result.current.pick(); });
    (photo.pickAndPrepareGymPhoto as jest.Mock).mockRejectedValueOnce({ kind: "photo_cancelled" });
    await expect(result.current.pick()).rejects.toEqual({ kind: "photo_cancelled" });
    expect(photo.cleanupGymPhoto).toHaveBeenCalledWith(prepared);
    await act(async () => { result.current.cleanup(); });
    expect(photo.cleanupGymPhoto).toHaveBeenCalledWith(null);
    expect((photo.cleanupGymPhoto as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
