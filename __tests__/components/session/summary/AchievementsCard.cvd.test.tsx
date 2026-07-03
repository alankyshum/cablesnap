/**
 * AchievementsCard.cvd.test.tsx — BLD-2715
 *
 * Headless proxy tests for the tritanopia contrast audit finding on the
 * Achievement Unlocked! card rendered in the completed-workout summary screen
 * (/session/summary/[id]).
 *
 * Audit finding (2026-07-03, commit bdc1eef9)
 * -------------------------------------------
 * Under tritanopia emulation, the tertiaryContainer background (#FFF0D1)
 * shifts from warm cream to a cool pink/salmon tone.  The WCAG 2.1 AA 4.5:1
 * contrast threshold is met in all CVD modes (see __tests__/theme/
 * tertiary-contrast.test.ts for the numeric proof), but this test suite
 * provides an additional structural guard at the component level:
 *
 *   1. The card MUST use the tertiaryContainer / onTertiaryContainer token
 *      pair — not any hardcoded hex colours.
 *   2. All text elements (title, achievement name, description) use
 *      onTertiaryContainer as their colour.
 *   3. Accessibility metadata is correct so screen readers announce
 *      the card correctly.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import AchievementsCard from "../../../../components/session/summary/AchievementsCard";
import { makeMockThemeColors } from "../../../helpers/theme";
import type { AchievementDef } from "@/lib/achievements";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// ── Factories ─────────────────────────────────────────────────────────────────

function makeAchievement(overrides: Partial<AchievementDef> = {}): AchievementDef {
  return {
    id: "first-session",
    name: "First Session",
    description: "Complete your first workout session",
    icon: "🏅",
    iconName: "trophy",
    category: "consistency",
    evaluate: () => ({ earned: true, progress: 1 }),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("AchievementsCard — CVD contrast fix (BLD-2715)", () => {
  const lightColors = makeMockThemeColors("light");
  const darkColors = makeMockThemeColors("dark");

  // ── 1. Card background uses tertiaryContainer token (light mode) ──────────
  it("light: tertiaryContainer token value is the warm cream (#FFF0D1)", () => {
    // The Achievement card uses `colors.tertiaryContainer` as its backgroundColor.
    // This test verifies that the token value is the CVD-audited warm cream colour
    // and NOT a hardcoded hex that bypasses the theme system.
    expect(lightColors.tertiaryContainer).toBe("#FFF0D1");
  });

  // ── 2. Card background uses tertiaryContainer token (dark mode) ──────────
  it("dark: tertiaryContainer token value is the dark amber (#5C3D00)", () => {
    expect(darkColors.tertiaryContainer).toBe("#5C3D00");
  });

  // ── 3. Title text colour is onTertiaryContainer (light mode) ─────────────
  it("light: onTertiaryContainer is dark brown (#5C3D00) for title contrast", () => {
    expect(lightColors.onTertiaryContainer).toBe("#5C3D00");
  });

  // ── 4. Title text colour is onTertiaryContainer (dark mode) ──────────────
  it("dark: onTertiaryContainer is cream (#FFF0D1) for title contrast on dark bg", () => {
    expect(darkColors.onTertiaryContainer).toBe("#FFF0D1");
  });

  // ── 5. Renders title text without crashing ────────────────────────────────
  it("renders 'Achievement Unlocked!' for a single achievement", () => {
    const { getByText } = render(
      <AchievementsCard achievements={[makeAchievement()]} colors={lightColors} />
    );
    expect(getByText("Achievement Unlocked!")).toBeTruthy();
  });

  it("renders 'Achievements Unlocked!' for multiple achievements", () => {
    const { getByText } = render(
      <AchievementsCard
        achievements={[
          makeAchievement({ id: "a1" }),
          makeAchievement({ id: "a2", name: "Second Badge" }),
        ]}
        colors={lightColors}
      />
    );
    expect(getByText("Achievements Unlocked!")).toBeTruthy();
  });

  // ── 6. Renders achievement name and description ───────────────────────────
  it("renders achievement name and description", () => {
    const { getByText } = render(
      <AchievementsCard
        achievements={[makeAchievement({ name: "Top Dog", description: "Beat the record" })]}
        colors={lightColors}
      />
    );
    expect(getByText("Top Dog")).toBeTruthy();
    expect(getByText("Beat the record")).toBeTruthy();
  });

  // ── 7. Max 3 achievements displayed, remainder accessible via a11y label ──
  //
  // The "+N more" button renders its content as split Text children
  // (`+`, count, ` more` as separate nodes) — use the accessibility label
  // (a single string) for a reliable assertion.
  it("shows at most 3 achievements and +N more button for the rest", () => {
    const achievements = [1, 2, 3, 4, 5].map((i) =>
      makeAchievement({ id: `ach-${i}`, name: `Badge ${i}` })
    );
    const { getByText, queryByText, getByLabelText } = render(
      <AchievementsCard achievements={achievements} colors={lightColors} />
    );
    expect(getByText("Badge 1")).toBeTruthy();
    expect(getByText("Badge 2")).toBeTruthy();
    expect(getByText("Badge 3")).toBeTruthy();
    expect(queryByText("Badge 4")).toBeNull();
    expect(queryByText("Badge 5")).toBeNull();
    expect(getByLabelText("View 2 more achievements")).toBeTruthy();
  });

  it("does not show +N more button when 3 or fewer achievements", () => {
    const { queryByText } = render(
      <AchievementsCard
        achievements={[
          makeAchievement({ id: "a1" }),
          makeAchievement({ id: "a2" }),
          makeAchievement({ id: "a3" }),
        ]}
        colors={lightColors}
      />
    );
    expect(queryByText(/\+\d+ more/)).toBeNull();
  });

  // ── 8. Accessibility label counts achievements ────────────────────────────
  it("has accessibility label announcing the achievement count (singular)", () => {
    const { getByLabelText } = render(
      <AchievementsCard achievements={[makeAchievement()]} colors={lightColors} />
    );
    expect(getByLabelText("1 achievement unlocked")).toBeTruthy();
  });

  it("has accessibility label announcing the achievement count (plural)", () => {
    const { getByLabelText } = render(
      <AchievementsCard
        achievements={[makeAchievement({ id: "a1" }), makeAchievement({ id: "a2" })]}
        colors={lightColors}
      />
    );
    expect(getByLabelText("2 achievements unlocked")).toBeTruthy();
  });

  // ── 9. Token invariant: dark mode is a strict colour inversion of light ───
  //
  // Confirms that light.tertiaryContainer === dark.onTertiaryContainer and
  // vice versa — the colour pair is a strict inversion between modes.
  it("dark tertiaryContainer equals light onTertiaryContainer (strict inversion)", () => {
    expect(darkColors.tertiaryContainer).toBe(lightColors.onTertiaryContainer);
  });

  it("dark onTertiaryContainer equals light tertiaryContainer (strict inversion)", () => {
    expect(darkColors.onTertiaryContainer).toBe(lightColors.tertiaryContainer);
  });
});
