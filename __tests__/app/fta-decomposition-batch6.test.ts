import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "../..");

function read(file: string): string {
  return fs.readFileSync(path.join(root, file), "utf-8");
}

function lineCount(file: string): number {
  return read(file).split("\n").length;
}

describe("FTA Batch 6 — _layout.tsx decomposition", () => {
  it("_layout.tsx is under 200 lines", () => {
    expect(lineCount("app/_layout.tsx")).toBeLessThan(200);
  });

  it("screen-config.ts exists and exports SCREEN_CONFIGS", () => {
    const src = read("app/screen-config.ts");
    expect(src).toContain("export const SCREEN_CONFIGS");
  });

  it("useAppInit.ts exists and exports useAppInit", () => {
    const src = read("hooks/useAppInit.ts");
    expect(src).toContain("export function useAppInit");
  });

  it("_layout.tsx imports useAppInit", () => {
    expect(read("app/_layout.tsx")).toContain("useAppInit");
  });

  it("_layout.tsx imports SCREEN_CONFIGS", () => {
    expect(read("app/_layout.tsx")).toContain("SCREEN_CONFIGS");
  });

  it("screen-config.ts has all original screens", () => {
    const src = read("app/screen-config.ts");
    const names = ["(tabs)", "onboarding", "exercise/[id]", "session/[id]", "tools/plates", "tools/timer"];
    for (const name of names) {
      expect(src).toContain(`"${name}"`);
    }
  });
});

describe("FTA Batch 6 — FloatingTabBar decomposition", () => {
  it("FloatingTabBar.tsx is under 200 lines", () => {
    expect(lineCount("components/FloatingTabBar.tsx")).toBeLessThan(200);
  });

  it("CenterButton.tsx exists", () => {
    expect(fs.existsSync(path.join(root, "components/floating-tab-bar/CenterButton.tsx"))).toBe(true);
  });

  it("TabButton.tsx exists", () => {
    expect(fs.existsSync(path.join(root, "components/floating-tab-bar/TabButton.tsx"))).toBe(true);
  });

  it("FloatingTabBar imports CenterButton", () => {
    expect(read("components/FloatingTabBar.tsx")).toContain("CenterButton");
  });

  it("FloatingTabBar imports TabButton", () => {
    expect(read("components/FloatingTabBar.tsx")).toContain("TabButton");
  });

  it("still exports FLOATING_TAB_BAR_HEIGHT", () => {
    expect(read("components/FloatingTabBar.tsx")).toContain("export const FLOATING_TAB_BAR_HEIGHT");
  });

  it("still exports useFloatingTabBarHeight", () => {
    expect(read("components/FloatingTabBar.tsx")).toContain("export function useFloatingTabBarHeight");
  });
});

describe("FTA Batch 6 — ProfileForm decomposition", () => {
  it("ProfileForm.tsx is under 220 lines", () => {
    expect(lineCount("components/ProfileForm.tsx")).toBeLessThan(220);
  });

  it("useProfileForm.ts exists and exports useProfileForm", () => {
    const src = read("hooks/useProfileForm.ts");
    expect(src).toContain("export function useProfileForm");
  });

  it("ActivityDropdown.tsx exists", () => {
    expect(fs.existsSync(path.join(root, "components/profile/ActivityDropdown.tsx"))).toBe(true);
  });

  it("ProfileForm imports useProfileForm", () => {
    expect(read("components/ProfileForm.tsx")).toContain("useProfileForm");
  });

  it("ProfileForm imports ActivityDropdown", () => {
    expect(read("components/ProfileForm.tsx")).toContain("ActivityDropdown");
  });
});

describe("FTA Batch 6 — plates.tsx decomposition", () => {
  it("plates.tsx is under 270 lines", () => {
    expect(lineCount("app/tools/plates.tsx")).toBeLessThan(270);
  });

  it("BarbellDiagram.tsx exists and exports Barbell", () => {
    const src = read("components/plates/BarbellDiagram.tsx");
    expect(src).toContain("export function Barbell");
  });

  it("usePlateCalculator.ts exists and exports usePlateCalculator", () => {
    const src = read("hooks/usePlateCalculator.ts");
    expect(src).toContain("export function usePlateCalculator");
  });

  it("plates.tsx imports Barbell from extracted component", () => {
    expect(read("app/tools/plates.tsx")).toContain("BarbellDiagram");
  });

  it("plates.tsx imports usePlateCalculator", () => {
    expect(read("app/tools/plates.tsx")).toContain("usePlateCalculator");
  });

  it("plates.tsx still exports PlateCalculatorContent", () => {
    expect(read("app/tools/plates.tsx")).toContain("export function PlateCalculatorContent");
  });
});
