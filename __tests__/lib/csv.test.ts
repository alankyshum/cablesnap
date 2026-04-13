import { csvEscape } from "../../lib/csv";

describe("csvEscape", () => {
  it("returns empty string for null", () => {
    expect(csvEscape(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(csvEscape(undefined)).toBe("");
  });

  it("passes through plain strings unchanged", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape("Bench Press")).toBe("Bench Press");
  });

  it("converts numbers to strings", () => {
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(0)).toBe("0");
    expect(csvEscape(3.14)).toBe("3.14");
  });

  it("wraps strings containing commas in quotes", () => {
    expect(csvEscape("hello, world")).toBe('"hello, world"');
  });

  it("wraps strings containing newlines in quotes", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("wraps strings containing double quotes and escapes them", () => {
    expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
  });

  it("handles strings with both commas and quotes", () => {
    expect(csvEscape('"a", "b"')).toBe('"""a"", ""b"""');
  });

  it("handles empty string", () => {
    expect(csvEscape("")).toBe("");
  });

  it("handles strings with only special characters", () => {
    expect(csvEscape(",")).toBe('","');
    expect(csvEscape('"')).toBe('""""');
    expect(csvEscape("\n")).toBe('"\n"');
  });
});
