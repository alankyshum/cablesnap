import { safeParse } from "../../lib/safe-parse";

describe("safeParse", () => {
  it("parses valid JSON and returns the value", () => {
    expect(safeParse('["chest","shoulders"]', [], "test")).toEqual(["chest", "shoulders"]);
  });

  it("returns fallback for null input", () => {
    expect(safeParse(null, [], "test")).toEqual([]);
  });

  it("returns fallback for undefined input", () => {
    expect(safeParse(undefined, { x: 1 }, "test")).toEqual({ x: 1 });
  });

  it("returns fallback for empty string", () => {
    expect(safeParse("", [], "test")).toEqual([]);
  });

  it("returns fallback for truncated JSON", () => {
    expect(safeParse('["chest","shou', [], "truncated")).toEqual([]);
  });

  it("returns fallback for invalid JSON", () => {
    expect(safeParse("not json at all", 42, "bad")).toBe(42);
  });

  it("returns fallback for malformed object", () => {
    expect(safeParse("{key: value}", {}, "malformed")).toEqual({});
  });

  it("parses valid nested object", () => {
    const input = '{"birthYear":1990,"weight":80}';
    const result = safeParse<{ birthYear: number; weight: number } | null>(input, null, "profile");
    expect(result).toEqual({ birthYear: 1990, weight: 80 });
  });

  it("does not throw on any input", () => {
    const badInputs = [null, undefined, "", "}", "{", "[", '{"a":', "NaN", "\x00\x01\x02"];
    for (const input of badInputs) {
      expect(() => safeParse(input, "fallback", "fuzz")).not.toThrow();
    }
  });
});
