/**
 * BLD-561: resolveExerciseImages — both-or-neither contract.
 *
 * Uses `it.each` per QD budget guidance to keep this suite compact.
 */
import { resolveExerciseImages } from "../assets/exercise-illustrations/resolve";

// Mock the generated manifest so we can test both populated and missing paths
// without depending on whether the generator has been run yet.
jest.mock("../assets/exercise-illustrations/manifest.generated", () => ({
  manifest: {
    "voltra-seeded-complete": {
      start: 1001,
      end: 1002,
      startAlt: "seeded start alt",
      endAlt: "seeded end alt",
    },
    "voltra-seeded-partial": {
      start: 2001,
      end: 0,
      startAlt: "seeded start alt",
      endAlt: "",
    },
    "voltra-with-safety": {
      start: 3001,
      end: 3002,
      startAlt: "safety start alt",
      endAlt: "safety end alt",
      safetyNote: "Keep face clear of cable.",
    },
    "voltra-empty-safety": {
      start: 4001,
      end: 4002,
      startAlt: "empty safety start",
      endAlt: "empty safety end",
      safetyNote: "",
    },
  },
}));

type Case = {
  name: string;
  ex: Parameters<typeof resolveExerciseImages>[0];
  expectedNull: boolean;
  expectStart?: unknown;
  expectEnd?: unknown;
  expectAltIncludes?: string;
};

const cases: Case[] = [
  {
    name: "seeded voltra with full manifest → resolved",
    ex: { id: "voltra-seeded-complete", name: "Complete", is_custom: false },
    expectedNull: false,
    expectStart: 1001,
    expectEnd: 1002,
  },
  {
    name: "seeded voltra with partial manifest → null (both-or-neither)",
    ex: { id: "voltra-seeded-partial", name: "Partial", is_custom: false },
    expectedNull: true,
  },
  {
    name: "seeded voltra not in manifest → null",
    ex: { id: "voltra-missing", name: "Missing", is_custom: false },
    expectedNull: true,
  },
  {
    name: "custom exercise with both URIs → resolved",
    ex: {
      id: "custom-1",
      name: "MyExercise",
      is_custom: true,
      start_image_uri: "file:///tmp/start.jpg",
      end_image_uri: "file:///tmp/end.jpg",
    },
    expectedNull: false,
    expectStart: { uri: "file:///tmp/start.jpg" },
    expectEnd: { uri: "file:///tmp/end.jpg" },
    expectAltIncludes: "MyExercise",
  },
  {
    name: "custom exercise with only start URI → null",
    ex: {
      id: "custom-2",
      name: "Half",
      is_custom: true,
      start_image_uri: "file:///tmp/start.jpg",
    },
    expectedNull: true,
  },
  {
    name: "custom exercise with no URIs → null",
    ex: { id: "custom-3", name: "Empty", is_custom: true },
    expectedNull: true,
  },
  {
    name: "seeded voltra with safetyNote → safetyNote passed through",
    ex: { id: "voltra-with-safety", name: "WithSafety", is_custom: false },
    expectedNull: false,
    expectStart: 3001,
    expectEnd: 3002,
  },
  {
    name: "seeded voltra with empty safetyNote → normalized to undefined",
    ex: { id: "voltra-empty-safety", name: "EmptySafety", is_custom: false },
    expectedNull: false,
    expectStart: 4001,
    expectEnd: 4002,
  },
];

describe("resolveExerciseImages", () => {
  it.each(cases)("$name", ({ ex, expectedNull, expectStart, expectEnd, expectAltIncludes }) => {
    const result = resolveExerciseImages(ex);
    if (expectedNull) {
      expect(result).toBeNull();
      return;
    }
    expect(result).not.toBeNull();
    if (expectStart !== undefined) expect(result!.start).toEqual(expectStart);
    if (expectEnd !== undefined) expect(result!.end).toEqual(expectEnd);
    expect(result!.startAlt.length).toBeGreaterThan(0);
    expect(result!.endAlt.length).toBeGreaterThan(0);
    if (expectAltIncludes) {
      expect(result!.startAlt).toContain(expectAltIncludes);
      expect(result!.endAlt).toContain(expectAltIncludes);
    }
  });

  it("passes through safetyNote when present", () => {
    const result = resolveExerciseImages({ id: "voltra-with-safety", name: "WithSafety", is_custom: false });
    expect(result).not.toBeNull();
    expect(result!.safetyNote).toBe("Keep face clear of cable.");
  });

  it("normalizes empty safetyNote to undefined", () => {
    const result = resolveExerciseImages({ id: "voltra-empty-safety", name: "EmptySafety", is_custom: false });
    expect(result).not.toBeNull();
    expect(result!.safetyNote).toBeUndefined();
  });

  it("returns undefined safetyNote when field is absent", () => {
    const result = resolveExerciseImages({ id: "voltra-seeded-complete", name: "Complete", is_custom: false });
    expect(result).not.toBeNull();
    expect(result!.safetyNote).toBeUndefined();
  });
});
