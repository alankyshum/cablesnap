import * as fs from "fs";
import * as path from "path";

const exercisesSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/exercises.tsx"),
  "utf-8"
);

describe("Exercise category chip active/inactive styling (BLD-189)", () => {
  it("uses BNA Chip component for category filters", () => {
    expect(exercisesSrc).toContain('import { Chip } from "@/components/ui/chip"');
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

  it("uses theme tokens for chip icon colors (no hardcoded hex)", () => {
    expect(exercisesSrc).toContain(
      "color={active ? colors.onPrimaryContainer : colors.onSurface}"
    );
  });
});
