// Mock useFocusEffect as useEffect so it fires immediately in tests
jest.mock("@react-navigation/native", () => {
  const RealReact = require("react");
  return {
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === "function" ? cleanup : undefined;
      }, []);
    },
  };
});

// Mock getBodySettings directly
const mockGetBodySettings = jest.fn();
jest.mock("../../lib/db/body", () => ({
  getBodySettings: (...args: unknown[]) => mockGetBodySettings(...args),
}));

import { renderHook, waitFor } from "@testing-library/react-native";
import { useProfileGender } from "../../lib/useProfileGender";

beforeEach(() => {
  mockGetBodySettings.mockReset();
});

describe("useProfileGender", () => {
  it("defaults to male when body settings has default sex", async () => {
    mockGetBodySettings.mockResolvedValue({ id: "default", weight_unit: "kg", measurement_unit: "cm", sex: "male", weight_goal: null, body_fat_goal: null, updated_at: 0 });
    const { result } = renderHook(() => useProfileGender());
    await waitFor(() => {
      expect(mockGetBodySettings).toHaveBeenCalled();
    });
    expect(result.current).toBe("male");
  });

  it("returns female when body settings sex is female", async () => {
    mockGetBodySettings.mockResolvedValue({ id: "default", weight_unit: "kg", measurement_unit: "cm", sex: "female", weight_goal: null, body_fat_goal: null, updated_at: 0 });
    const { result } = renderHook(() => useProfileGender());
    await waitFor(() => {
      expect(result.current).toBe("female");
    });
  });

  it("defaults to male when DB throws an error", async () => {
    mockGetBodySettings.mockRejectedValue(new Error("DB error"));
    const { result } = renderHook(() => useProfileGender());
    await waitFor(() => {
      expect(mockGetBodySettings).toHaveBeenCalled();
    });
    expect(result.current).toBe("male");
  });
});
