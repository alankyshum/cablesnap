import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-72: handleShare() must share the human-readable
 * text report as primary, not the JSON artifact.
 */

const src = fs.readFileSync(
  path.resolve(__dirname, "../../app/feedback.tsx"),
  "utf-8"
);

function extractHandler(name: string): string {
  const pattern = new RegExp(
    `const ${name} = useCallback\\(async \\(\\) => \\{`
  );
  const match = src.match(pattern);
  if (!match || match.index === undefined) return "";
  let depth = 0;
  let start = match.index + match[0].length;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    if (src[i] === "}") {
      if (depth === 0) return src.slice(match.index, i + 1);
      depth--;
    }
  }
  return "";
}

const handler = extractHandler("handleShare");

describe("handleShare — shares text report as primary (BLD-72)", () => {
  it("handler exists and is non-empty", () => {
    expect(handler.length).toBeGreaterThan(0);
  });

  it("creates fitforge-report.txt", () => {
    expect(handler).toContain('"fitforge-report.txt"');
  });

  it("creates fitforge-report.json as secondary artifact", () => {
    expect(handler).toContain('"fitforge-report.json"');
  });

  it("creates text file before JSON file", () => {
    const txt = handler.indexOf('"fitforge-report.txt"');
    const json = handler.indexOf('"fitforge-report.json"');
    expect(txt).toBeLessThan(json);
  });

  it("shares the text report variable, not JSON artifact", () => {
    const share = handler.match(/Sharing\.shareAsync\((\w+)\.uri/);
    expect(share).toBeTruthy();
    expect(share![1]).toBe("report");
  });

  it("uses text/plain mimeType", () => {
    expect(handler).toContain('mimeType: "text/plain"');
    expect(handler).not.toContain('mimeType: "application/json"');
  });
});
