/**
 * BLD-1060: parseCalibrationBulkPaste unit tests.
 *
 * AC from PLAN-BLD-1059.md:
 *   Input: "1=5\n2=foo\n0=10\n3=12.5\n3=15\n5=-2"
 *   Expected: accepted {1=5, 3=15}, 4 rows skipped, toast "Added 2 markers. 4 rows skipped."
 */
import { parseCalibrationBulkPaste, buildBulkPasteToast, resolveMarker } from "../../lib/cable-stack";

describe("parseCalibrationBulkPaste", () => {
  it("resolveMarker returns the matching weight and null when missing", () => {
    expect(
      resolveMarker(
        [
          { id: "c1", stack_id: "s1", marker: 5, true_weight: 15 },
          { id: "c2", stack_id: "s1", marker: 10, true_weight: 30 },
        ],
        10,
      ),
    ).toEqual({ weight: 30, unit: "" });
    expect(resolveMarker([], 10)).toBeNull();
  });

  it("parses the exact AC scenario", () => {
    const input = "1=5\n2=foo\n0=10\n3=12.5\n3=15\n5=-2";
    const result = parseCalibrationBulkPaste(input);

    // Accepted: marker 1 (weight 5) and marker 3 (last value wins: 15)
    expect(result.accepted).toHaveLength(2);
    expect(result.accepted[0]).toEqual({ marker: 1, trueWeight: 5 });
    expect(result.accepted[1]).toEqual({ marker: 3, trueWeight: 15 });

    // 4 skipped: "2=foo" (non_numeric_weight), "0=10" (marker_must_be_positive),
    //            "3=12.5" (duplicate_marker), "5=-2" (weight_must_be_positive)
    expect(result.skipped).toHaveLength(4);

    const reasons = result.skipped.map((r) => r.reason);
    expect(reasons).toContain("non_numeric_weight");
    expect(reasons).toContain("marker_must_be_positive");
    expect(reasons).toContain("duplicate_marker");
    expect(reasons).toContain("weight_must_be_positive");
  });

  it("produces the correct toast for the AC scenario", () => {
    const input = "1=5\n2=foo\n0=10\n3=12.5\n3=15\n5=-2";
    const result = parseCalibrationBulkPaste(input);
    expect(buildBulkPasteToast(result)).toBe("Added 2 markers. 4 rows skipped.");
  });

  it("returns empty for blank input", () => {
    expect(parseCalibrationBulkPaste("")).toEqual({ accepted: [], skipped: [] });
    expect(parseCalibrationBulkPaste("   ")).toEqual({ accepted: [], skipped: [] });
  });

  it("accepts valid decimal weights", () => {
    const result = parseCalibrationBulkPaste("1=2.5\n2=10");
    expect(result.accepted).toEqual([
      { marker: 1, trueWeight: 2.5 },
      { marker: 2, trueWeight: 10 },
    ]);
    expect(result.skipped).toHaveLength(0);
  });

  it("skips rows without = separator", () => {
    const result = parseCalibrationBulkPaste("abc\n1=5");
    expect(result.accepted).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("non_numeric_marker");
  });

  it("skips non-integer markers", () => {
    const result = parseCalibrationBulkPaste("1.5=10");
    expect(result.accepted).toHaveLength(0);
    expect(result.skipped[0].reason).toBe("non_numeric_marker");
  });

  it("toast: all accepted", () => {
    const result = parseCalibrationBulkPaste("1=5\n2=10");
    expect(buildBulkPasteToast(result)).toBe("Added 2 markers.");
  });

  it("toast: all skipped", () => {
    const result = parseCalibrationBulkPaste("0=5");
    expect(buildBulkPasteToast(result)).toBe("No valid rows. 1 skipped.");
  });

  it("toast: single accepted, no skipped", () => {
    const result = parseCalibrationBulkPaste("1=5");
    expect(buildBulkPasteToast(result)).toBe("Added 1 marker.");
  });
});
