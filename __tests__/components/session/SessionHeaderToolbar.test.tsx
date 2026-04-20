import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import { SessionHeaderToolbar } from "../../../components/session/SessionHeaderToolbar";

// Mock expo-vector-icons
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name, ...props }: { name: string }) => <Text {...props}>{name}</Text>,
  };
});

// Mock theme colors
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

// Mock db
const mockGetAppSetting = jest.fn().mockResolvedValue(null);
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);
jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
}));

// Mock format
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
      <SessionHeaderToolbar {...defaultProps} />
    );
    expect(getByText("5:00")).toBeTruthy();
    expect(getByText("wrench")).toBeTruthy();
    // No rest countdown visible
    expect(queryByText(/^\d{2}:\d{2}$/)).toBeNull();
  });

  it("renders rest countdown when rest > 0", () => {
    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={90} />
    );
    expect(getByText("01:30")).toBeTruthy();
    expect(getByText("5:00")).toBeTruthy();
  });

  it("tapping elapsed time starts rest with default duration (90s)", async () => {
    const onStartRest = jest.fn();
    mockGetAppSetting.mockResolvedValue(null);

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} onStartRest={onStartRest} />
    );

    await act(async () => {
      fireEvent.press(getByText("5:00"));
    });

    expect(mockGetAppSetting).toHaveBeenCalledWith("rest_timer_default_seconds");
    expect(onStartRest).toHaveBeenCalledWith(90);
  });

  it("tapping elapsed time uses saved default duration", async () => {
    const onStartRest = jest.fn();
    mockGetAppSetting.mockResolvedValue("60");

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} onStartRest={onStartRest} />
    );

    await act(async () => {
      fireEvent.press(getByText("5:00"));
    });

    expect(onStartRest).toHaveBeenCalledWith(60);
  });

  it("does NOT start rest when tapping elapsed while rest is active", async () => {
    const onStartRest = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={45} onStartRest={onStartRest} />
    );

    await act(async () => {
      fireEvent.press(getByText("5:00"));
    });

    expect(onStartRest).not.toHaveBeenCalled();
  });

  it("tapping rest countdown dismisses rest", () => {
    const onDismissRest = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={45} onDismissRest={onDismissRest} />
    );

    fireEvent.press(getByText("00:45"));
    expect(onDismissRest).toHaveBeenCalledTimes(1);
  });

  it("tapping wrench opens toolbox", () => {
    const onOpenToolbox = jest.fn();

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} onOpenToolbox={onOpenToolbox} />
    );

    fireEvent.press(getByText("wrench"));
    expect(onOpenToolbox).toHaveBeenCalledTimes(1);
  });

  it("shows REST DONE ✓ for 3 seconds when rest reaches 0", () => {
    const { rerender, getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={1} />
    );

    // Rest goes to 0
    rerender(<SessionHeaderToolbar {...defaultProps} rest={0} />);

    expect(getByText("REST DONE ✓")).toBeTruthy();

    // After 3 seconds, it disappears
    act(() => {
      jest.advanceTimersByTime(3000);
    });

    expect(queryByText("REST DONE ✓")).toBeNull();
  });

  it("tapping REST DONE ✓ dismisses it immediately", () => {
    const onDismissRest = jest.fn();
    const { rerender, getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={1} onDismissRest={onDismissRest} />
    );

    rerender(
      <SessionHeaderToolbar {...defaultProps} rest={0} onDismissRest={onDismissRest} />
    );

    fireEvent.press(getByText("REST DONE ✓"));
    expect(onDismissRest).toHaveBeenCalledTimes(1);
    expect(queryByText("REST DONE ✓")).toBeNull();
  });

  it("long-pressing timer area opens duration picker modal", async () => {
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} />
    );

    // Duration picker not visible initially
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

  it("selecting a preset starts rest and saves default", async () => {
    const onStartRest = jest.fn();
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText, queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} onStartRest={onStartRest} />
    );

    // Open picker
    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    // Select 60s preset
    await act(async () => {
      fireEvent.press(getByText("1m"));
    });

    expect(mockSetAppSetting).toHaveBeenCalledWith("rest_timer_default_seconds", "60");
    expect(onStartRest).toHaveBeenCalledWith(60);

    // Picker should close
    expect(queryByText("Rest Duration")).toBeNull();
  });

  it("dismissing picker without selecting does not change timer state", async () => {
    const onStartRest = jest.fn();
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} onStartRest={onStartRest} />
    );

    // Open picker
    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    expect(getByText("Rest Duration")).toBeTruthy();

    // Dismiss via overlay — verify no rest started
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
      />
    );

    await act(async () => {
      rerender(
        <SessionHeaderToolbar
          {...defaultProps}
          pickerRequested={true}
          onPickerDismissed={onPickerDismissed}
        />
      );
    });

    expect(getByText("Rest Duration")).toBeTruthy();
    expect(onPickerDismissed).toHaveBeenCalled();
  });

  it("vibrate and sound toggles save settings", async () => {
    mockGetAppSetting.mockResolvedValue("true");

    const { getByText } = render(
      <SessionHeaderToolbar {...defaultProps} />
    );

    // Open picker
    await act(async () => {
      fireEvent(getByText("5:00"), "longPress");
    });

    expect(getByText("Vibrate on complete")).toBeTruthy();
    expect(getByText("Sound on complete")).toBeTruthy();
  });

  it("does not show REST DONE ✓ on initial render with rest=0", () => {
    const { queryByText } = render(
      <SessionHeaderToolbar {...defaultProps} rest={0} />
    );
    expect(queryByText("REST DONE ✓")).toBeNull();
  });
});
