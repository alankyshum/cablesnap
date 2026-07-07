/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react-native";
import ShareSettingsCard from "../../components/settings/ShareSettingsCard";
import { stravaLog } from "../../lib/strava-telemetry";

jest.mock("../../lib/strava-telemetry", () => ({
  stravaLog: jest.fn(),
  captureStravaError: jest.fn(),
  stravaBreakcrumb: jest.fn(),
}));

const mockUpdate = jest.fn();
jest.mock("../../hooks/useShareSettings", () => ({
  useShareSettings: () => ({
    settings: {
      promo_caption: "Draft Caption",
      promo_caption_enabled: 1,
      strava_description_enabled: 1,
    },
    effectiveCaption: "Draft Caption",
    update: mockUpdate,
    DEFAULT_PROMO_CAPTION: "Tracked with CableSnap",
  }),
}));

describe("ShareSettingsCard", () => {
  const colors = {
    surface: "#fff",
    onSurface: "#000",
    onSurfaceVariant: "#555",
    surfaceVariant: "#eee",
    primary: "#00f",
    outline: "#ccc",
    onSurfaceDisabled: "#aaa",
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fires strava_description_toggled when toggled", async () => {
    const { getByLabelText } = render(<ShareSettingsCard colors={colors} />);
    const toggle = getByLabelText("Toggle appending promo to Strava description");

    await act(async () => {
      fireEvent(toggle, "valueChange", false);
    });

    expect(stravaLog).toHaveBeenCalledWith("info", "strava_description_toggled", { enabled: false });
    expect(mockUpdate).toHaveBeenCalledWith({ strava_description_enabled: 0 });
  });

  it("fires promo_caption_disabled when promo toggled off", async () => {
    const { getByLabelText } = render(<ShareSettingsCard colors={colors} />);
    const toggle = getByLabelText("Toggle promotional caption");

    await act(async () => {
      fireEvent(toggle, "valueChange", false);
    });

    expect(stravaLog).toHaveBeenCalledWith("info", "promo_caption_disabled");
    expect(mockUpdate).toHaveBeenCalledWith({ promo_caption_enabled: 0 });
  });

  it("fires promo_caption_saved_default when editing and saving custom caption", async () => {
    const { getByText, getByLabelText } = render(<ShareSettingsCard colors={colors} bareContent />);
    
    // Press Edit caption
    const editBtn = getByText("Edit caption");
    fireEvent.press(editBtn);

    // Edit the text
    const input = getByLabelText("Edit promotional caption");
    fireEvent.changeText(input, "New Custom Caption");

    // Press Save
    const saveBtn = getByText("Save");
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(stravaLog).toHaveBeenCalledWith("info", "promo_caption_saved_default", { captionLength: 18 });
    expect(mockUpdate).toHaveBeenCalledWith({ promo_caption: "New Custom Caption" });
  });
});
