import * as fs from "fs";
import * as path from "path";

const floatingTabBarSrc = [
  fs.readFileSync(path.resolve(__dirname, "../../components/FloatingTabBar.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/floating-tab-bar/CenterButton.tsx"), "utf-8"),
  fs.readFileSync(path.resolve(__dirname, "../../components/floating-tab-bar/TabButton.tsx"), "utf-8"),
].join("\n");

const layoutSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/_layout.tsx"),
  "utf-8"
);

describe("FloatingTabBar component (BLD-212)", () => {
  it("exports height constant, hook, and uses safe area insets", () => {
    expect(floatingTabBarSrc).toContain("export const FLOATING_TAB_BAR_HEIGHT");
    expect(floatingTabBarSrc).toContain("export function useFloatingTabBarHeight");
    expect(floatingTabBarSrc).toContain("useSafeAreaInsets");
    expect(floatingTabBarSrc).toContain("insets.bottom");
  });

  it("has floating design (absolute position, border radius, elevation/shadow)", () => {
    expect(floatingTabBarSrc).toContain('position: "absolute"');
    expect(floatingTabBarSrc).toContain("borderRadius");
    expect(floatingTabBarSrc).toContain("BAR_BORDER_RADIUS");
    expect(floatingTabBarSrc).toContain("elevation");
    expect(floatingTabBarSrc).toContain("shadowColor");
    expect(floatingTabBarSrc).toContain("shadowOffset");
    expect(floatingTabBarSrc).toContain("colors.");
    expect(floatingTabBarSrc).not.toContain('shadowColor: "#000"');
    expect(floatingTabBarSrc).not.toContain("shadowColor: '#000'");
  });

  it("uses theme-aware colors across multiple components", () => {
    const themeUsages = (floatingTabBarSrc.match(/const colors = useThemeColors\(\)/g) || []);
    expect(themeUsages.length).toBeGreaterThanOrEqual(2);
  });

  it("has accessible labels, touch targets, and font sizing", () => {
    expect(floatingTabBarSrc).toMatch(/label:[\s\S]*?fontSize:\s*fontSizes\.xs/);
    const lineHeightMatch = floatingTabBarSrc.match(/label:[\s\S]*?lineHeight:\s*(\d+)/);
    expect(lineHeightMatch).not.toBeNull();
    expect(Number(lineHeightMatch![1])).toBeGreaterThanOrEqual(16);
    expect(floatingTabBarSrc).toContain("CENTER_BUTTON_SIZE");
    expect(floatingTabBarSrc).toContain("borderRadius: CENTER_BUTTON_SIZE / 2");
    expect(floatingTabBarSrc).toContain('accessibilityRole="tab"');
    expect(floatingTabBarSrc).toContain('accessibilityLabel="Workouts"');
    expect(floatingTabBarSrc).toContain('accessibilityHint="Navigate to workout screen"');
    expect(floatingTabBarSrc).toContain("accessibilityState={{ selected:");
    const tabRoleCount = (floatingTabBarSrc.match(/accessibilityRole="tab"/g) || []).length;
    expect(tabRoleCount).toBeGreaterThanOrEqual(2);
    expect(floatingTabBarSrc).toContain("minWidth: 48");
    expect(floatingTabBarSrc).toContain("minHeight: 48");
  });

  it("handles keyboard events with animation and reduced motion support", () => {
    expect(floatingTabBarSrc).toContain("keyboardDidShow");
    expect(floatingTabBarSrc).toContain("keyboardDidHide");
    expect(floatingTabBarSrc).toContain("keyboardWillShow");
    expect(floatingTabBarSrc).toContain("keyboardWillHide");
    expect(floatingTabBarSrc).toContain("translateY");
    expect(floatingTabBarSrc).toContain("withTiming");
    expect(floatingTabBarSrc).toContain("useReducedMotion");
  });

  it("defines correct tab order (exercises, nutrition, index, progress, settings)", () => {
    const orderMatch = floatingTabBarSrc.match(/TAB_ORDER\s*=\s*\[([^\]]+)\]/);
    expect(orderMatch).not.toBeNull();
    const order = orderMatch![1].replace(/["\s]/g, "").split(",");
    expect(order).toEqual(["exercises", "nutrition", "index", "progress", "settings"]);
  });
});

describe("Tab layout uses FloatingTabBar (BLD-212)", () => {
  it("imports FloatingTabBar and passes it as tabBar prop", () => {
    expect(layoutSrc).toContain("FloatingTabBar");
    expect(layoutSrc).toContain("tabBar=");
  });

  it("defines all tab screens and avoids old tabBarStyle config", () => {
    expect(layoutSrc).toContain('name="exercises"');
    expect(layoutSrc).toContain('name="nutrition"');
    expect(layoutSrc).toContain('name="index"');
    expect(layoutSrc).toContain('name="progress"');
    expect(layoutSrc).toContain('name="settings"');
    expect(layoutSrc).not.toContain("tabBarActiveTintColor");
    expect(layoutSrc).not.toContain("tabBarInactiveTintColor");
    expect(layoutSrc).not.toContain("tabBarStyle");
  });
});

describe("Tab screens use useFloatingTabBarHeight (BLD-212)", () => {
  const screenEntries: { label: string; file: string }[] = [
    { label: "index.tsx", file: "app/(tabs)/index.tsx" },
    { label: "exercises.tsx", file: "app/(tabs)/exercises.tsx" },
    { label: "nutrition.tsx", file: "app/(tabs)/nutrition.tsx" },
    // progress.tsx delegates to WorkoutSegment which uses tabBarHeight
    { label: "progress (WorkoutSegment)", file: "components/progress/WorkoutSegment.tsx" },
    { label: "settings.tsx", file: "app/(tabs)/settings.tsx" },
  ];

  it("all tab screens import useFloatingTabBarHeight and use tabBarHeight", () => {
    for (const { file } of screenEntries) {
      const src = fs.readFileSync(
        path.resolve(__dirname, `../../${file}`),
        "utf-8"
      );
      expect(src).toContain("useFloatingTabBarHeight");
      expect(src).toContain("tabBarHeight");
    }
  });
});
