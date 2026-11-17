// Strava large-ID regression: legacy limits and malformed string identifiers.
import { stravaId } from "../../lib/strava-id";

describe("stravaId", () => {
  it.each([
    [{ id: Number.MAX_SAFE_INTEGER }, "9007199254740991"],
    [{ id: Number.MAX_SAFE_INTEGER + 1 }, null],
    [{ id: "18014398509481985" }, "18014398509481985"],
    [{ id: 42, id_str: null }, null],
    [{ id: 42, id_str: "" }, null],
    [{ id: 42, id_str: 123 }, null],
    [{ id: 42, id_str: {} }, null],
    [{ id: Number.MAX_SAFE_INTEGER + 1, id_str: "9007199254740993" }, "9007199254740993"],
    [null, null],
  ])("extracts %j as %j", (input, expected) => {
    expect(stravaId(input)).toBe(expected);
  });
});
