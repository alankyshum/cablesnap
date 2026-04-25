import { stripEccentricFromTrainingModesJSON } from "../../../lib/db/migrations";

describe("stripEccentricFromTrainingModesJSON (BLD-622)", () => {
  it("returns null for input that does not contain eccentric_overload (skips row)", () => {
    expect(stripEccentricFromTrainingModesJSON('["weight","band"]')).toBeNull();
    expect(stripEccentricFromTrainingModesJSON('["weight"]')).toBeNull();
    expect(stripEccentricFromTrainingModesJSON("")).toBeNull();
    expect(stripEccentricFromTrainingModesJSON(null)).toBeNull();
    expect(stripEccentricFromTrainingModesJSON(undefined)).toBeNull();
  });

  it("strips eccentric_overload when it is the only mode → defaults to ['weight']", () => {
    expect(stripEccentricFromTrainingModesJSON('["eccentric_overload"]')).toBe('["weight"]');
  });

  it("strips eccentric_overload at leading position", () => {
    expect(stripEccentricFromTrainingModesJSON('["eccentric_overload","weight","band"]'))
      .toBe('["weight","band"]');
  });

  it("strips eccentric_overload at middle position", () => {
    expect(stripEccentricFromTrainingModesJSON('["weight","eccentric_overload","band"]'))
      .toBe('["weight","band"]');
  });

  it("strips eccentric_overload at trailing position", () => {
    expect(stripEccentricFromTrainingModesJSON('["weight","band","eccentric_overload"]'))
      .toBe('["weight","band"]');
  });

  it("strips multiple occurrences of eccentric_overload", () => {
    expect(stripEccentricFromTrainingModesJSON('["eccentric_overload","weight","eccentric_overload"]'))
      .toBe('["weight"]');
  });

  it("falls back to ['weight'] for malformed JSON containing the substring", () => {
    expect(stripEccentricFromTrainingModesJSON('["eccentric_overload"'))
      .toBe('["weight"]');
  });

  it("falls back to ['weight'] when JSON is not an array", () => {
    expect(stripEccentricFromTrainingModesJSON('"eccentric_overload"'))
      .toBe('["weight"]');
    expect(stripEccentricFromTrainingModesJSON('{"mode":"eccentric_overload"}'))
      .toBe('["weight"]');
  });

  it("preserves whitespace-formatted JSON arrays correctly (re-serializes compactly)", () => {
    expect(stripEccentricFromTrainingModesJSON('[ "weight", "eccentric_overload", "band" ]'))
      .toBe('["weight","band"]');
  });
});
