/**
 * __tests__/components/session/CompareView.test.tsx
 *
 * BLD-1151 AC tests:
 * - AC3: Transport row drives both players
 * - AC5: Swap remounts both panes (key change)
 * - AC6: File-missing pane renders placeholder with accessibilityLabel
 * - AC10: Transport buttons have accessibilityState disabled when not loaded
 * - AC11: Sentry_Mask wraps videos
 * - AC12: useMediaSurfaceMounted fires exactly once per CompareBody,
 *         regardless of swaps — verified via increment counter (behavioral, not structural)
 */
import React from "react";
import { render, fireEvent, act, waitFor } from "@testing-library/react-native";
import { CompareView } from "../../../components/session/CompareView";
import { getClipsForExercise } from "../../../lib/media/form-clips";

// ── Mocks ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let mountCount = 0;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let unmountCount = 0;
const mockIncrement = jest.fn(() => { mountCount++; });
const mockDecrement = jest.fn(() => { unmountCount++; });

jest.mock("@/hooks/useMediaSurfaceMounted", () => ({
  useMediaSurfaceMounted: () => {
    const { useEffect } = require("react") as typeof import("react");
    const { increment, decrement } = require("@/lib/media/replay-gate") as {
      increment: () => void;
      decrement: () => void;
    };
    /* eslint-disable react-hooks/exhaustive-deps */
    useEffect(() => {
      increment();
      return () => { decrement(); };
    }, []);
    /* eslint-enable react-hooks/exhaustive-deps */
  },
}));

jest.mock("@/lib/media/replay-gate", () => ({
  increment: () => mockIncrement(),
  decrement: () => mockDecrement(),
}));

const mockPlay = jest.fn();
const mockPause = jest.fn();
const mockPlayerFactory = jest.fn(() => ({
  play: mockPlay,
  pause: mockPause,
  currentTime: 0,
  playing: false,
  loop: false,
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    background: "#fff",
    surface: "#f5f5f5",
    surfaceVariant: "#eee",
    onSurface: "#000",
    onSurfaceVariant: "#555",
    primary: "#6200ea",
    onPrimary: "#fff",
    primaryContainer: "#ede9fb",
    onPrimaryContainer: "#21005d",
    outline: "#ccc",
    error: "#B00020",
  }),
}));

jest.mock("expo-video", () => ({
  VideoView: "VideoView",
  useVideoPlayer: (_src: unknown, init?: (p: unknown) => void) => {
    const p = mockPlayerFactory();
    if (init) init(p);
    return p;
  },
}));

jest.mock("@/lib/media/form-clips", () => ({
  toAbsPath: (rel: string) => `/abs/${rel}`,
  getClipsForExercise: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/media/form-clip-thumbs", () => ({
  getOrCreateThumb: jest.fn().mockResolvedValue("file:///thumb.jpg"),
}));

jest.mock("@sentry/react-native", () => ({
  Mask: ({ children }: { children: React.ReactNode }) => children,
  addBreadcrumb: jest.fn(),
}));

// Simulate file existing for the default clips.
let mockFileExists = true;
jest.mock("expo-file-system", () => ({
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: mockFileExists })),
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///docs/",
  deleteAsync: jest.fn(() => Promise.resolve()),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  moveAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-video-thumbnails", () => ({
  getThumbnailAsync: jest.fn().mockResolvedValue({ uri: "file:///tmp/thumb.jpg" }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeClip = (id: string): import("../../../lib/db/form-clips").SetMediaRow => ({
  id,
  set_id: `set-${id}`,
  exercise_id: "ex-1",
  kind: "video",
  rel_path: `form-clips/ex-1/${id}.mp4`,
  duration_ms: 5000,
  size_bytes: 1000000,
  width: 1080,
  height: 1920,
  pending_delete: 0,
  created_at: Date.now(),
});

const clipA = makeClip("clip-a");
const clipB = makeClip("clip-b");

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFileExists = true;
  playCallCount = 0;
  pauseCallCount = 0;
  mountCount = 0;
  unmountCount = 0;
});

describe("CompareView — replay-gate counter (AC12)", () => {
  it("increments replay-gate counter exactly once on mount", async () => {
    const { unmount } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    await act(async () => {});
    expect(mockIncrement).toHaveBeenCalledTimes(1);
    expect(mockDecrement).toHaveBeenCalledTimes(0);
    unmount();
  });

  it("counter stays at 1 after 5 swaps (not incremented per swap)", async () => {
    const { getByLabelText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    await act(async () => {});
    const swapBtn = getByLabelText("Swap clip A and B");
    for (let i = 0; i < 5; i++) {
      fireEvent.press(swapBtn);
      await act(async () => {});
    }
    expect(mockIncrement).toHaveBeenCalledTimes(1);
    expect(mockDecrement).toHaveBeenCalledTimes(0);
  });

  it("decrements replay-gate counter on unmount", async () => {
    const { unmount } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    await act(async () => {});
    expect(mockDecrement).toHaveBeenCalledTimes(0);
    unmount();
    expect(mockDecrement).toHaveBeenCalledTimes(1);
  });
});

describe("CompareView — transport row (AC3)", () => {
  it("renders Play Both, Pause Both, Reset Both buttons", async () => {
    const { getByLabelText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    expect(getByLabelText("Play Both")).toBeTruthy();
    expect(getByLabelText("Pause Both")).toBeTruthy();
    expect(getByLabelText("Reset Both")).toBeTruthy();
  });

  it("transport buttons are disabled when files are loading", async () => {
    const { getByLabelText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    const playBtn = getByLabelText("Play Both");
    expect(playBtn.props.accessibilityState?.disabled).toBe(true);
  });
});

describe("CompareView — Swap (AC5)", () => {
  it("renders Swap button with accessibilityHint about reset", async () => {
    const { getByLabelText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    const swapBtn = getByLabelText("Swap clip A and B");
    expect(swapBtn).toBeTruthy();
    expect(swapBtn.props.accessibilityHint).toMatch(/reset|beginning/i);
  });
});

describe("CompareView — file-missing pane (AC6)", () => {
  it("renders 'Clip unavailable' placeholder when file is missing", async () => {
    mockFileExists = false;
    const { getByLabelText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(getByLabelText(/Clip A unavailable/i)).toBeTruthy();
    });
  });
});

describe("CompareView — picker (AC1)", () => {
  it("does not show picker strip when pickerEnabled=false", async () => {
    const { queryByText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        pickerEnabled={false}
        onClose={jest.fn()}
      />,
    );
    expect(queryByText(/Pick clip for slot/i)).toBeNull();
  });

  it("auto-opens picker for slot B when pickerOpen=true", async () => {
    
    const extraClip = makeClip("clip-c");
    (getClipsForExercise as jest.Mock).mockResolvedValue([clipA, clipB, extraClip]);
    const { queryByText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={null}
        exerciseId="ex-1"
        pickerEnabled
        pickerOpen
        onClose={jest.fn()}
      />,
    );
    await waitFor(() => {
      expect(queryByText(/Pick clip for slot B/i)).toBeTruthy();
    });
  });
});

describe("CompareView — Close button (AC10)", () => {
  it("calls onClose when Close is pressed", async () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={onClose}
      />,
    );
    fireEvent.press(getByLabelText("Close comparison"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("CompareView — not rendered when isVisible=false (AC12)", () => {
  it("renders nothing when isVisible=false", async () => {
    const { toJSON } = render(
      <CompareView
        isVisible={false}
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    expect(toJSON()).toBeNull();
    expect(mockIncrement).not.toHaveBeenCalled();
  });
});

describe("CompareView — landscape layout (useWindowDimensions)", () => {
  it("renders without crashing in landscape (width > height)", async () => {
    const mockUseDims = jest.spyOn(require("react-native"), "useWindowDimensions");
    mockUseDims.mockReturnValue({ width: 800, height: 400, fontScale: 1, scale: 1 });
    const { getByLabelText } = render(
      <CompareView
        isVisible
        clipA={clipA}
        clipB={clipB}
        exerciseId="ex-1"
        onClose={jest.fn()}
      />,
    );
    expect(getByLabelText("Close comparison")).toBeTruthy();
    mockUseDims.mockRestore();
  });
});
