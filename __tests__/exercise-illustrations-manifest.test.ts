/**
 * BLD-1005: Exercise illustrations manifest count + safety-note preservation tests.
 *
 * These tests use the real manifest (not a mock) to verify the 128-exercise Gemini set
 * was correctly adopted. The safety-note test will FAIL if voltra-001 or voltra-020
 * safety notes are removed or corrupted.
 */
import { manifest } from "../assets/exercise-illustrations/manifest.generated";

describe("manifest entry counts (128-exercise Gemini set)", () => {
  const ids = Object.keys(manifest);
  const mwBb = ids.filter((id) => id.startsWith("mw-bb-"));
  const mwBw = ids.filter((id) => id.startsWith("mw-bw-"));
  const mwCable = ids.filter((id) => id.startsWith("mw-cable-"));
  const voltra = ids.filter((id) => id.startsWith("voltra-"));

  it("total manifest count is 128", () => {
    expect(ids.length).toBe(128);
  });

  it("mw-bb prefix count is 2", () => {
    expect(mwBb.length).toBe(2);
  });

  it("mw-bw prefix count is 45", () => {
    expect(mwBw.length).toBe(45);
  });

  it("mw-cable prefix count is 25", () => {
    expect(mwCable.length).toBe(25);
  });

  it("voltra prefix count is 56", () => {
    expect(voltra.length).toBe(56);
  });
});

describe("safety note preservation (voltra-001 + voltra-020)", () => {
  // Verbatim strings verified byte-equal with main (techlead review ff96c457).
  // These assertions MUST use exact equality — keyword-only checks would pass
  // if the safety notes were reworded, defeating QD condition #4.
  const VOLTRA_001_SAFETY_NOTE =
    "Keep your face clear of the cable path. Position yourself at least 12 inches from the low pulley to avoid contact with hardware.";
  const VOLTRA_020_SAFETY_NOTE =
    "This exercise uses a neutral grip on a straight bar, which may feel unfamiliar. If you experience wrist discomfort, try a wider grip or use a different handle attachment.";

  it("voltra-001 has a non-empty safetyNote", () => {
    expect(manifest["voltra-001"]).toBeDefined();
    expect(typeof manifest["voltra-001"].safetyNote).toBe("string");
    expect(manifest["voltra-001"].safetyNote!.length).toBeGreaterThan(0);
  });

  it("voltra-001 safetyNote is verbatim (exact string match)", () => {
    expect(manifest["voltra-001"].safetyNote).toBe(VOLTRA_001_SAFETY_NOTE);
  });

  it("voltra-020 has a non-empty safetyNote", () => {
    expect(manifest["voltra-020"]).toBeDefined();
    expect(typeof manifest["voltra-020"].safetyNote).toBe("string");
    expect(manifest["voltra-020"].safetyNote!.length).toBeGreaterThan(0);
  });

  it("voltra-020 safetyNote is verbatim (exact string match)", () => {
    expect(manifest["voltra-020"].safetyNote).toBe(VOLTRA_020_SAFETY_NOTE);
  });
});

describe("manifest entry completeness", () => {
  const entries = Object.entries(manifest);

  it("every entry has start, end, startAlt, endAlt", () => {
    for (const [, entry] of entries) {
      expect(entry.start).toBeTruthy();
      expect(entry.end).toBeTruthy();
      expect(entry.startAlt.length).toBeGreaterThan(0);
      expect(entry.endAlt.length).toBeGreaterThan(0);
    }
  });
});
