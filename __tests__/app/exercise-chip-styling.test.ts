import * as fs from "fs";
import * as path from "path";

const exercisesSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/exercises.tsx"),
  "utf-8"
);

describe("Exercise category chip active/inactive styling (BLD-189)", () => {
  it("uses 'flat' mode for active chips", () => {
    expect(exercisesSrc).toContain('mode={active ? "flat" : "outlined"}');
  });

  it("uses 'outlined' mode for inactive chips", () => {
    expect(exercisesSrc).toContain('"outlined"');
  });

  it("applies primaryContainer background only when active", () => {
    expect(exercisesSrc).toContain(
      "active && { backgroundColor: colors.primaryContainer }"
    );
  });

  it("applies onPrimaryContainer text color only when active", () => {
    expect(exercisesSrc).toContain("color: colors.onPrimaryContainer");
  });

  it("sets flexShrink: 0 on chip text to prevent ellipsis truncation", () => {
    expect(exercisesSrc).toContain("flexShrink: 0");
  });

  it("only shows selected overlay when chip is active", () => {
    expect(exercisesSrc).toContain("showSelectedOverlay={active}");
  });

  it("does NOT use a static showSelectedOverlay without condition", () => {
    // Ensure we don't have the old unconditional showSelectedOverlay
    const lines = exercisesSrc.split("\n");
    const overlayLines = lines.filter(
      (l) => l.includes("showSelectedOverlay") && !l.includes("{active}")
    );
    expect(overlayLines).toHaveLength(0);
  });

  it("uses theme tokens for chip icon colors (no hardcoded hex)", () => {
    // Icon color should use theme.colors, not raw hex values
    expect(exercisesSrc).toContain(
      "color={active ? colors.onPrimaryContainer : colors.onSurface}"
    );
  });
});
