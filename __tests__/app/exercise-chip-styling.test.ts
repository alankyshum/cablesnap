import * as fs from "fs";
import * as path from "path";

const exercisesSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/(tabs)/exercises.tsx"),
  "utf-8"
);

describe("Exercise category chip active/inactive styling (BLD-189)", () => {
  it("uses BNA Chip with correct active styling and icon colors", () => {
    expect(exercisesSrc).toContain('import { Chip } from "@/components/ui/chip"');
    expect(exercisesSrc).toContain(
      "active && { backgroundColor: colors.primaryContainer }"
    );
    expect(exercisesSrc).toContain("color: colors.onPrimaryContainer");
    expect(exercisesSrc).toContain(
      "color={active ? colors.onPrimaryContainer : colors.onSurface}"
    );
  });

  it("sets flexShrink: 0 on chip text to prevent ellipsis truncation", () => {
    expect(exercisesSrc).toContain("flexShrink: 0");
  });
});
