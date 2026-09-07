import React from "react";
import { render } from "@testing-library/react-native";
import { Colors } from "@/theme/colors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { CoachThinkingIndicator } from "@/components/coach/CoachThinkingIndicator";
import { CoachToolBadge } from "@/components/coach/CoachToolBadge";
import * as reducedMotionHook from "@/hooks/useReducedMotion";
import { t } from "@/lib/i18n";

// Helper to compute WCAG relative luminance and contrast ratio
function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function hexToRgb(hex: string): [number, number, number] {
  const cleaned = hex.replace("#", "");
  const num = parseInt(cleaned, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function getLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function calcContrast(fgHex: string, bgHex: string): number {
  const l1 = getLuminance(fgHex);
  const l2 = getLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("CoachThinkingIndicator", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders default thinking state with translated label and 3 dots", () => {
    const { getByTestId, getByText } = render(<CoachThinkingIndicator />);

    expect(getByTestId("coach-thinking-indicator")).toBeTruthy();
    expect(getByTestId("coach-thinking-dot-0")).toBeTruthy();
    expect(getByTestId("coach-thinking-dot-1")).toBeTruthy();
    expect(getByTestId("coach-thinking-dot-2")).toBeTruthy();
    expect(getByText(t({ id: "components.coach.thinking", message: "Thinking..." }))).toBeTruthy();
  });

  it("renders tool-specific label when tool is running", () => {
    const toolLabel = t({ id: "components.coach.toolExerciseProgress", message: "Analyzing exercise progress" });
    const { getByText, getByTestId } = render(<CoachThinkingIndicator label={toolLabel} />);

    expect(getByText(toolLabel)).toBeTruthy();
    const indicator = getByTestId("coach-thinking-indicator");
    expect(indicator.props.accessibilityLabel).toBe(toolLabel);
  });

  it("respects reduced-motion preference", () => {
    jest.spyOn(reducedMotionHook, "useReducedMotion").mockReturnValue(true);

    const { getByTestId, getByText } = render(<CoachThinkingIndicator />);

    expect(getByTestId("coach-thinking-indicator")).toBeTruthy();
    expect(getByText("Thinking...")).toBeTruthy();
    expect(getByTestId("coach-thinking-dot-0")).toBeTruthy();
    expect(getByTestId("coach-thinking-dot-1")).toBeTruthy();
    expect(getByTestId("coach-thinking-dot-2")).toBeTruthy();
  });

  it("has accessible progressbar role and liveRegion for screen readers", () => {
    const { getByTestId } = render(
      <CoachThinkingIndicator accessibilityLabel="AI Coach is thinking" />
    );

    const indicator = getByTestId("coach-thinking-indicator");
    expect(indicator.props.accessibilityRole).toBe("progressbar");
    expect(indicator.props.accessibilityLiveRegion).toBe("polite");
    expect(indicator.props.accessibilityLabel).toBe("AI Coach is thinking");
  });

  it("enforces strict design tokens: spacing divisible by 4, valid radii and fontSizes", () => {
    const { getByTestId, getByText } = render(<CoachThinkingIndicator />);

    const indicator = getByTestId("coach-thinking-indicator");
    const containerStyle = Object.assign({}, ...[].concat(indicator.props.style));

    expect(containerStyle.paddingHorizontal).toBe(spacing.md);
    expect(containerStyle.paddingHorizontal % 4).toBe(0);
    expect(containerStyle.paddingVertical).toBe(spacing.sm);
    expect(containerStyle.paddingVertical % 4).toBe(0);
    expect(containerStyle.gap).toBe(spacing.sm);
    expect(containerStyle.gap % 4).toBe(0);

    const dot = getByTestId("coach-thinking-dot-0");
    const dotStyle = Object.assign({}, ...[].concat(dot.props.style));
    expect(dotStyle.borderRadius).toBe(radii.pill);

    const label = getByText("Thinking...");
    const labelStyle = Object.assign({}, ...[].concat(label.props.style));
    expect(labelStyle.fontSize).toBe(fontSizes.sm);
  });

  it("verifies numerical WCAG AA contrast (>= 4.5:1) in both light and dark themes", () => {
    // 1. Dark Mode: Bubble background is surfaceVariant (Colors.dark.muted = #21262D)
    //    Text and dots use onSurface (Colors.dark.foreground = #F0F2F5)
    const darkBg = Colors.dark.muted; // #21262D
    const darkFg = Colors.dark.foreground; // #F0F2F5
    const darkContrast = calcContrast(darkFg, darkBg);
    expect(darkContrast).toBeGreaterThanOrEqual(4.5);
    expect(darkContrast).toBeCloseTo(13.53, 1);

    // 2. Light Mode: Bubble background is surfaceVariant (Colors.light.muted = #E5E7EB)
    //    Text and dots use onSurface (Colors.light.foreground = #1A2138)
    const lightBg = Colors.light.muted; // #E5E7EB
    const lightFg = Colors.light.foreground; // #1A2138
    const lightContrast = calcContrast(lightFg, lightBg);
    expect(lightContrast).toBeGreaterThanOrEqual(4.5);
    expect(lightContrast).toBeCloseTo(12.85, 1);
  });
});

describe("CoachToolBadge", () => {
  it("renders tool badge with wrench icon and label", () => {
    const label = "Analyzing exercise progress...";
    const { getByTestId, getByText } = render(<CoachToolBadge label={label} isStreaming={true} />);

    expect(getByTestId("coach-tool-badge")).toBeTruthy();
    expect(getByText(label)).toBeTruthy();
  });

  it("enforces strict design tokens on CoachToolBadge", () => {
    const { getByTestId, getByText } = render(
      <CoachToolBadge label="Reading workout history" isStreaming={false} />
    );

    const badge = getByTestId("coach-tool-badge");
    const badgeStyle = Object.assign({}, ...[].concat(badge.props.style));

    expect(badgeStyle.paddingHorizontal).toBe(spacing.sm);
    expect(badgeStyle.paddingHorizontal % 4).toBe(0);
    expect(badgeStyle.paddingVertical).toBe(spacing.xs);
    expect(badgeStyle.paddingVertical % 4).toBe(0);
    expect(badgeStyle.borderRadius).toBe(radii.sm);

    const label = getByText("Reading workout history");
    const labelStyle = Object.assign({}, ...[].concat(label.props.style));
    expect(labelStyle.fontSize).toBe(fontSizes.xs);
  });

  it("verifies numerical contrast for CoachToolBadge on surface in light and dark modes", () => {
    // Badge sits on Colors.light.card / Colors.dark.card with Colors.light.foreground / Colors.dark.foreground
    const darkCard = Colors.dark.card; // #161B22
    const darkFg = Colors.dark.foreground; // #F0F2F5
    const darkBadgeContrast = calcContrast(darkFg, darkCard);
    expect(darkBadgeContrast).toBeGreaterThanOrEqual(4.5);
    expect(darkBadgeContrast).toBeGreaterThan(14.0);

    const lightCard = Colors.light.card; // #F3F4F6
    const lightFg = Colors.light.foreground; // #1A2138
    const lightBadgeContrast = calcContrast(lightFg, lightCard);
    expect(lightBadgeContrast).toBeGreaterThanOrEqual(4.5);
    expect(lightBadgeContrast).toBeGreaterThan(14.0);
  });
});
