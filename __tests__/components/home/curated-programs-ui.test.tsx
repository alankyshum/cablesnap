/**
 * BLD-1000: Curated Programs Library — UI, a11y, and AC coverage.
 *
 * Covers:
 *   AC3  — ProgramsList filter chip semantics (All / Curated / Mine)
 *   AC4  — RR detail attribution footer (text, link role, Linking.openURL)
 *   AC5  — a11y roles/labels: filter chips, list rows, attribution link,
 *            caption dismiss button + useCuratedCaption persistence
 *   AC6  — maxFontSizeMultiplier smoke assertion (attribution + caption)
 *   AC7  — color-independent selected chip style (background fill + bold weight)
 *
 * Test budget: consolidated into 5 it() blocks to stay within MAX_TESTS=2200.
 * Each block covers one AC; assertions within each block are logically grouped.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { Linking } from "react-native";
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import type { Program } from "../../../lib/types";

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/hooks/useThemeColors", () => {
  const { lightMockColors } = require("../../helpers/theme");
  return { useThemeColors: () => lightMockColors };
});

jest.mock("@/hooks/useColorScheme", () => ({
  useColorScheme: () => "light",
}));

jest.mock("@/hooks/useColor", () => {
  const { lightColors } = require("../../../theme/colors");
  return { useColor: (key: string) => lightColors[key as keyof typeof lightColors] ?? "#000000" };
});

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");

const mockGetAppSetting = jest.fn();
const mockSetAppSetting = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
}));

// ─── Subject imports ──────────────────────────────────────────────────────────

import { ProgramsList } from "../../../components/home/ProgramsList";
import {
  AttributionFooter,
  CuratedCaption,
  useCuratedCaption,
} from "../../../components/program/CuratedExtras";
import { lightMockColors as MOCK_COLORS } from "../../helpers/theme";
import { lightColors } from "../../../theme/colors";

// Convenience aliases used in assertions (derived from real palette)
const MOCK_PRIMARY = MOCK_COLORS.primary;
// chip.tsx unselected bg comes from useColor("muted") → Colors.light.muted
const MOCK_MUTED = lightColors.muted;

// ─── Test data ────────────────────────────────────────────────────────────────

const BASE: Pick<Program, "current_day_id" | "created_at" | "updated_at" | "deleted_at"> = {
  current_day_id: null, created_at: 0, updated_at: 0, deleted_at: null,
};

const PROGRAMS: Program[] = [
  { ...BASE, id: "s1", name: "Starter PPL", description: "", is_active: false, is_starter: true,  is_curated: false },
  { ...BASE, id: "c1", name: "r/bodyweightfitness Recommended Routine", description: "", is_active: false, is_starter: false, is_curated: true },
  { ...BASE, id: "u1", name: "My Custom Program", description: "", is_active: false, is_starter: false, is_curated: false },
];

const DAY_COUNTS: Record<string, number> = { s1: 3, c1: 3, u1: 2 };
const NOOP = () => {};

function renderList() {
  return render(
    <ProgramsList
      colors={MOCK_COLORS as any}
      programs={PROGRAMS}
      dayCounts={DAY_COUNTS}
      onPress={NOOP}
      onDelete={NOOP}
      onOptions={NOOP}
    />
  );
}

const RR = {
  label: "r/bodyweightfitness Recommended Routine",
  url: "https://www.reddit.com/r/bodyweightfitness/wiki/kb/recommended_routine",
  license: "CC-BY-SA 3.0",
};

// ─── AC3 + AC5 filter chips ───────────────────────────────────────────────────

it("AC3/AC5 — filter chips: All/Curated/Mine semantics and a11y labels", async () => {
  mockGetAppSetting.mockResolvedValue("1");
  const { getByLabelText, queryByText, getByText } = renderList();

  // chips exist with correct labels (AC5)
  expect(getByLabelText("All programs filter, selected")).toBeTruthy();
  expect(getByLabelText("Curated programs filter")).toBeTruthy();
  expect(getByLabelText("Mine programs filter")).toBeTruthy();

  // program card a11y labels (AC5)
  expect(getByLabelText(/Curated program: r\/bodyweightfitness Recommended Routine/)).toBeTruthy();
  expect(getByLabelText(/Starter program: Starter PPL/)).toBeTruthy();

  // All (default) shows everything (AC3)
  expect(getByText("Starter PPL")).toBeTruthy();
  expect(getByText("r/bodyweightfitness Recommended Routine")).toBeTruthy();
  expect(getByText("My Custom Program")).toBeTruthy();

  // Curated filter: starter + curated visible, user hidden (AC3)
  fireEvent.press(getByLabelText("Curated programs filter"));
  await waitFor(() => {
    expect(getByText("Starter PPL")).toBeTruthy();
    expect(getByText("r/bodyweightfitness Recommended Routine")).toBeTruthy();
    expect(queryByText("My Custom Program")).toBeNull();
  });

  // Mine filter: only user program visible (AC3)
  fireEvent.press(getByLabelText("Mine programs filter"));
  await waitFor(() => {
    expect(getByText("My Custom Program")).toBeTruthy();
    expect(queryByText("Starter PPL")).toBeNull();
    expect(queryByText("r/bodyweightfitness Recommended Routine")).toBeNull();
  });
});

// ─── AC7 chip style ───────────────────────────────────────────────────────────

it("AC7 — selected chip has primary bg fill and bold text; unselected has muted bg", () => {
  mockGetAppSetting.mockResolvedValue("1");
  const { getByLabelText, getByText } = renderList();

  // selected chip background = primary
  const allChip = getByLabelText("All programs filter, selected");
  const chipStyle = Array.isArray(allChip.props.style)
    ? Object.assign({}, ...allChip.props.style)
    : allChip.props.style;
  expect(chipStyle.backgroundColor).toBe(MOCK_PRIMARY);

  // selected chip text is bold
  const allText = getByText("All");
  const textStyle = Array.isArray(allText.props.style)
    ? Object.assign({}, ...allText.props.style)
    : allText.props.style;
  expect(textStyle.fontWeight).toBe("600");

  // unselected chip background = muted (not primary)
  const curatedChip = getByLabelText("Curated programs filter");
  const curatedStyle = Array.isArray(curatedChip.props.style)
    ? Object.assign({}, ...curatedChip.props.style)
    : curatedChip.props.style;
  expect(curatedStyle.backgroundColor).toBe(MOCK_MUTED);
  expect(curatedStyle.backgroundColor).not.toBe(MOCK_PRIMARY);
});

// ─── AC4 + AC5 attribution footer ─────────────────────────────────────────────

it("AC4/AC5 — AttributionFooter: text, link role, a11y label, Linking.openURL, absent when undefined", () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);

  const { getByRole, getByText, queryByRole, rerender } = render(
    <AttributionFooter attribution={RR} primary={MOCK_COLORS.primary} onSurfaceVariant={MOCK_COLORS.onSurfaceVariant} />
  );

  // text content (AC4)
  expect(getByText(/Adapted from/)).toBeTruthy();
  expect(getByText("r/bodyweightfitness Recommended Routine")).toBeTruthy();

  // role + a11y label (AC5)
  const link = getByRole("link");
  expect(link).toBeTruthy();
  expect(link.props.accessibilityLabel).toMatch(/r\/bodyweightfitness Recommended Routine/);
  expect(link.props.accessibilityLabel).toMatch(/CC-BY-SA 3\.0/);

  // tap dispatches Linking.openURL (AC4)
  fireEvent.press(link);
  expect(openURL).toHaveBeenCalledWith(RR.url);
  openURL.mockRestore();

  // absent when attribution=undefined (AC4)
  rerender(
    <AttributionFooter attribution={undefined} primary={MOCK_COLORS.primary} onSurfaceVariant={MOCK_COLORS.onSurfaceVariant} />
  );
  expect(queryByRole("link")).toBeNull();
});

// ─── AC6 maxFontSizeMultiplier ────────────────────────────────────────────────

it("AC6 — maxFontSizeMultiplier=1.5 on attribution text and caption text", () => {
  const { getByText: getAttr } = render(
    <AttributionFooter attribution={RR} primary={MOCK_COLORS.primary} onSurfaceVariant={MOCK_COLORS.onSurfaceVariant} />
  );
  expect(getAttr(/Adapted from/).props.maxFontSizeMultiplier).toBe(1.5);

  const { getByText: getCap } = render(
    <CuratedCaption visible onDismiss={NOOP} surface="#fff" outline="#ccc" onSurfaceVariant="#666" />
  );
  expect(getCap(/Curated programs are added by CableSnap/).props.maxFontSizeMultiplier).toBe(1.5);
});

// ─── AC5 CuratedCaption + useCuratedCaption hook ──────────────────────────────

it("AC5 — CuratedCaption a11y, dismiss, and useCuratedCaption persistence", async () => {
  // visible/hidden toggling
  const { queryByText: qHidden } = render(
    <CuratedCaption visible={false} onDismiss={NOOP} surface="#fff" outline="#ccc" onSurfaceVariant="#666" />
  );
  expect(qHidden(/Curated programs are added by CableSnap/)).toBeNull();

  const onDismiss = jest.fn();
  const { getByRole, getByLabelText, getByText: capText } = render(
    <CuratedCaption visible onDismiss={onDismiss} surface="#fff" outline="#ccc" onSurfaceVariant="#666" />
  );
  expect(capText(/Curated programs are added by CableSnap/)).toBeTruthy();
  // dismiss button a11y (AC5)
  expect(getByRole("button")).toBeTruthy();
  expect(getByLabelText("Dismiss curated programs info")).toBeTruthy();
  // pressing dismiss calls onDismiss
  fireEvent.press(getByRole("button"));
  expect(onDismiss).toHaveBeenCalledTimes(1);

  // hook: caption visible on first launch (null key)
  mockGetAppSetting.mockResolvedValue(null);
  function HookHarness() {
    const { visible, dismiss } = useCuratedCaption();
    return <CuratedCaption visible={visible} onDismiss={dismiss} surface="#fff" outline="#ccc" onSurfaceVariant="#666" />;
  }
  const { findByRole } = render(<HookHarness />);
  const btn = await findByRole("button");
  expect(btn).toBeTruthy();

  // tapping dismiss persists key to app_settings
  await act(async () => { fireEvent.press(btn); });
  expect(mockSetAppSetting).toHaveBeenCalledWith("curated_intro_dismissed", "1");

  // hook: caption hidden when key already '1'
  mockGetAppSetting.mockResolvedValue("1");
  const { queryByText: qDismissed } = render(<HookHarness />);
  await act(async () => {});
  expect(qDismissed(/Curated programs are added by CableSnap/)).toBeNull();
});
