/**
 * BLD-582 — PreferencesCard discoverability helper row.
 *
 * AC-2 (locked copy), AC-3 (non-pressable + a11y role), AC-4 (no FOUC),
 * AC-5 (auto-dismiss on interaction), AC-6 (no re-show for returning
 * user), AC-12 (dev-surface silent on decode failure — by construction,
 * helper row is unrelated to the audio decode path; assert no console
 * noise is emitted while rendering it).
 */
import React from "react";
import { waitFor, act, fireEvent } from "@testing-library/react-native";
import { render } from "@testing-library/react-native";

// Mocks must come BEFORE the component import.
jest.mock("expo-audio", () => ({
  createAudioPlayer: jest.fn(() => ({ seekTo: jest.fn(), play: jest.fn(), release: jest.fn() })),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: "medium" },
}));

const mockGet = jest.fn();
const mockSet = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGet(...args),
  setAppSetting: (...args: unknown[]) => mockSet(...args),
}));

import PreferencesCard from "@/components/settings/PreferencesCard";
import type { ThemeColors } from "@/hooks/useThemeColors";

const mockColors: Partial<ThemeColors> = {
  surface: "#FFFFFF",
  onSurface: "#111827",
  onSurfaceVariant: "#6B7280",
  surfaceVariant: "#F3F4F6",
  primary: "#3B82F6",
};

const mockToast = {
  error: jest.fn(),
  success: jest.fn(),
  info: jest.fn(),
} as unknown as Parameters<typeof PreferencesCard>[0]["toast"];

const LOCKED_COPY = "Plays a short confirmation cue when you complete a set.";
const HELPER_TID = "set-complete-audio-helper";

type StoredValues = Partial<Record<string, string | null>>;

function setStored(values: StoredValues) {
  mockGet.mockImplementation((key: string) =>
    Promise.resolve(key in values ? values[key] ?? null : null),
  );
}

function renderCard() {
  return render(
    <PreferencesCard
      colors={mockColors as ThemeColors}
      toast={mockToast}
      soundEnabled={true}
      setSoundEnabled={jest.fn()}
    />,
  );
}

describe("PreferencesCard discoverability helper (BLD-582)", () => {
  let consoleError: jest.SpyInstance;
  let consoleWarn: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it("AC-4: helper row is NOT rendered before hydration completes (no FOUC)", () => {
    // Return a never-resolving promise to block hydration.
    mockGet.mockImplementation(() => new Promise(() => {}));
    const { queryByTestId, queryByText } = renderCard();
    expect(queryByTestId(HELPER_TID)).toBeNull();
    expect(queryByText(LOCKED_COPY)).toBeNull();
  });

  it("AC-1 + AC-2: shows helper row with EXACT locked copy for a fresh user", async () => {
    setStored({ "feedback.setComplete.audio": null });
    const { findByTestId, getByTestId } = renderCard();
    const row = await findByTestId(HELPER_TID);
    expect(row).toBeTruthy();
    // Byte-for-byte copy assertion. .props.children is the rendered string.
    expect(getByTestId(HELPER_TID).props.children).toBe(LOCKED_COPY);
  });

  it("AC-3: helper row is non-pressable and has accessibilityRole='text'", async () => {
    setStored({ "feedback.setComplete.audio": null });
    const { findByTestId } = renderCard();
    const row = await findByTestId(HELPER_TID);
    expect(row.props.accessibilityRole).toBe("text");
    expect(row.props.onPress).toBeUndefined();
    expect(row.props.onPressIn).toBeUndefined();
    expect(row.props.onPressOut).toBeUndefined();
    expect(row.props.onLongPress).toBeUndefined();
    // Pressable / TouchableOpacity wrappers set accessibilityRole='button';
    // the helper's ancestor chain must not do that.
    let node: any = row;
    while (node) {
      if (node.props?.accessibilityRole === "button") {
        throw new Error("helper row has a pressable ancestor");
      }
      node = node.parent;
    }
  });

  it("AC-6: helper row is NOT rendered when stored value is non-null (returning user)", async () => {
    setStored({ "feedback.setComplete.audio": "false" });
    const { queryByTestId, findByText } = renderCard();
    // Wait for hydration by waiting on a known stable element.
    await findByText("Preferences");
    await waitFor(() => {
      // Allow hydration microtasks to flush.
      expect(mockGet).toHaveBeenCalled();
    });
    // Flush any post-hydration setState.
    await act(async () => { await Promise.resolve(); });
    expect(queryByTestId(HELPER_TID)).toBeNull();
  });

  it("AC-5: helper row disappears permanently after toggling the switch", async () => {
    setStored({ "feedback.setComplete.audio": null });
    const { findByTestId, findByLabelText, queryByTestId } = renderCard();
    await findByTestId(HELPER_TID);

    const sw = await findByLabelText("Sound on set complete");
    await act(async () => {
      fireEvent(sw, "valueChange", true);
      await Promise.resolve();
    });

    expect(queryByTestId(HELPER_TID)).toBeNull();
  });

  it("AC-12 (partial): mounts cleanly without emitting console.error or console.warn", async () => {
    setStored({ "feedback.setComplete.audio": null });
    const { findByTestId } = renderCard();
    await findByTestId(HELPER_TID);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it("AC-13 (token-only): helper row uses the onSurfaceVariant theme token (no hardcoded hex)", async () => {
    setStored({ "feedback.setComplete.audio": null });
    const { findByTestId } = renderCard();
    const row = await findByTestId(HELPER_TID);
    const styles = Array.isArray(row.props.style) ? row.props.style.flat() : [row.props.style];
    const color = styles.map((s: any) => s?.color).find(Boolean);
    expect(color).toBe(mockColors.onSurfaceVariant);
  });
});
