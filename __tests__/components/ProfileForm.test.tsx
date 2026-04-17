import React from "react";
import { fireEvent, waitFor } from "@testing-library/react-native";
import ProfileForm from "../../components/ProfileForm";
import BodyProfileCard from "../../components/BodyProfileCard";
import { renderScreen } from "../helpers/render";

// Mock db
const mockGetAppSetting = jest.fn();
const mockSetAppSetting = jest.fn();
const mockUpdateMacroTargets = jest.fn();
jest.mock("../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  updateMacroTargets: (...args: unknown[]) => mockUpdateMacroTargets(...args),
}));

const mockGetBodySettings = jest.fn();
const mockGetLatestBodyWeight = jest.fn();
jest.mock("../../lib/db/body", () => ({
  getBodySettings: (...args: unknown[]) => mockGetBodySettings(...args),
  getLatestBodyWeight: (...args: unknown[]) => mockGetLatestBodyWeight(...args),
}));

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require("react");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useEffect(() => { cb(); }, []);
  },
}));

const mockProfile = {
  birthYear: 1996,
  weight: 75,
  height: 175,
  sex: "male" as const,
  activityLevel: "moderately_active" as const,
  goal: "maintain" as const,
  weightUnit: "kg" as const,
  heightUnit: "cm" as const,
};

const bodySettings = {
  weight_unit: "kg" as const,
  measurement_unit: "cm" as const,
  weight_goal: null,
  body_fat_goal: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetBodySettings.mockResolvedValue(bodySettings);
  mockGetLatestBodyWeight.mockResolvedValue(null);
  mockGetAppSetting.mockResolvedValue(null);
  mockSetAppSetting.mockResolvedValue(undefined);
  mockUpdateMacroTargets.mockResolvedValue(undefined);
});

describe("ProfileForm", () => {
  it("renders form fields", async () => {
    const { getByLabelText } = renderScreen(
      <ProfileForm onSave={jest.fn()} />
    );
    await waitFor(() => {
      expect(getByLabelText("Birth year")).toBeTruthy();
      expect(getByLabelText("Weight in kg")).toBeTruthy();
      expect(getByLabelText("Height in cm")).toBeTruthy();
    });
  });

  it("pre-fills form when initialProfile is provided", async () => {
    const { getByLabelText } = renderScreen(
      <ProfileForm initialProfile={mockProfile} onSave={jest.fn()} />
    );
    await waitFor(() => {
      expect(getByLabelText("Birth year").props.value).toBe("1996");
      expect(getByLabelText("Weight in kg").props.value).toBe("75");
      expect(getByLabelText("Height in cm").props.value).toBe("175");
    });
  });

  it("shows validation errors for empty fields", async () => {
    const onSave = jest.fn();
    const { getByLabelText, getByText } = renderScreen(
      <ProfileForm onSave={onSave} />
    );
    await waitFor(() => {
      expect(getByLabelText("Birth year")).toBeTruthy();
    });
    fireEvent.press(getByText("Calculate & Save"));
    const currentYear = new Date().getFullYear();
    await waitFor(() => {
      expect(getByText(`Enter a valid birth year (1900–${currentYear - 1})`)).toBeTruthy();
      expect(getByText("Enter a valid weight")).toBeTruthy();
      expect(getByText("Enter a valid height")).toBeTruthy();
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves profile and calls onSave on valid input", async () => {
    const onSave = jest.fn();
    const { getByLabelText, getByText } = renderScreen(
      <ProfileForm initialProfile={mockProfile} onSave={onSave} />
    );
    await waitFor(() => {
      expect(getByLabelText("Birth year").props.value).toBe("1996");
    });
    fireEvent.press(getByText("Calculate & Save"));
    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith(
        "nutrition_profile",
        expect.any(String)
      );
      expect(mockUpdateMacroTargets).toHaveBeenCalled();
      expect(onSave).toHaveBeenCalled();
    });
  });

  it("renders Cancel button when onCancel is provided", async () => {
    const onCancel = jest.fn();
    const { getByText } = renderScreen(
      <ProfileForm onSave={jest.fn()} onCancel={onCancel} />
    );
    await waitFor(() => {
      expect(getByText("Cancel")).toBeTruthy();
    });
    fireEvent.press(getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onDirtyChange when form values change", async () => {
    const onDirtyChange = jest.fn();
    const { getByLabelText } = renderScreen(
      <ProfileForm onSave={jest.fn()} onDirtyChange={onDirtyChange} />
    );
    await waitFor(() => {
      expect(getByLabelText("Birth year")).toBeTruthy();
    });
    fireEvent.changeText(getByLabelText("Birth year"), "1995");
    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenCalledWith(true);
    });
  });

  it("shows save error on failure", async () => {
    mockSetAppSetting.mockRejectedValue(new Error("DB error"));
    const { getByLabelText, getByText } = renderScreen(
      <ProfileForm initialProfile={mockProfile} onSave={jest.fn()} />
    );
    await waitFor(() => {
      expect(getByLabelText("Birth year").props.value).toBe("1996");
    });
    fireEvent.press(getByText("Calculate & Save"));
    await waitFor(() => {
      expect(getByText("Could not save your profile. Please try again.")).toBeTruthy();
    });
  });
});

describe("BodyProfileCard", () => {
  it("shows loading state initially", () => {
    mockGetAppSetting.mockReturnValue(new Promise(() => {})); // never resolves
    mockGetBodySettings.mockReturnValue(new Promise(() => {}));
    mockGetLatestBodyWeight.mockReturnValue(new Promise(() => {}));
    const { getByText } = renderScreen(<BodyProfileCard />);
    expect(getByText("Loading profile…")).toBeTruthy();
  });

  it("shows inline form fields when no profile exists", async () => {
    mockGetAppSetting.mockResolvedValue(null);
    const { getByText, getByLabelText } = renderScreen(<BodyProfileCard />);
    await waitFor(() => {
      expect(getByText("Body Profile")).toBeTruthy();
      expect(getByLabelText("Birth year")).toBeTruthy();
      expect(getByLabelText("Weight in kg")).toBeTruthy();
      expect(getByLabelText("Height in cm")).toBeTruthy();
    });
  });

  it("pre-fills inline fields when profile exists", async () => {
    mockGetAppSetting.mockResolvedValue(JSON.stringify(mockProfile));
    const { getByLabelText } = renderScreen(<BodyProfileCard />);
    await waitFor(() => {
      expect(getByLabelText("Birth year").props.value).toBe("1996");
      expect(getByLabelText("Weight in kg").props.value).toBe("75");
      expect(getByLabelText("Height in cm").props.value).toBe("175");
    });
  });

  it("shows error state and retry button on fetch failure", async () => {
    mockGetAppSetting.mockRejectedValue(new Error("Network error"));
    mockGetBodySettings.mockRejectedValue(new Error("Network error"));
    const { getByText } = renderScreen(<BodyProfileCard />);
    await waitFor(() => {
      expect(getByText("Could not load profile")).toBeTruthy();
      expect(getByText("Retry")).toBeTruthy();
    });
  });

  it("retries loading on Retry press", async () => {
    mockGetAppSetting.mockRejectedValueOnce(new Error("fail"));
    mockGetBodySettings.mockRejectedValueOnce(new Error("fail"));
    mockGetLatestBodyWeight.mockRejectedValueOnce(new Error("fail"));
    const { getByText } = renderScreen(<BodyProfileCard />);
    await waitFor(() => {
      expect(getByText("Retry")).toBeTruthy();
    });
    mockGetAppSetting.mockResolvedValue(JSON.stringify(mockProfile));
    mockGetBodySettings.mockResolvedValue(bodySettings);
    mockGetLatestBodyWeight.mockResolvedValue(null);
    fireEvent.press(getByText("Retry"));
    await waitFor(() => {
      expect(getByText("Body Profile")).toBeTruthy();
    });
  });

  it("auto-saves on field blur with valid input", async () => {
    mockGetAppSetting.mockResolvedValue(JSON.stringify(mockProfile));
    const { getByLabelText } = renderScreen(<BodyProfileCard />);
    await waitFor(() => {
      expect(getByLabelText("Birth year").props.value).toBe("1996");
    });
    fireEvent.changeText(getByLabelText("Birth year"), "1995");
    fireEvent(getByLabelText("Birth year"), "blur");
    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith(
        "nutrition_profile",
        expect.any(String)
      );
      expect(mockUpdateMacroTargets).toHaveBeenCalled();
    });
  });

  it("shows validation error on blur with invalid input", async () => {
    mockGetAppSetting.mockResolvedValue(JSON.stringify(mockProfile));
    const { getByLabelText, getByText } = renderScreen(<BodyProfileCard />);
    await waitFor(() => {
      expect(getByLabelText("Birth year").props.value).toBe("1996");
    });
    fireEvent.changeText(getByLabelText("Birth year"), "");
    fireEvent(getByLabelText("Birth year"), "blur");
    const currentYear = new Date().getFullYear();
    await waitFor(() => {
      expect(getByText(`Enter a valid birth year (1900–${currentYear - 1})`)).toBeTruthy();
    });
    expect(mockSetAppSetting).not.toHaveBeenCalled();
  });

  it("auto-saves when segment button changes", async () => {
    mockGetAppSetting.mockResolvedValue(JSON.stringify(mockProfile));
    const { getByText, getByLabelText } = renderScreen(<BodyProfileCard />);
    await waitFor(() => {
      expect(getByLabelText("Birth year").props.value).toBe("1996");
    });
    fireEvent.press(getByText("Bulk"));
    await waitFor(() => {
      expect(mockSetAppSetting).toHaveBeenCalledWith(
        "nutrition_profile",
        expect.any(String)
      );
    });
  });
});

describe("ProfileForm accessibility", () => {
  it("activity dropdown has accessibilityState with expanded property", async () => {
    const { getByLabelText } = renderScreen(
      <ProfileForm onSave={jest.fn()} />
    );
    await waitFor(() => {
      const dropdown = getByLabelText(/Activity level:/);
      expect(dropdown.props.accessibilityState).toBeDefined();
      expect(dropdown.props.accessibilityState).toHaveProperty("expanded");
    });
  });
});
