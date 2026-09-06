import React from "react";
import { Alert } from "react-native";
import { waitFor, fireEvent } from "@testing-library/react-native";
import { renderScreen } from "../../helpers/render";

const mockListGymProfiles = jest.fn();
const mockListCableStacks = jest.fn();
const mockListCalibrations = jest.fn();
const mockGenerateStackCalibrations = jest.fn();

jest.mock("@/lib/db", () => ({
  listGymProfiles: () => mockListGymProfiles(),
  listCableStacks: (gymId: string) => mockListCableStacks(gymId),
  listCalibrations: (stackId: string) => mockListCalibrations(stackId),
  generateStackCalibrations: (stackId: string, params: unknown) => mockGenerateStackCalibrations(stackId, params),
  createCableStack: jest.fn(),
  createGymProfile: jest.fn(),
  deleteCalibration: jest.fn(),
  setDefaultGym: jest.fn(),
  softDeleteCableStack: jest.fn(),
  softDeleteGymProfile: jest.fn(),
  updateCableStack: jest.fn(),
  updateGymProfile: jest.fn(),
  upsertCalibration: jest.fn(),
}));

jest.mock("@/lib/layout", () => ({
  useLayout: () => ({ isTablet: false }),
}));

jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void | (() => void)) => {
    const { useEffect } = require("react");
    useEffect(() => {
      const cleanup = cb();
      if (typeof cleanup === "function") return cleanup;
    }, [cb]);
  },
  Link: "Link",
  Stack: { Screen: function ScreenMock() { return null; } },
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");

jest.mock("lucide-react-native", () => ({
  ChevronDown: "ChevronDown",
  ChevronRight: "ChevronRight",
  Plus: "Plus",
}));

jest.mock("@/components/SwipeToDelete", () => {
  const { View } = require("react-native");
  return function SwipeToDeleteMock({ children }: { children: React.ReactNode }) {
    return <View>{children}</View>;
  };
});

import GymProfilesScreen from "../../../app/settings/gym-profiles";

describe("GymProfilesScreen — Generate overwrite-confirm behavior (QD Safeguard B)", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});

    // Default mocks returning a gym and a cable stack
    mockListGymProfiles.mockResolvedValue([
      { id: "gym-1", name: "Main Gym", is_default: 1, created_at: 1000, updated_at: 1000 },
    ]);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("QD-B: manual existing rows trigger confirmation before save", async () => {
    mockListCableStacks.mockResolvedValue([
      {
        id: "stack-1",
        gym_id: "gym-1",
        name: "My Stack",
        unit: "kg",
        position: 1,
        created_at: 1000,
        updated_at: 1000,
        gen_start_weight: null,
        gen_increment: null,
        gen_marker_count: null,
      },
    ]);

    // Stack has manual calibrations (pre-existing)
    mockListCalibrations.mockResolvedValue([
      { id: "cal-1", stack_id: "stack-1", marker: 1, true_weight: 10 },
    ]);

    const { getByLabelText, getByText } = renderScreen(<GymProfilesScreen />);

    // Wait for load and expand stack card
    await waitFor(() => expect(getByLabelText("My Stack, expand")).toBeTruthy());
    fireEvent.press(getByLabelText("My Stack, expand"));

    // Switch to Generate mode
    await waitFor(() => expect(getByText("Generate")).toBeTruthy());
    fireEvent.press(getByText("Generate"));

    // Enter generator inputs
    const startInput = getByLabelText("Start weight in kg");
    const stepInput = getByLabelText("Increment in kg");
    const countInput = getByLabelText("Number of markers");

    fireEvent.changeText(startInput, "10");
    fireEvent.changeText(stepInput, "5");
    fireEvent.changeText(countInput, "3");

    // Press Generate button (the submit button under form inputs)
    const generateBtn = getByLabelText("Generate calibrations from parameters");
    fireEvent.press(generateBtn);

    // Assert Alert.alert is triggered because there are existing calibrations and regen is not identical
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toBe("Overwrite calibrations?");
    });
  });

  it("QD-B: generated existing rows trigger confirmation before save", async () => {
    mockListCableStacks.mockResolvedValue([
      {
        id: "stack-1",
        gym_id: "gym-1",
        name: "My Stack",
        unit: "kg",
        position: 1,
        created_at: 1000,
        updated_at: 1000,
        gen_start_weight: 5,
        gen_increment: 5,
        gen_marker_count: 3,
      },
    ]);

    // Stack has existing calibrations matching the old metadata
    mockListCalibrations.mockResolvedValue([
      { id: "cal-1", stack_id: "stack-1", marker: 1, true_weight: 5 },
      { id: "cal-2", stack_id: "stack-1", marker: 2, true_weight: 10 },
      { id: "cal-3", stack_id: "stack-1", marker: 3, true_weight: 15 },
    ]);

    const { getByLabelText, getByText } = renderScreen(<GymProfilesScreen />);

    // Wait for load and expand stack card
    await waitFor(() => expect(getByLabelText("My Stack, expand")).toBeTruthy());
    fireEvent.press(getByLabelText("My Stack, expand"));

    // Switch to Generate mode
    await waitFor(() => expect(getByText("Generate")).toBeTruthy());
    fireEvent.press(getByText("Generate"));

    // Enter different generator inputs
    const startInput = getByLabelText("Start weight in kg");
    const stepInput = getByLabelText("Increment in kg");
    const countInput = getByLabelText("Number of markers");

    fireEvent.changeText(startInput, "10");
    fireEvent.changeText(stepInput, "10");
    fireEvent.changeText(countInput, "3");

    // Press Generate button
    const generateBtn = getByLabelText("Generate calibrations from parameters");
    fireEvent.press(generateBtn);

    // Assert Alert.alert is triggered because we are changing the calibrations
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
      expect(alertSpy.mock.calls[0][0]).toBe("Overwrite calibrations?");
    });
  });

  it("QD-B: identical regen skips confirmation and saves directly", async () => {
    mockListCableStacks.mockResolvedValue([
      {
        id: "stack-1",
        gym_id: "gym-1",
        name: "My Stack",
        unit: "kg",
        position: 1,
        created_at: 1000,
        updated_at: 1000,
        gen_start_weight: 5,
        gen_increment: 5,
        gen_marker_count: 3,
      },
    ]);

    // Stack has existing calibrations matching the metadata
    mockListCalibrations.mockResolvedValue([
      { id: "cal-1", stack_id: "stack-1", marker: 1, true_weight: 5 },
      { id: "cal-2", stack_id: "stack-1", marker: 2, true_weight: 10 },
      { id: "cal-3", stack_id: "stack-1", marker: 3, true_weight: 15 },
    ]);

    const { getByLabelText, getByText } = renderScreen(<GymProfilesScreen />);

    // Wait for load and expand stack card
    await waitFor(() => expect(getByLabelText("My Stack, expand")).toBeTruthy());
    fireEvent.press(getByLabelText("My Stack, expand"));

    // Switch to Generate mode
    await waitFor(() => expect(getByText("Generate")).toBeTruthy());
    fireEvent.press(getByText("Generate"));

    // Enter identical generator inputs
    const startInput = getByLabelText("Start weight in kg");
    const stepInput = getByLabelText("Increment in kg");
    const countInput = getByLabelText("Number of markers");

    fireEvent.changeText(startInput, "5");
    fireEvent.changeText(stepInput, "5");
    fireEvent.changeText(countInput, "3");

    // Press Generate button
    const generateBtn = getByLabelText("Generate calibrations from parameters");
    fireEvent.press(generateBtn);

    // Assert Alert.alert is SKIPPED and generateStackCalibrations is called directly
    await waitFor(() => {
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mockGenerateStackCalibrations).toHaveBeenCalledWith("stack-1", {
        startWeight: 5,
        increment: 5,
        count: 3,
      });
    });
  });
});
