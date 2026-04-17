import * as fs from "fs";
import * as path from "path";

const sessionSrc = fs.readFileSync(
  path.resolve(__dirname, "../../app/session/[id].tsx"),
  "utf-8"
);

describe("Workout session exercise header overflow fix (BLD-203)", () => {
  it("groupHeader uses flexWrap: wrap", () => {
    expect(sessionSrc).toContain('flexWrap: "wrap"');
    const headerMatch = sessionSrc.match(/groupHeader:\s*\{[^}]+\}/s);
    expect(headerMatch).not.toBeNull();
    expect(headerMatch![0]).toContain('flexWrap: "wrap"');
  });

  it("groupTitle has minWidth to prevent overflow", () => {
    const titleMatch = sessionSrc.match(/groupTitle:\s*\{[^}]+\}/s);
    expect(titleMatch).not.toBeNull();
    expect(titleMatch![0]).toContain("minWidth");
  });

  it("compact layout uses two-row header structure", () => {
    expect(sessionSrc).toContain("groupHeaderCompactWrap");
    expect(sessionSrc).toContain("groupHeaderCompactRow");
    const wrapMatch = sessionSrc.match(/groupHeaderCompactWrap:\s*\{[^}]+\}/s);
    expect(wrapMatch).not.toBeNull();
    const rowMatch = sessionSrc.match(/groupHeaderCompactRow:\s*\{[^}]+\}/s);
    expect(rowMatch).not.toBeNull();
    expect(rowMatch![0]).toContain('flexDirection: "row"');
  });

  it("applies compact layout conditionally based on layout.compact", () => {
    expect(sessionSrc).toContain("layout.compact");
    expect(sessionSrc).toContain("styles.groupHeaderCompactWrap");
  });

  it("exercise name has numberOfLines for ellipsis truncation", () => {
    expect(sessionSrc).toContain("numberOfLines={2}");
  });

  it("groupHeader contains exercise name and Details button", () => {
    expect(sessionSrc).toContain("styles.groupHeader");
    expect(sessionSrc).toContain("styles.groupTitle");
    expect(sessionSrc).toContain("Details");
  });
});
