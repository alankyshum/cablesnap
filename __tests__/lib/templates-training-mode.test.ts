/**
 * BLD-621: per-exercise training-mode persistence in workout templates.
 *
 * Covers the data-drift fallback (BLD-622 interaction) acceptance criterion:
 * when a saved training_mode is no longer present in the exercise's
 * `training_modes` allow-list, getTemplateById must read it back as `null`
 * so callers fall back to the exercise default. No silent coercion.
 */

// Minimal mocks so importing lib/db/templates does not pull native deps.
jest.mock("expo-crypto", () => ({ randomUUID: jest.fn(() => "test-uuid") }));
jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: jest.fn() }));
jest.mock("expo-sqlite", () => ({ openDatabaseAsync: jest.fn() }));

import { normalizeTemplateTrainingMode } from "../../lib/db/templates";

describe("normalizeTemplateTrainingMode (BLD-621 data-drift fallback)", () => {
  it("returns null when saved mode is null/undefined/empty", () => {
    expect(normalizeTemplateTrainingMode(null, '["weight"]')).toBeNull();
    expect(normalizeTemplateTrainingMode(undefined, '["weight"]')).toBeNull();
    expect(normalizeTemplateTrainingMode("", '["weight"]')).toBeNull();
  });

  it("returns the saved mode when it appears in the exercise allow-list", () => {
    expect(
      normalizeTemplateTrainingMode("weight", '["weight","band"]')
    ).toBe("weight");
    expect(
      normalizeTemplateTrainingMode("eccentric_overload", '["weight","eccentric_overload"]')
    ).toBe("eccentric_overload");
  });

  it("returns null when the saved mode is no longer in the allow-list (BLD-622 drift)", () => {
    // template_exercises row saved 'eccentric_overload', but BLD-622 removed
    // that mode from the exercise — must read back as null, never coerce.
    expect(
      normalizeTemplateTrainingMode("eccentric_overload", '["weight","band"]')
    ).toBeNull();
  });

  it("does not coerce a removed mode to the first allowed mode", () => {
    const result = normalizeTemplateTrainingMode(
      "eccentric_overload",
      '["weight","band","damper"]'
    );
    expect(result).not.toBe("weight");
    expect(result).toBeNull();
  });

  it("returns the saved mode when no allow-list info is available (no exercise join)", () => {
    expect(normalizeTemplateTrainingMode("weight", null)).toBe("weight");
    expect(normalizeTemplateTrainingMode("weight", undefined)).toBe("weight");
  });

  it("returns the saved mode when allow-list JSON is malformed (defensive)", () => {
    expect(normalizeTemplateTrainingMode("weight", "{not json")).toBe("weight");
  });

  it("returns null for empty allow-list when saved mode is set", () => {
    expect(normalizeTemplateTrainingMode("weight", "[]")).toBeNull();
  });
});
