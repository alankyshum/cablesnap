import { parseMuscleList } from "@/lib/db/muscle-format";

describe("parseMuscleList", () => {
  describe("JSON format", () => {
    test("parses well-formed JSON array of strings", () => {
      expect(parseMuscleList('["chest","triceps"]')).toEqual(["chest", "triceps"]);
    });

    test("parses single-element JSON array", () => {
      expect(parseMuscleList('["chest"]')).toEqual(["chest"]);
    });

    test("parses empty JSON array", () => {
      expect(parseMuscleList("[]")).toEqual([]);
    });

    test("trims whitespace inside JSON values", () => {
      expect(parseMuscleList('["chest"," triceps "]')).toEqual(["chest", "triceps"]);
    });

    test("filters non-string entries from JSON array", () => {
      expect(parseMuscleList('["chest",null,42,"triceps"]')).toEqual(["chest", "triceps"]);
    });

    test("falls back to CSV split when JSON is malformed", () => {
      // Starts with [ but is not valid JSON. CSV split treats the whole thing
      // as a comma-less single token (with leading bracket) — practical fallback.
      expect(parseMuscleList('["chest"')).toEqual(['["chest"']);
    });
  });

  describe("CSV format", () => {
    test("parses comma-separated values", () => {
      expect(parseMuscleList("chest,triceps")).toEqual(["chest", "triceps"]);
    });

    test("parses single value with no commas", () => {
      expect(parseMuscleList("chest")).toEqual(["chest"]);
    });

    test("trims whitespace around CSV tokens", () => {
      expect(parseMuscleList("chest, triceps , shoulders")).toEqual([
        "chest",
        "triceps",
        "shoulders",
      ]);
    });

    test("removes empty tokens (e.g. trailing comma)", () => {
      expect(parseMuscleList("chest,,triceps,")).toEqual(["chest", "triceps"]);
    });
  });

  describe("edge cases", () => {
    test("returns [] for null", () => {
      expect(parseMuscleList(null)).toEqual([]);
    });

    test("returns [] for undefined", () => {
      expect(parseMuscleList(undefined)).toEqual([]);
    });

    test("returns [] for empty string", () => {
      expect(parseMuscleList("")).toEqual([]);
    });

    test("returns [] for whitespace-only string", () => {
      expect(parseMuscleList("   ")).toEqual([]);
    });
  });

  describe("substring-collision safety (BLD-925 plan §JSON-substring collision risk)", () => {
    // Plan documents the assumption that muscle identifiers do not appear as
    // substrings of other identifiers between delimiters. parseMuscleList
    // must surface upper_back as a distinct value, not as "back".
    test("preserves upper_back distinct from back (CSV)", () => {
      expect(parseMuscleList("upper_back,glutes")).toEqual(["upper_back", "glutes"]);
    });

    test("preserves upper_back distinct from back (JSON)", () => {
      expect(parseMuscleList('["upper_back","glutes"]')).toEqual(["upper_back", "glutes"]);
    });
  });
});
