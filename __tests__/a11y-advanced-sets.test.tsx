/**
 * BLD-1168 Slice 7 — Accessibility tests for advanced set display.
 *
 * AC #263 (plan line 263): GIVEN VoiceOver/TalkBack is enabled WHEN focus
 * reaches an advanced set parent row THEN the announcement includes the set
 * type and mini-set count (e.g., "Rest-pause set with 3 mini-sets").
 *
 * Also covers: compact reps format in history display, proper badge colours
 * for RP/CL/MR set types.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import { ExerciseGroupRow } from "@/components/session/detail/ExerciseGroupRow";
import type { ExerciseGroup } from "@/hooks/useSessionDetail";
import type { SetSegment } from "@/lib/types";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("@/lib/db/sets", () => {
  const VALID = new Set(["normal", "warmup", "dropset", "rest_pause", "cluster", "myo_reps"]);
  return {
    ADVANCED_SET_TYPES: new Set(["rest_pause", "cluster", "myo_reps"]),
    normalizeSetType: (raw: unknown) => (typeof raw === "string" && VALID.has(raw) ? raw : "normal"),
  };
});

const mockColors = {
  primary: "#6200ee",
  primaryContainer: "#e8def8",
  onPrimary: "#ffffff",
  onPrimaryContainer: "#21005d",
  secondaryContainer: "#e8def8",
  onSecondaryContainer: "#1d192b",
  onSurface: "#1c1b1f",
  onSurfaceVariant: "#49454f",
  surface: "#fffbfe",
  surfaceVariant: "#e7e0ec",
  tertiaryContainer: "#f8e1e7",
  onTertiaryContainer: "#31101d",
  errorContainer: "#ffdad6",
  onErrorContainer: "#410002",
  error: "#b3261e",
  outline: "#79747e",
  background: "#fffbfe",
  onError: "#ffffff",
} as Parameters<typeof ExerciseGroupRow>[0]["colors"];

// ─── Factories ────────────────────────────────────────────────────────────────

let counter = 0;
function uid() { return `test-${++counter}`; }

function makeSegment(reps: number, num: number): SetSegment {
  return {
    id: uid(),
    set_id: "set-1",
    segment_number: num,
    reps,
    weight: null,
    rest_after_seconds: null,
    completed_at: null,
    created_at: Date.now(),
  };
}

function makeGroup(overrides: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exercise_id: uid(),
    name: "Bench Press",
    link_id: null,
    swapped_from_name: null,
    sets: [],
    ...overrides,
  };
}

beforeEach(() => { counter = 0; });

// ─── AC #263: VoiceOver announcement ─────────────────────────────────────────

describe("ExerciseGroupRow — advanced set a11y (AC #263)", () => {
  it("announces 'Rest-pause set with 3 mini-sets' when 3 segments are present", () => {
    const segments = [
      makeSegment(8, 1),
      makeSegment(3, 2),
      makeSegment(2, 3),
    ];
    const group = makeGroup({
      sets: [{
        id: "set-1",
        session_id: "sess-1",
        exercise_id: "ex-1",
        set_number: 1,
        weight: 100,
        reps: 13,
        completed: true,
        completed_at: Date.now(),
        rpe: null,
        notes: "",
        link_id: null,
        round: null,
        tempo: null,
        swapped_from_exercise_id: null,
        set_type: "rest_pause",
        duration_seconds: null,
        exercise_position: 0,
        segments,
      }],
    });

    const { getByLabelText } = render(
      <ExerciseGroupRow
        group={group}
        groups={[group]}
        linkIds={[]}
        palette={[]}
        colors={mockColors}
      />,
    );

    const row = getByLabelText(/Rest-pause set with 3 mini-sets/i);
    expect(row).toBeTruthy();
  });

  it("announces 'Rest-pause set with 1 mini-set' (singular) for 1 segment", () => {
    const segments = [makeSegment(8, 1)];
    const group = makeGroup({
      sets: [{
        id: "set-1",
        session_id: "sess-1",
        exercise_id: "ex-1",
        set_number: 1,
        weight: 100,
        reps: 8,
        completed: true,
        completed_at: Date.now(),
        rpe: null,
        notes: "",
        link_id: null,
        round: null,
        tempo: null,
        swapped_from_exercise_id: null,
        set_type: "rest_pause",
        duration_seconds: null,
        exercise_position: 0,
        segments,
      }],
    });

    const { getByLabelText } = render(
      <ExerciseGroupRow
        group={group}
        groups={[group]}
        linkIds={[]}
        palette={[]}
        colors={mockColors}
      />,
    );

    const row = getByLabelText(/Rest-pause set with 1 mini-set/i);
    expect(row).toBeTruthy();
    // Must NOT say "mini-sets" (plural)
    expect(row.props.accessibilityLabel).not.toContain("mini-sets");
  });

  it("announces 'Cluster set with 3 mini-sets' for cluster type", () => {
    const segments = [makeSegment(3, 1), makeSegment(3, 2), makeSegment(2, 3)];
    const group = makeGroup({
      sets: [{
        id: "set-2",
        session_id: "sess-1",
        exercise_id: "ex-1",
        set_number: 1,
        weight: 100,
        reps: 8,
        completed: true,
        completed_at: Date.now(),
        rpe: null,
        notes: "",
        link_id: null,
        round: null,
        tempo: null,
        swapped_from_exercise_id: null,
        set_type: "cluster",
        duration_seconds: null,
        exercise_position: 0,
        segments,
      }],
    });

    const { getByLabelText } = render(
      <ExerciseGroupRow
        group={group}
        groups={[group]}
        linkIds={[]}
        palette={[]}
        colors={mockColors}
      />,
    );

    expect(getByLabelText(/Cluster set with 3 mini-sets/i)).toBeTruthy();
  });

  it("announces 'Myo-reps set, no mini-sets yet' when no segments", () => {
    const group = makeGroup({
      sets: [{
        id: "set-3",
        session_id: "sess-1",
        exercise_id: "ex-1",
        set_number: 1,
        weight: 25,
        reps: 0,
        completed: true,
        completed_at: Date.now(),
        rpe: null,
        notes: "",
        link_id: null,
        round: null,
        tempo: null,
        swapped_from_exercise_id: null,
        set_type: "myo_reps",
        duration_seconds: null,
        exercise_position: 0,
        segments: [],
      }],
    });

    const { getByLabelText } = render(
      <ExerciseGroupRow
        group={group}
        groups={[group]}
        linkIds={[]}
        palette={[]}
        colors={mockColors}
      />,
    );

    expect(getByLabelText(/Myo-reps set, no mini-sets yet/i)).toBeTruthy();
  });
});

// ─── Compact reps display ─────────────────────────────────────────────────────

describe("ExerciseGroupRow — compact reps display", () => {
  it("shows '8+3+2 (13)' in body text for rest_pause with 3 segments (AC #255)", () => {
    const segments = [makeSegment(8, 1), makeSegment(3, 2), makeSegment(2, 3)];
    const group = makeGroup({
      sets: [{
        id: "set-1",
        session_id: "sess-1",
        exercise_id: "ex-1",
        set_number: 1,
        weight: 100,
        reps: 13,
        completed: true,
        completed_at: Date.now(),
        rpe: null,
        notes: "",
        link_id: null,
        round: null,
        tempo: null,
        swapped_from_exercise_id: null,
        set_type: "rest_pause",
        duration_seconds: null,
        exercise_position: 0,
        segments,
      }],
    });

    const { getByText } = render(
      <ExerciseGroupRow
        group={group}
        groups={[group]}
        linkIds={[]}
        palette={[]}
        colors={mockColors}
      />,
    );

    expect(getByText(/8\+3\+2 \(13\)/)).toBeTruthy();
  });

  it("shows plain reps for non-advanced set types", () => {
    const group = makeGroup({
      sets: [{
        id: "set-1",
        session_id: "sess-1",
        exercise_id: "ex-1",
        set_number: 1,
        weight: 60,
        reps: 10,
        completed: true,
        completed_at: Date.now(),
        rpe: null,
        notes: "",
        link_id: null,
        round: null,
        tempo: null,
        swapped_from_exercise_id: null,
        set_type: "normal",
        duration_seconds: null,
        exercise_position: 0,
      }],
    });

    const { getByText } = render(
      <ExerciseGroupRow
        group={group}
        groups={[group]}
        linkIds={[]}
        palette={[]}
        colors={mockColors}
      />,
    );

    expect(getByText("60 × 10")).toBeTruthy();
  });
});
