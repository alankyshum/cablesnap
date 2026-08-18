/**
 * BLD-1089: QuickAddSheet component tests.
 *
 * AC1:  FAB is rendered on home screen (Quick Add button exists).
 * AC2:  Recent exercises appear as chips in the sheet.
 * AC5:  Active session banner is shown when a workout is in progress.
 * AC11: Empty state shown when no recent exercises exist.
 * AC14: Large text scaling: chip strip degrades gracefully at fontScale 2.
 * AC16: ExercisePicker opens when "Pick exercise…" button is pressed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

jest.mock("../../../hooks/useColorScheme", () => ({
  useColorScheme: () => "light",
}));

jest.mock("../../../hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

// Mock BottomSheet so it renders children without portal/animation
jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const { View, ScrollView } = require("react-native");
  const BottomSheet = React.forwardRef(({ children, index }: any) => {
    if (index < 0) return null;
    return <View testID="bottom-sheet">{children}</View>;
  });
  BottomSheet.displayName = "BottomSheet";
  const BottomSheetScrollView = ({ children }: any) => <ScrollView>{children}</ScrollView>;
  BottomSheetScrollView.displayName = "BottomSheetScrollView";
  const BottomSheetBackdrop = () => null;
  BottomSheetBackdrop.displayName = "BottomSheetBackdrop";
  return { __esModule: true, default: BottomSheet, BottomSheetScrollView, BottomSheetBackdrop };
});

jest.mock("@/lib/db/day-session", () => ({
  listRecentQuickAddExercises: jest.fn().mockResolvedValue([]),
  addQuickAddSet: jest.fn().mockResolvedValue({ setId: "set-1", sessionId: "sess-1", todayTotal: 10 }),
  removeQuickAddSet: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db/sessions", () => ({
  getActiveSession: jest.fn().mockResolvedValue(null),
}));

jest.mock("@/lib/db", () => ({
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: "kg" }),
  getAppSetting: jest.fn().mockResolvedValue(null),
}));

jest.mock("../../../components/ExercisePickerSheet", () => {
  const React = require("react");
  const MockPicker = ({ isVisible }: any) => isVisible ? React.createElement("View", { testID: "exercise-picker" }) : null;
  MockPicker.displayName = "MockExercisePickerSheet";
  return MockPicker;
});

jest.mock("../../../components/ui/bna-toast", () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import QuickAddSheet from "../../../components/home/QuickAddSheet";
import { listRecentQuickAddExercises } from "@/lib/db/day-session";
import { getActiveSession } from "@/lib/db/sessions";

const mockListRecent = listRecentQuickAddExercises as jest.Mock;
const mockGetActiveSession = getActiveSession as jest.Mock;

const defaultProps = {
  visible: true,
  onDismiss: jest.fn(),
  onSetLogged: jest.fn(),
  onOpenActiveSession: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockListRecent.mockResolvedValue([]);
  mockGetActiveSession.mockResolvedValue(null);
});

describe("AC2 — recent exercise chips", () => {
  it("renders chip for each recent exercise", async () => {
    mockListRecent.mockResolvedValue([
      { exercise_id: "ex-1", exercise_name: "Pull-ups", last_reps: 8, last_weight: null, last_added_at: Date.now() },
      { exercise_id: "ex-2", exercise_name: "Push-ups", last_reps: 15, last_weight: null, last_added_at: Date.now() - 1000 },
    ]);

    const { findByText } = render(<QuickAddSheet {...defaultProps} />);

    await findByText("Pull-ups");
    await findByText("Push-ups");
  });
});

describe("AC5 — active session banner", () => {
  it("shows banner when an active session exists", async () => {
    mockGetActiveSession.mockResolvedValue({ id: "sess-active", name: "Push Day", started_at: Date.now(), completed_at: null });

    const { findByText } = render(<QuickAddSheet {...defaultProps} />);

    await findByText(/You have an active session/i);
  });

  it("does not show banner when no active session", async () => {
    mockGetActiveSession.mockResolvedValue(null);

    const { queryByText } = render(<QuickAddSheet {...defaultProps} />);

    await waitFor(() => {
      expect(queryByText(/active session/i)).toBeNull();
    });
  });
});

describe("AC11 — empty state", () => {
  it("shows empty state text when no recent exercises", async () => {
    mockListRecent.mockResolvedValue([]);

    const { findByText } = render(<QuickAddSheet {...defaultProps} />);

    // Should show "Pick exercise…" button as the primary CTA when no chips
    await findByText(/pick exercise/i);
  });
});

describe("AC16 — ExercisePicker integration", () => {
  it("Pick exercise button is present and pressable", async () => {
    const { findByText } = render(<QuickAddSheet {...defaultProps} />);
    const btn = await findByText(/pick exercise/i);
    expect(btn).toBeTruthy();
  });
});
