/**
 * BLD-1169 AC #269: Template `set_types` JSON column is a mandatory read boundary.
 *
 * Pre-fix: `parseTemplateSetTypes` had a hand-coded allow-list that silently dropped
 * the BLD-1168 advanced types ("rest_pause", "cluster", "myo_reps") — any template
 * persisted by the new write paths would round-trip through `getWorkoutTemplate` as
 * `"normal"` instead of preserving the user's selection.
 *
 * Post-fix: parser routes every JSON-array element through `normalizeSetType`, so
 * advanced types survive and only genuinely unknown values fall back to `"normal"`.
 */
import { parseTemplateSetTypes } from "@/lib/db/templates";

describe("parseTemplateSetTypes — BLD-1169 read-boundary normalization", () => {
  it("returns all 'normal' entries when raw is null/undefined/empty", () => {
    expect(parseTemplateSetTypes(null, 3)).toEqual(["normal", "normal", "normal"]);
    expect(parseTemplateSetTypes(undefined, 2)).toEqual(["normal", "normal"]);
    expect(parseTemplateSetTypes("", 1)).toEqual(["normal"]);
  });

  it("returns all 'normal' when JSON is malformed or non-array", () => {
    expect(parseTemplateSetTypes("not-json", 2)).toEqual(["normal", "normal"]);
    expect(parseTemplateSetTypes("{}", 2)).toEqual(["normal", "normal"]);
    expect(parseTemplateSetTypes('"warmup"', 2)).toEqual(["normal", "normal"]);
  });

  it("preserves the legacy four set types", () => {
    const raw = JSON.stringify(["normal", "warmup", "dropset", "failure"]);
    expect(parseTemplateSetTypes(raw, 4)).toEqual(["normal", "warmup", "dropset", "failure"]);
  });

  it("preserves BLD-1168 advanced types (regression: prior allow-list dropped these)", () => {
    const raw = JSON.stringify(["rest_pause", "cluster", "myo_reps"]);
    expect(parseTemplateSetTypes(raw, 3)).toEqual(["rest_pause", "cluster", "myo_reps"]);
  });

  it("coerces unknown / wrong-case values to 'normal' element-wise", () => {
    const raw = JSON.stringify(["WARMUP", "drop_set_v2", "normal", "future_type"]);
    expect(parseTemplateSetTypes(raw, 4)).toEqual(["normal", "normal", "normal", "normal"]);
  });

  it("pads with 'normal' when raw array is shorter than targetSets", () => {
    const raw = JSON.stringify(["warmup", "rest_pause"]);
    expect(parseTemplateSetTypes(raw, 4)).toEqual(["warmup", "rest_pause", "normal", "normal"]);
  });

  it("truncates to targetSets when raw array is longer", () => {
    const raw = JSON.stringify(["warmup", "warmup", "warmup", "warmup", "warmup"]);
    expect(parseTemplateSetTypes(raw, 2)).toEqual(["warmup", "warmup"]);
  });

  it("coerces non-string elements to 'normal'", () => {
    const raw = JSON.stringify([null, 0, false, "warmup"]);
    expect(parseTemplateSetTypes(raw, 4)).toEqual(["normal", "normal", "normal", "warmup"]);
  });
});
