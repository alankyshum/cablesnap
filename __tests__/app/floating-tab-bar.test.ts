import * as fs from "fs";
import * as path from "path";

const floatingTabBarSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/FloatingTabBar.tsx"),
  "utf-8"
);

const layoutSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/_layout.tsx"),
  "utf-8"
);

describe("FloatingTabBar component (BLD-212)", () => {
  it("exports FLOATING_TAB_BAR_HEIGHT constant", () => {
    expect(floatingTabBarSrc).toContain("export const FLOATING_TAB_BAR_HEIGHT");
  });

  it("exports useFloatingTabBarHeight hook", () => {
    expect(floatingTabBarSrc).toContain("export function useFloatingTabBarHeight");
  });

  it("uses useSafeAreaInsets for bottom padding", () => {
    expect(floatingTabBarSrc).toContain("useSafeAreaInsets");
    expect(floatingTabBarSrc).toContain("insets.bottom");
  });

  it("positions bar with position absolute", () => {
    expect(floatingTabBarSrc).toContain('position: "absolute"');
  });

  it("has border radius for floating design", () => {
    expect(floatingTabBarSrc).toContain("borderRadius");
    expect(floatingTabBarSrc).toContain("BAR_BORDER_RADIUS");
  });

  it("has elevation/shadow for floating effect", () => {
    expect(floatingTabBarSrc).toContain("elevation");
    expect(floatingTabBarSrc).toContain("shadowColor");
    expect(floatingTabBarSrc).toContain("shadowOffset");
  });

  it("uses theme-aware colors instead of hardcoded #000 for shadowColor", () => {
    expect(floatingTabBarSrc).toContain("colors.");
    expect(floatingTabBarSrc).not.toContain('shadowColor: "#000"');
    expect(floatingTabBarSrc).not.toContain("shadowColor: '#000'");
  });

  it("CenterButton uses useThemeColors for theme-aware styling", () => {
    const themeUsages = (floatingTabBarSrc.match(/const colors = useThemeColors\(\)/g) || []);
    expect(themeUsages.length).toBeGreaterThanOrEqual(2);
  });

  it("tab label font size is at least 12 for accessibility", () => {
    const fontSizeMatch = floatingTabBarSrc.match(/label:[\s\S]*?fontSize:\s*(\d+)/);
    expect(fontSizeMatch).not.toBeNull();
    expect(Number(fontSizeMatch![1])).toBeGreaterThanOrEqual(12);
  });

  it("tab label line height is proportional to font size", () => {
    const lineHeightMatch = floatingTabBarSrc.match(/label:[\s\S]*?lineHeight:\s*(\d+)/);
    expect(lineHeightMatch).not.toBeNull();
    expect(Number(lineHeightMatch![1])).toBeGreaterThanOrEqual(16);
  });

  it("defines center button with circular shape", () => {
    expect(floatingTabBarSrc).toContain("CENTER_BUTTON_SIZE");
    expect(floatingTabBarSrc).toContain("borderRadius: CENTER_BUTTON_SIZE / 2");
  });

  it("center button has proper accessibility", () => {
    expect(floatingTabBarSrc).toContain('accessibilityRole="tab"');
    expect(floatingTabBarSrc).toContain('accessibilityLabel="Workouts"');
    expect(floatingTabBarSrc).toContain('accessibilityHint="Navigate to workout screen"');
    expect(floatingTabBarSrc).toContain("accessibilityState={{ selected:");
  });

  it("all tab buttons have accessibilityRole tab", () => {
    const tabRoleCount = (floatingTabBarSrc.match(/accessibilityRole="tab"/g) || []).length;
    expect(tabRoleCount).toBeGreaterThanOrEqual(2);
  });

  it("handles keyboard show/hide events", () => {
    expect(floatingTabBarSrc).toContain("keyboardDidShow");
    expect(floatingTabBarSrc).toContain("keyboardDidHide");
    expect(floatingTabBarSrc).toContain("keyboardWillShow");
    expect(floatingTabBarSrc).toContain("keyboardWillHide");
  });

  it("animates bar off-screen on keyboard show", () => {
    expect(floatingTabBarSrc).toContain("translateY");
    expect(floatingTabBarSrc).toContain("withTiming");
  });

  it("respects reduced motion preference", () => {
    expect(floatingTabBarSrc).toContain("useReducedMotion");
  });

  it("defines correct tab order (exercises, nutrition, index, progress, settings)", () => {
    const orderMatch = floatingTabBarSrc.match(/TAB_ORDER\s*=\s*\[([^\]]+)\]/);
    expect(orderMatch).not.toBeNull();
    const order = orderMatch![1].replace(/["\s]/g, "").split(",");
    expect(order).toEqual(["exercises", "nutrition", "index", "progress", "settings"]);
  });

  it("minimum touch targets are at least 48dp", () => {
    expect(floatingTabBarSrc).toContain("minWidth: 48");
    expect(floatingTabBarSrc).toContain("minHeight: 48");
  });
});

describe("Tab layout uses FloatingTabBar (BLD-212)", () => {
  it("imports FloatingTabBar", () => {
    expect(layoutSrc).toContain("FloatingTabBar");
  });

  it("passes FloatingTabBar as tabBar prop", () => {
    expect(layoutSrc).toContain("tabBar=");
    expect(layoutSrc).toContain("FloatingTabBar");
  });

  it("defines exercises tab screen", () => {
    expect(layoutSrc).toContain('name="exercises"');
  });

  it("defines nutrition tab screen", () => {
    expect(layoutSrc).toContain('name="nutrition"');
  });

  it("defines index (Workouts) tab screen", () => {
    expect(layoutSrc).toContain('name="index"');
  });

  it("defines progress tab screen", () => {
    expect(layoutSrc).toContain('name="progress"');
  });

  it("defines settings tab screen", () => {
    expect(layoutSrc).toContain('name="settings"');
  });

  it("does not use old tabBarStyle configuration", () => {
    expect(layoutSrc).not.toContain("tabBarActiveTintColor");
    expect(layoutSrc).not.toContain("tabBarInactiveTintColor");
    expect(layoutSrc).not.toContain("tabBarStyle");
  });
});

describe("Tab screens use useFloatingTabBarHeight (BLD-212)", () => {
  // Screen files or their extracted sub-components that must use useFloatingTabBarHeight
  const screenEntries: { label: string; file: string }[] = [
    { label: "index.tsx", file: "app/(tabs)/index.tsx" },
    { label: "exercises.tsx", file: "app/(tabs)/exercises.tsx" },
    { label: "nutrition.tsx", file: "app/(tabs)/nutrition.tsx" },
    // progress.tsx delegates to WorkoutSegment which uses tabBarHeight
    { label: "progress (WorkoutSegment)", file: "components/progress/WorkoutSegment.tsx" },
    { label: "settings.tsx", file: "app/(tabs)/settings.tsx" },
  ];

  for (const { label, file } of screenEntries) {
    it(`${label} imports useFloatingTabBarHeight`, () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, `../../${file}`),
        "utf-8"
      );
      expect(src).toContain("useFloatingTabBarHeight");
    });

    it(`${label} uses tabBarHeight for padding`, () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, `../../${file}`),
        "utf-8"
      );
      expect(src).toContain("tabBarHeight");
    });
  }
});
