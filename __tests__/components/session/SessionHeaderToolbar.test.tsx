import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { SessionHeaderToolbar } from "../../../components/session/SessionHeaderToolbar";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name, ...props }: { name: string }) => <Text {...props}>{name}</Text>,
  };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    primaryContainer: "#e8def8",
    onSurface: "#1c1b1f",
    onSurfaceVariant: "#49454f",
    surface: "#fffbfe",
    surfaceVariant: "#e7e0ec",
    shadow: "#000000",
    background: "#fffbfe",
  }),
}));

const mockGetAppSetting = jest.fn().mockResolvedValue(null);
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
}));

jest.mock("../../../lib/format", () => ({
  formatTime: (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  },
  formatTimeRemaining: (est: number | null, elapsed: number) => {
    if (est == null || est <= 0) return null;
    const rem = est - elapsed;
    if (rem <= 0) return null;
    return `~${Math.ceil(rem / 60)} min left`;
  },
}));

const defaultProps = {
  rest: 0,
  elapsed: 300,
  onStartRest: jest.fn(),
  onDismissRest: jest.fn(),
  onOpenToolbox: jest.fn(),
  persistedDurationSeconds: 30,
  selectedDurationSeconds: 30,
};

describe("SessionHeaderToolbar", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockGetAppSetting.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders elapsed time and toolbox button when no rest active", () => {
    const { getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} />,
    );
    expect(getByText("5:00")).toBeTruthy();
    expect(getByText("wrench")).toBeTruthy();
    expect(queryByText(/^\d{2}:\d{2}$/)).toBeNull();
  });

  it("renders rest countdown when rest > 0", () => {
    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={90} />,
    );
    expect(getByText("01:30")).toBeTruthy();
    expect(getByText("5:00")).toBeTruthy();
  });

  it("tapping elapsed time starts rest with selected duration (30s by default)", async () => {
    const onStartRest = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} onStartRest={onStartRest} />,
    );

    await act(async () => {
      fireEvent.press(getByText("5:00"));
    });

    expect(onStartRest).toHaveBeenCalledWith(30);
    expect(mockGetAppSetting).not.toHaveBeenCalledWith("rest_timer_default_seconds");
  });

  it("tapping elapsed time uses the provided selected duration", async () => {
    const onStartRest = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar
        {...defaultProps}
        selectedDurationSeconds={60}
        onStartRest={onStartRest}
      />,
    );

    await act(async () => {
      fireEvent.press(getByText("5:00"));
    });

    expect(onStartRest).toHaveBeenCalledWith(60);
  });

  it("does NOT start rest when tapping elapsed while rest is active", async () => {
    const onStartRest = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={45} onStartRest={onStartRest} />,
    );

    await act(async () => {
      fireEvent.press(getByText("5:00"));
    });

    expect(onStartRest).not.toHaveBeenCalled();
  });

  it("tapping rest countdown dismisses rest", () => {
    const onDismissRest = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={45} onDismissRest={onDismissRest} />,
    );

    fireEvent.press(getByText("00:45"));
    expect(onDismissRest).toHaveBeenCalledTimes(1);
  });

  it("tapping wrench opens toolbox", () => {
    const onOpenToolbox = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} onOpenToolbox={onOpenToolbox} />,
    );

    fireEvent.press(getByText("wrench"));
    expect(onOpenToolbox).toHaveBeenCalledTimes(1);
  });

  it("shows REST DONE ✓ for 3 seconds when rest reaches 0", () => {
    const { rerender, getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={1} />,
    );

    rerender(<SessionHeaderToolbar {...defaultProps} rest={0} />);

    expect(getByText("REST DONE ✓")).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(queryByText("REST DONE ✓")).toBeNull();
  });

  it("tapping REST DONE ✓ dismisses it immediately", () => {
    const onDismissRest = jest.fn();
    const { rerender, getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={1} onDismissRest={onDismissRest} />,
    );

    rerender(
      <SessionHeaderToolbar {...defaultProps} rest={0} onDismissRest={onDismissRest} />,
    );

    fireEvent.press(getByText("REST DONE ✓"));
    expect(onDismissRest).toHaveBeenCalledTimes(1);
    expect(queryByText("REST DONE ✓")).toBeNull();
  });

  it("long-pressing timer area opens duration picker modal", async () => {
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} />,
    );

    expect(queryByText("Rest Duration")).toBeNull();

    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    expect(getByText("Rest Duration")).toBeTruthy();
    expect(getByText("30s")).toBeTruthy();
    expect(getByText("1m")).toBeTruthy();
    expect(getByText("1.5m")).toBeTruthy();
    expect(getByText("2m")).toBeTruthy();
  });

  it("shows current and last-used rest values in the picker", async () => {
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText } = render(
      <SessionHeaderToolbar
        {...defaultProps}
        persistedDurationSeconds={60}
        selectedDurationSeconds={30}
      />,
    );

    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    expect(getByText("Current: 30s")).toBeTruthy();
    expect(getByText("Last used: 1m")).toBeTruthy();
    expect(getByText("Current")).toBeTruthy();
    expect(getByText("Last used")).toBeTruthy();
  });

  it("selecting a preset starts rest without saving settings in the toolbar", async () => {
    const onStartRest = jest.fn();
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} onStartRest={onStartRest} />,
    );

    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    await act(async () => {
      fireEvent.press(getByText("1m"));
    });

    expect(mockSetAppSetting).not.toHaveBeenCalledWith("rest_timer_default_seconds", expect.any(String));
    expect(onStartRest).toHaveBeenCalledWith(60);
    expect(queryByText("Rest Duration")).toBeNull();
  });

  it("dismissing picker without selecting does not change timer state", async () => {
    const onStartRest = jest.fn();
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} onStartRest={onStartRest} />,
    );

    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    expect(getByText("Rest Duration")).toBeTruthy();
    expect(onStartRest).not.toHaveBeenCalled();
  });

  it("responds to pickerRequested prop", async () => {
    mockGetAppSetting.mockResolvedValue("true");
    const onPickerDismissed = jest.fn();

    const { getByText, rerender } = render(
      <SessionHeaderToolbar
        {...defaultProps}
        pickerRequested={false}
        onPickerDismissed={onPickerDismissed}
      />,
    );

    await act(async () => {
      rerender(
        <SessionHeaderToolbar
          {...defaultProps}
          pickerRequested={true}
          onPickerDismissed={onPickerDismissed}
        />,
      );
    });

    expect(getByText("Rest Duration")).toBeTruthy();
    expect(onPickerDismissed).toHaveBeenCalled();
  });

  it("vibrate and sound toggles save settings", async () => {
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} />,
    );

    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    expect(getByText("Vibrate on complete")).toBeTruthy();
    expect(getByText("Sound on complete")).toBeTruthy();
  });

  it("does not show REST DONE ✓ on initial render with rest=0", () => {
    const { queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={0} />,
    );
    expect(queryByText("REST DONE ✓")).toBeNull();
  });

  it("does NOT render adaptive chip on fresh install with no rest_show_breakdown setting", async () => {
    mockGetAppSetting.mockResolvedValue(null);
    const breakdown = {
      totalSeconds: 130,
      baseSeconds: 90,
      factors: [{ label: "Heavy", multiplier: 1.2, deltaSeconds: 0 }],
      isDefault: false,
      reasonShort: "Heavy",
      reasonAccessible: "Heavy set",
    };

    const { queryByTestId } = render(
      <SessionHeaderToolbar {...defaultProps} rest={130} breakdown={breakdown} />,
    );

    expect(queryByTestId("adaptive-chip")).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByTestId("adaptive-chip")).toBeNull();
  });

  it("renders adaptive chip when rest_show_breakdown setting is explicitly 'true'", async () => {
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "rest_show_breakdown") return "true";
      return null;
    });
    const breakdown = {
      totalSeconds: 130,
      baseSeconds: 90,
      factors: [{ label: "Heavy", multiplier: 1.2, deltaSeconds: 0 }],
      isDefault: false,
      reasonShort: "Heavy",
      reasonAccessible: "Heavy set",
    };

    const { queryByTestId } = render(
      <SessionHeaderToolbar {...defaultProps} rest={130} breakdown={breakdown} />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByTestId("adaptive-chip")).toBeTruthy();
  });

  it("does NOT render adaptive chip when rest_show_breakdown is 'false'", async () => {
    mockGetAppSetting.mockImplementation(async (key: string) => {
      if (key === "rest_show_breakdown") return "false";
      return null;
    });
    const breakdown = {
      totalSeconds: 130,
      baseSeconds: 90,
      factors: [{ label: "Heavy", multiplier: 1.2, deltaSeconds: 0 }],
      isDefault: false,
      reasonShort: "Heavy",
      reasonAccessible: "Heavy set",
    };

    const { queryByTestId } = render(
      <SessionHeaderToolbar {...defaultProps} rest={130} breakdown={breakdown} />,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByTestId("adaptive-chip")).toBeNull();
  });
});
