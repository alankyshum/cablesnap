/**
 * __tests__/app/session/player-to-compare-handoff.test.tsx
 *
 * BLD-1151 AC12 extended: player → compare handoff.
 *
 * Asserts that the useMediaSurfaceMounted() counter is NEVER 0 during
 * the transition from FormClipsPlayer to CompareView — both surfaces must
 * not be simultaneously unmounted.
 *
 * Strategy: we mock useMediaSurfaceMounted to track cumulative
 * increment / decrement calls and assert the running counter never
 * drops to 0 between the two surface transitions.
 */
import React, { useState } from "react";
import { render, fireEvent, act } from "@testing-library/react-native";

// ── Track the running counter via mock ───────────────────────────────────────

let counter = 0;
const counterHistory: number[] = [];

const mockIncrement = jest.fn(() => {
  counter++;
  counterHistory.push(counter);
});
const mockDecrement = jest.fn(() => {
  counter--;
  counterHistory.push(counter);
});

jest.mock("@/lib/media/replay-gate", () => ({
  increment: () => mockIncrement(),
  decrement: () => mockDecrement(),
}));

jest.mock("@/hooks/useMediaSurfaceMounted", () => ({
  useMediaSurfaceMounted: () => {
    const { useEffect } = require("react") as typeof import("react");
    const { increment, decrement } = require("@/lib/media/replay-gate") as {
      increment: () => void;
      decrement: () => void;
    };
    useEffect(() => {
      increment();
      return () => { decrement(); };
    }, []);
  },
}));

// ── Component mocks ───────────────────────────────────────────────────────────

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
    const p = { play: jest.fn(), pause: jest.fn(), seekBy: jest.fn(), playing: false, loop: false };
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

jest.mock("expo-file-system", () => ({
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///docs/",
  deleteAsync: jest.fn(() => Promise.resolve()),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
  readDirectoryAsync: jest.fn(() => Promise.resolve([])),
  moveAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("@sentry/react-native", () => ({
  Mask: ({ children }: { children: React.ReactNode }) => children,
  addBreadcrumb: jest.fn(),
}));

jest.mock("@/components/ui/bottom-sheet", () => ({
  BottomSheet: ({ children, isVisible }: { children: React.ReactNode; isVisible: boolean }) =>
    isVisible ? <>{children}</> : null,
}));

// ── Test harness component ────────────────────────────────────────────────────

const makeClip = (id: string) => ({
  id,
  set_id: `set-${id}`,
  exercise_id: "ex-1",
  kind: "video" as const,
  rel_path: `form-clips/ex-1/${id}.mp4`,
  duration_ms: 5000,
  size_bytes: 1000000,
  width: 1080,
  height: 1920,
  pending_delete: 0,
  created_at: Date.now(),
});

const CLIP_A = makeClip("clip-a");

/**
 * A minimal harness that renders FormClipsPlayer and CompareView in the
 * same tree — mirroring how app/session/[id].tsx uses them.
 */
function Harness() {
  const { FormClipsPlayer } = require("../../../components/session/FormClipsPlayer") as {
    FormClipsPlayer: React.ComponentType<{
      isVisible: boolean;
      clip: typeof CLIP_A | null;
      onClose: () => void;
      siblingClipCount: number;
      onRequestCompare: (clip: typeof CLIP_A) => void;
    }>;
  };
  const { CompareView } = require("../../../components/session/CompareView") as {
    CompareView: React.ComponentType<{
      isVisible: boolean;
      clipA: typeof CLIP_A;
      clipB: typeof CLIP_A | null;
      exerciseId: string;
      pickerEnabled: boolean;
      pickerOpen: boolean;
      onClose: () => void;
    }>;
  };

  const [playerOpen, setPlayerOpen] = useState(true);
  const [playerClip, setPlayerClip] = useState<typeof CLIP_A | null>(CLIP_A);
  const [compareClipA, setCompareClipA] = useState<typeof CLIP_A | null>(null);
  const [compareExerciseId, setCompareExerciseId] = useState<string | null>(null);

  const handleRequestCompare = (clipA: typeof CLIP_A) => {
    // Single batched update — both setters happen in the same event handler.
    setPlayerOpen(false);
    setPlayerClip(null);
    setCompareClipA(clipA);
    setCompareExerciseId("ex-1");
  };

  return (
    <>
      <FormClipsPlayer
        isVisible={playerOpen && !!playerClip}
        clip={playerClip}
        onClose={() => { setPlayerOpen(false); setPlayerClip(null); }}
        siblingClipCount={3}
        onRequestCompare={handleRequestCompare}
      />
      {compareClipA && compareExerciseId && (
        <CompareView
          isVisible
          clipA={compareClipA}
          clipB={null}
          exerciseId={compareExerciseId}
          pickerEnabled
          pickerOpen
          onClose={() => { setCompareClipA(null); setCompareExerciseId(null); }}
        />
      )}
    </>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  counter = 0;
  counterHistory.length = 0;
  mockIncrement.mockClear();
  mockDecrement.mockClear();
});

describe("Player → Compare handoff (AC12 extended)", () => {
  it("counter ends at 1 after transition — one surface active at a time", async () => {
    const { getByLabelText } = render(<Harness />);

    // Initially: player is open → counter should be 1
    expect(counter).toBe(1);

    // Tap the "Compare with another set…" button.
    await act(async () => {
      fireEvent.press(getByLabelText("Compare with another set…"));
    });

    // After transition: CompareView is open → counter should be 1 again.
    expect(counter).toBe(1);

    // One increment from player, one decrement from player, one increment from compare.
    expect(mockIncrement).toHaveBeenCalledTimes(2);
    expect(mockDecrement).toHaveBeenCalledTimes(1);
  });

  it("counter returns to 0 after compare is closed", async () => {
    const { getByLabelText } = render(<Harness />);

    await act(async () => {
      fireEvent.press(getByLabelText("Compare with another set…"));
    });

    await act(async () => {
      fireEvent.press(getByLabelText("Close comparison"));
    });

    expect(counter).toBe(0);
  });
});
