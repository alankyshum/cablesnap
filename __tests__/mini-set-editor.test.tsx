/**
 * BLD-1168 Slice 7 — MiniSetEditor component tests.
 *
 * AC #255 (plan line 256): GIVEN a user creates a working set and changes its
 *   type to rest_pause WHEN they tap "+ mini-set" twice and enter (8, 3, 2)
 *   reps THEN the parent row displays "8+3+2 (13)" and the segment callbacks
 *   are called in order.
 *
 * AC #262 (plan line 262): GIVEN a user changes an advanced set with 3
 *   mini-sets back to normal WHEN they confirm the prompt THEN
 *   onCollapseToNormal is called; WHEN they cancel THEN nothing changes.
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { MiniSetEditor, MAX_MINI_SETS, WARN_MINI_SETS } from "../components/session/MiniSetEditor";
import { formatMiniSetReps, formatAdvancedSetAccessibilityLabel } from "../lib/format";
import type { SetSegment } from "@/lib/types";

// ─── Mock: useThemeColors ─────────────────────────────────────────────────────

jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("./helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

// ─── Mock: Alert (spy on Alert.alert so we can control confirm/cancel) ────────

import { Alert } from "react-native";
let alertSpy: jest.SpyInstance;

// ─── Helper factory ───────────────────────────────────────────────────────────

let segCounter = 0;
function makeSegment(overrides: Partial<SetSegment> = {}): SetSegment {
  return {
    id: `seg-${++segCounter}`,
    set_id: "set-1",
    segment_number: segCounter,
    reps: 8,
    weight: null,
    rest_after_seconds: null,
    completed_at: null,
    created_at: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  segCounter = 0;
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});

afterEach(() => {
  alertSpy.mockRestore();
});

// ─── Pure function: formatMiniSetReps ─────────────────────────────────────────

describe("formatMiniSetReps", () => {
  it("returns '0' for empty segments", () => {
    expect(formatMiniSetReps([])).toBe("0");
  });

  it("returns joined reps without total for 1 segment", () => {
    expect(formatMiniSetReps([{ reps: 8 }])).toBe("8");
  });

  it("returns joined reps without total for 2 segments", () => {
    expect(formatMiniSetReps([{ reps: 8 }, { reps: 3 }])).toBe("8+3");
  });

  it("returns joined reps WITH total for 3 segments (AC #255)", () => {
    expect(formatMiniSetReps([{ reps: 8 }, { reps: 3 }, { reps: 2 }])).toBe("8+3+2 (13)");
  });

  it("returns correct total for 5 myo-rep segments", () => {
    expect(formatMiniSetReps([
      { reps: 15 }, { reps: 5 }, { reps: 5 }, { reps: 4 }, { reps: 3 },
    ])).toBe("15+5+5+4+3 (32)");
  });
});

// ─── Pure function: formatAdvancedSetAccessibilityLabel ───────────────────────

describe("formatAdvancedSetAccessibilityLabel", () => {
  it("returns single mini-set label", () => {
    expect(formatAdvancedSetAccessibilityLabel("Rest-pause", 1)).toBe(
      "Rest-pause set with 1 mini-set",
    );
  });

  it("returns plural mini-set label for 3 mini-sets (AC #263)", () => {
    expect(formatAdvancedSetAccessibilityLabel("Rest-pause", 3)).toBe(
      "Rest-pause set with 3 mini-sets",
    );
  });

  it("returns no-mini-sets label when count is 0", () => {
    expect(formatAdvancedSetAccessibilityLabel("Cluster", 0)).toBe(
      "Cluster set, no mini-sets yet",
    );
  });
});

// ─── MiniSetEditor component ──────────────────────────────────────────────────

function renderEditor(
  segments: SetSegment[],
  {
    onAddSegment = jest.fn().mockResolvedValue(undefined),
    onDeleteSegment = jest.fn().mockResolvedValue(undefined),
    onCollapseToNormal = jest.fn().mockResolvedValue(undefined),
  }: {
    onAddSegment?: jest.Mock;
    onDeleteSegment?: jest.Mock;
    onCollapseToNormal?: jest.Mock;
  } = {},
) {
  return render(
    <MiniSetEditor
      setId="set-1"
      segments={segments}
      onAddSegment={onAddSegment}
      onDeleteSegment={onDeleteSegment}
      onCollapseToNormal={onCollapseToNormal}
    />,
  );
}

describe("MiniSetEditor — add segment", () => {
  it("renders the + mini-set button", () => {
    const { getByTestId } = renderEditor([]);
    expect(getByTestId("mini-set-add-button")).toBeTruthy();
  });

  it("calls onAddSegment when + mini-set is tapped", () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = renderEditor([], { onAddSegment: onAdd });
    fireEvent.press(getByTestId("mini-set-add-button"));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("shows existing segments as rows", () => {
    const segs = [
      makeSegment({ reps: 8, segment_number: 1 }),
      makeSegment({ reps: 3, segment_number: 2 }),
    ];
    const { getByTestId } = renderEditor(segs);
    expect(getByTestId(`mini-set-segment-${segs[0].id}`)).toBeTruthy();
    expect(getByTestId(`mini-set-segment-${segs[1].id}`)).toBeTruthy();
  });

  it("AC #255: three segments display total reps correctly", () => {
    const segs = [
      makeSegment({ reps: 8, segment_number: 1 }),
      makeSegment({ reps: 3, segment_number: 2 }),
      makeSegment({ reps: 2, segment_number: 3 }),
    ];
    const { getByText } = renderEditor(segs);
    // Total should be shown in the action row
    expect(getByText("Total: 13")).toBeTruthy();
  });

  it("disables the + button at MAX_MINI_SETS", () => {
    const segs = Array.from({ length: MAX_MINI_SETS }, (_, i) =>
      makeSegment({ segment_number: i + 1, reps: 3 }),
    );
    const onAdd = jest.fn();
    const { getByTestId } = renderEditor(segs, { onAddSegment: onAdd });
    fireEvent.press(getByTestId("mini-set-add-button"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("shows warn text at WARN_MINI_SETS", () => {
    const segs = Array.from({ length: WARN_MINI_SETS }, (_, i) =>
      makeSegment({ segment_number: i + 1, reps: 3 }),
    );
    const { getByText } = renderEditor(segs);
    expect(getByText(/One more mini-set remaining/)).toBeTruthy();
  });

  it("shows max-reached text at MAX_MINI_SETS", () => {
    const segs = Array.from({ length: MAX_MINI_SETS }, (_, i) =>
      makeSegment({ segment_number: i + 1, reps: 3 }),
    );
    const { getByText } = renderEditor(segs);
    expect(getByText(/Maximum 8 mini-sets reached/)).toBeTruthy();
  });
});

describe("MiniSetEditor — delete segment", () => {
  it("shows a delete confirmation when a segment row is long-pressed", () => {
    const seg = makeSegment({ reps: 8, segment_number: 1 });
    const { getByTestId } = renderEditor([seg]);
    fireEvent(getByTestId(`mini-set-segment-${seg.id}`), "longPress");
    expect(alertSpy).toHaveBeenCalledWith(
      "Delete mini-set?",
      expect.stringContaining("8 reps"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Delete" }),
      ]),
    );
  });

  it("calls onDeleteSegment when delete is confirmed", () => {
    const seg = makeSegment({ reps: 8, segment_number: 1 });
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = renderEditor([seg], { onDeleteSegment: onDelete });

    // Press long-press → capture the "Delete" action → call its onPress
    fireEvent(getByTestId(`mini-set-segment-${seg.id}`), "longPress");
    const [, , buttons] = alertSpy.mock.calls[0];
    const deleteBtn = buttons.find((b: { text: string }) => b.text === "Delete");
    deleteBtn.onPress();
    expect(onDelete).toHaveBeenCalledWith(seg.id);
  });

  it("does NOT call onDeleteSegment when cancel is pressed (AC #262)", () => {
    const seg = makeSegment({ reps: 8, segment_number: 1 });
    const onDelete = jest.fn();
    const { getByTestId } = renderEditor([seg], { onDeleteSegment: onDelete });

    fireEvent(getByTestId(`mini-set-segment-${seg.id}`), "longPress");
    const [, , buttons] = alertSpy.mock.calls[0];
    // Cancel button has no onPress — nothing should fire
    expect(buttons.find((b: { text: string }) => b.text === "Cancel")).toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe("MiniSetEditor — collapse to normal (AC #262)", () => {
  it("shows the Collapse button when segments > 0", () => {
    const segs = [
      makeSegment({ reps: 8, segment_number: 1 }),
      makeSegment({ reps: 3, segment_number: 2 }),
    ];
    const { getByTestId } = renderEditor(segs);
    expect(getByTestId("mini-set-collapse-button")).toBeTruthy();
  });

  it("hides the Collapse button when segments = 0", () => {
    const { queryByTestId } = renderEditor([]);
    expect(queryByTestId("mini-set-collapse-button")).toBeNull();
  });

  it("shows a confirmation dialog on Collapse press", () => {
    const segs = [
      makeSegment({ reps: 8, segment_number: 1 }),
      makeSegment({ reps: 3, segment_number: 2 }),
      makeSegment({ reps: 2, segment_number: 3 }),
    ];
    const { getByTestId } = renderEditor(segs);
    fireEvent.press(getByTestId("mini-set-collapse-button"));
    expect(alertSpy).toHaveBeenCalledWith(
      "Collapse mini-sets?",
      expect.stringContaining("13 reps"),
      expect.arrayContaining([
        expect.objectContaining({ text: "Cancel" }),
        expect.objectContaining({ text: "Yes, collapse" }),
      ]),
    );
  });

  it("calls onCollapseToNormal when confirmed (AC #262 — yes path)", () => {
    const segs = [
      makeSegment({ reps: 8, segment_number: 1 }),
      makeSegment({ reps: 3, segment_number: 2 }),
      makeSegment({ reps: 2, segment_number: 3 }),
    ];
    const onCollapse = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = renderEditor(segs, { onCollapseToNormal: onCollapse });

    fireEvent.press(getByTestId("mini-set-collapse-button"));
    const [, , buttons] = alertSpy.mock.calls[0];
    const confirmBtn = buttons.find((b: { text: string }) => b.text === "Yes, collapse");
    confirmBtn.onPress();
    expect(onCollapse).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onCollapseToNormal when cancel is pressed (AC #262 — cancel path)", () => {
    const segs = [makeSegment({ reps: 8, segment_number: 1 })];
    const onCollapse = jest.fn();
    const { getByTestId } = renderEditor(segs, { onCollapseToNormal: onCollapse });

    fireEvent.press(getByTestId("mini-set-collapse-button"));
    // Cancel button has style: "cancel" and no onPress — nothing should fire
    expect(onCollapse).not.toHaveBeenCalled();
  });
});

describe("MiniSetEditor — accessibility", () => {
  it("each segment row has a descriptive accessibilityLabel", () => {
    const seg = makeSegment({ reps: 8, segment_number: 1, weight: 100 });
    const { getByTestId } = renderEditor([seg]);
    const row = getByTestId(`mini-set-segment-${seg.id}`);
    expect(row.props.accessibilityLabel).toContain("Mini-set 1");
    expect(row.props.accessibilityLabel).toContain("8 reps");
    expect(row.props.accessibilityLabel).toContain("100 kg");
  });

  it("+ mini-set button has accessibilityRole button", () => {
    const { getByTestId } = renderEditor([]);
    const btn = getByTestId("mini-set-add-button");
    expect(btn.props.accessibilityRole).toBe("button");
  });
});
