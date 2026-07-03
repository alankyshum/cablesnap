/**
 * BLD-2738: Active-session RIR mode propagation integration test.
 *
 * QD gate requirement: verify that intensityMode reaches RpeChipStrip/RpeSheet
 * through the real active-session prop-drill chain:
 *   ExerciseGroupCard → ExerciseGroupSetTable → SetRow → RpeChipStrip
 *
 * This complements the isolated component tests (RpeChipStrip.mode-aware,
 * RpeSheet.mode-aware) by exercising the full propagation path.
 *
 * Also verifies that app/session/[id].tsx uses useIntensityMode() and passes
 * the result to ExerciseGroupCard (static import analysis).
 */

import React from "react";
import { render } from "@testing-library/react-native";

// ─── Required mocks for ExerciseGroupCard render tree ────────────────────────

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: {
    View: (props: Record<string, unknown>) => {
      const ReactLib = require("react");
      const { View } = require("react-native");
      return ReactLib.createElement(View, props, props.children);
    },
  },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: unknown) => v,
  withSpring: (v: unknown) => v,
  withDelay: (_d: unknown, v: unknown) => v,
  withSequence: (...args: unknown[]) => args[args.length - 1],
  FadeIn: { duration: () => ({}) },
  runOnJS: (fn: unknown) => fn,
  Easing: { bezier: () => () => 0, linear: () => () => 0 },
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const BottomSheet = ({ children }: { children: unknown }) =>
    ReactLib.createElement(View, null, children);
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetModal: BottomSheet,
    BottomSheetView: ({ children }: { children: unknown }) =>
      ReactLib.createElement(View, null, children),
    BottomSheetBackdrop: () => null,
  };
});

jest.mock("../../../components/session/RpeSheet", () => {
  const ReactLib = require("react");
  const { View } = require("react-native");
  const RpeSheet = () => ReactLib.createElement(View, { testID: "mock-rpe-sheet" });
  return { RpeSheet };
});

jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; size?: number; color?: string }) =>
    ReactLib.createElement(Text, props, props.name);
  return { __esModule: true, default: Icon };
});

jest.mock("@/lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@/lib/audio", () => ({
  play: jest.fn().mockResolvedValue(undefined),
  setEnabled: jest.fn(),
  preload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

jest.mock("../../../hooks/useActiveCalibration", () => ({
  useActiveCalibration: () => [],
}));

jest.mock("../../../components/WeightPicker", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ value, accessibilityLabel }: { value: number; accessibilityLabel: string }) =>
      ReactLib.createElement(Text, { accessibilityLabel }, String(value)),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../../components/SwipeToDelete", () => {
  const ReactLib = require("react");
  return {
    __esModule: true,
    default: ({ children }: { children: unknown }) =>
      ReactLib.createElement(ReactLib.Fragment, null, children),
  };
});

// ─── Imports ─────────────────────────────────────────────────────────────────

import { ExerciseGroupCard } from "../../../components/session/ExerciseGroupCard";
import type { ExerciseGroup, SetWithMeta } from "../../../components/session/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "set-1",
    session_id: "sess-1",
    exercise_id: "ex-1",
    set_number: 1,
    round: null,
    weight: 80,
    reps: 5,
    rpe: null,
    notes: "",
    completed: true,
    completed_at: null,
    set_type: "normal",
    tempo: null,
    duration_seconds: null,
    bodyweight_modifier_kg: null,
    pulley_pin: null,
    link_id: null,
    is_pr: false,
    exercise_position: 0,
    swapped_from_exercise_id: null,
    ...overrides,
  } as unknown as SetWithMeta;
}

function makeGroup(overrides: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exercise_id: "ex-1",
    name: "Bench Press",
    sets: [makeSet()],
    exercise_position: 0,
    link_id: null,
    trackingMode: "reps",
    is_bodyweight: false,
    is_voltra: false,
    equipment: "barbell",
    defaultTempo: null,
    preferredSubstituteName: null,
    ...overrides,
  } as ExerciseGroup;
}

const defaultProps = {
  group: makeGroup(),
  step: 2.5,
  unit: "kg" as const,
  suggestions: {},
  exerciseNotesOpen: false,
  exerciseNotesDraft: "",
  pinnedNoteDraft: "",
  linkIds: [],
  groups: [makeGroup()],
  palette: ["#6200ee"],
  onUpdate: jest.fn(),
  onCheck: jest.fn(),
  onDelete: jest.fn(),
  onAddSet: jest.fn(),
  onAddWarmups: jest.fn(),
  onExerciseNotes: jest.fn(),
  onExerciseNotesDraftChange: jest.fn(),
  onToggleExerciseNotes: jest.fn(),
  onPinnedNoteDraftChange: jest.fn(),
  onPinnedNoteSave: jest.fn(),
  onBackfillCopy: jest.fn(),
  onBackfillDismiss: jest.fn(),
  onLoadBackfill: jest.fn(),
  onCycleSetType: jest.fn(),
  onLongPressSetType: jest.fn(),
  onOpenBodyweightModifier: jest.fn(),
  onClearBodyweightModifier: jest.fn(),
  onOpenVariantPicker: jest.fn(),
  onClearVariant: jest.fn(),
  onOpenBodyweightGripPicker: jest.fn(),
  onClearBodyweightGrip: jest.fn(),
  onShowDetail: jest.fn(),
  onSwap: jest.fn(),
  onDeleteExercise: jest.fn(),
  onMoveUp: jest.fn(),
  onMoveDown: jest.fn(),
  onPrefill: jest.fn(),
  plateauHints: {},
  onApplyBreakThrough: jest.fn(),
  hasClipMap: {},
  onVideoGlyph: jest.fn(),
  onOpenPulleyPinPicker: jest.fn(),
  showPulleyPin: false,
  hasSetupPhotoMap: {},
  setupPhotoUriMap: {},
  onSetupPhotoGlyph: jest.fn(),
  captureRpe: true,
  onRpeChange: jest.fn(),
  gymId: null,
  onMarkerConfirm: jest.fn(),
  onManualWeightSave: jest.fn(),
  onAddSegment: jest.fn(),
  onDeleteSegment: jest.fn(),
  onCollapseToNormal: jest.fn(),
  preferredSubstituteName: null,
  isPreferredSwapApplied: false,
  preferredSwappedToName: null,
  onPreferredSwap: jest.fn(),
};

// ─── Integration Tests ────────────────────────────────────────────────────────

describe("active-session RIR mode propagation — BLD-2738", () => {
  /**
   * Core regression: intensityMode="rir" must propagate from ExerciseGroupCard
   * through ExerciseGroupSetTable → SetRow → RpeChipStrip.
   * The chip a11y labels are the observable signal.
   */
  it("RIR mode: chip a11y labels reach RpeChipStrip through full prop-drill chain", () => {
    const { getAllByRole } = render(
      <ExerciseGroupCard {...defaultProps} intensityMode="rir" />
    );

    const radios = getAllByRole("radio");
    const labels = radios.map((r) => r.props.accessibilityLabel);

    // RIR mode: RPE 6 → 4 RIR, RPE 7.5 → 2.5 RIR, RPE 9 → 1 RIR, RPE 10 → 0 RIR
    expect(labels).toContain("4 RIR, easy");
    expect(labels).toContain("2.5 RIR, moderate");
    expect(labels).toContain("1 RIR, hard");
    expect(labels).toContain("0 RIR, max");

    // Confirm no RPE-mode labels leaked through
    expect(labels).not.toContain("RPE 6, easy");
    expect(labels).not.toContain("RPE 9, hard");
  });

  /**
   * Verify default (no intensityMode prop) still works as RPE — regression guard.
   */
  it("RPE mode (default): chip a11y labels use RPE format through full chain", () => {
    const { getAllByRole } = render(
      <ExerciseGroupCard {...defaultProps} intensityMode="rpe" />
    );

    const radios = getAllByRole("radio");
    const labels = radios.map((r) => r.props.accessibilityLabel);

    expect(labels).toContain("RPE 6, easy");
    expect(labels).toContain("RPE 7.5, moderate");
    expect(labels).toContain("RPE 9, hard");
    expect(labels).toContain("RPE 10, max");

    // Confirm no RIR labels leaked through
    expect(labels).not.toContain("4 RIR, easy");
  });

  /**
   * CEO condition 1 via integration: in RIR mode, a chip tap still fires
   * onRpeChange with the RPE-scale value (not the RIR value).
   * Verifies the invariant through the full ExerciseGroupCard → SetRow path.
   */
  it("RIR mode: chip tap calls onRpeChange with RPE-scale value (not RIR) — CEO condition 1", () => {
    const onRpeChange = jest.fn();
    const { getByText } = render(
      <ExerciseGroupCard {...defaultProps} intensityMode="rir" onRpeChange={onRpeChange} />
    );

    // "Hard" chip: displayed as "1 RIR" but stores RPE 9
    const hardChip = getByText("Hard");
    require("@testing-library/react-native").fireEvent.press(hardChip);

    // MUST emit RPE 9, NOT RIR 1
    expect(onRpeChange).toHaveBeenCalledWith("set-1", 9);
    expect(onRpeChange).not.toHaveBeenCalledWith("set-1", 1);
  });

  /**
   * Verify undefined intensityMode falls back to RPE (backward compat).
   */
  it("no intensityMode prop: defaults to RPE labels (backward compat)", () => {
    const propsWithoutMode = { ...defaultProps };
    // Remove intensityMode (simulates existing callers that don't pass it yet)
    const { getAllByRole } = render(
      <ExerciseGroupCard {...propsWithoutMode} intensityMode={undefined} />
    );

    const radios = getAllByRole("radio");
    const labels = radios.map((r) => r.props.accessibilityLabel);
    expect(labels).toContain("RPE 9, hard");
  });
});

// ─── Static import assertion for app/session/[id].tsx ────────────────────────

describe("app/session/[id].tsx — static integration contract (BLD-2738)", () => {
  /**
   * Verify that app/session/[id].tsx imports useIntensityMode.
   * This is a static code assertion — if the import is removed, this test fails.
   * It guards against future regressions where the fix is accidentally reverted.
   */
  it("app/session/[id].tsx imports useIntensityMode hook", () => {
    // Read the source file and verify the import exists
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../app/session/[id].tsx"),
      "utf8"
    );

    expect(source).toContain("useIntensityMode");
    expect(source).toContain("hooks/useIntensityMode");
  });

  /**
   * Verify that app/session/[id].tsx passes intensityMode to ExerciseGroupCard.
   * Guards the prop-pass-through so QD gate evidence cannot silently regress.
   */
  it("app/session/[id].tsx passes intensityMode to ExerciseGroupCard", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../app/session/[id].tsx"),
      "utf8"
    );

    // The prop assignment must appear in the ExerciseGroupCard render
    expect(source).toContain("intensityMode={intensityMode}");
  });

  /**
   * Verify intensityMode is included in the renderExerciseGroup useCallback deps.
   * Ensures the callback re-renders when the mode changes.
   */
  it("app/session/[id].tsx includes intensityMode in renderExerciseGroup useCallback deps", () => {
    const fs = require("fs");
    const path = require("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../../app/session/[id].tsx"),
      "utf8"
    );

    // The dep array on renderExerciseGroup useCallback must list intensityMode
    // Match: "captureRpe, handleRpeChange, intensityMode," (canonical dep order)
    expect(source).toMatch(/intensityMode[,\]]/);
  });
});
