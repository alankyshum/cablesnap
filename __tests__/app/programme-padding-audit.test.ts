import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-190: Programme detail page padding & container audit.
 * Verifies that audited routes use useLayout() for responsive horizontal padding.
 */

const auditedFiles = [
  { rel: "app/program/[id].tsx", label: "program detail" },
  { rel: "app/body/goals.tsx", label: "body goals" },
  { rel: "app/program/create.tsx", label: "create program" },
  { rel: "app/program/pick-template.tsx", label: "pick template" },
  { rel: "app/session/detail/[id].tsx", label: "session detail" },
  { rel: "app/session/summary/[id].tsx", label: "session summary" },
  { rel: "app/template/[id].tsx", label: "template detail" },
  { rel: "app/template/create.tsx", label: "create template" },
  { rel: "app/history.tsx", label: "history" },
];

const sources = auditedFiles.map(({ rel, label }) => ({
  label,
  rel,
  src: fs.readFileSync(path.resolve(__dirname, "../..", rel), "utf-8"),
}));

describe("programme padding audit (BLD-190)", () => {
  describe.each(sources)("$label ($rel)", ({ src }) => {
    it("imports useLayout from lib/layout", () => {
      expect(src).toMatch(/import\s*\{[^}]*useLayout[^}]*\}\s*from\s*["'][^"']*lib\/layout["']/);
    });

    it("calls useLayout()", () => {
      expect(src).toContain("useLayout()");
    });

    it("uses layout.horizontalPadding in content container style", () => {
      expect(src).toContain("layout.horizontalPadding");
    });
  });

  it("program detail applies paddingHorizontal via contentContainerStyle", () => {
    const programSrc = sources.find((s) => s.rel === "app/program/[id].tsx")!.src;
    expect(programSrc).toContain("paddingHorizontal: layout.horizontalPadding");
  });
});
