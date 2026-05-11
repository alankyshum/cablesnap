/**
 * BLD-1158 AC6: Tempo parser unit tests.
 *
 * Tests for lib/workout/tempo-coach.ts — parseTempo(), formatTempo(),
 * canonicalizeTempo(), tempoAccessibilityLabel().
 */

import {
  parseTempo,
  formatTempo,
  canonicalizeTempo,
  tempoAccessibilityLabel,
  type ParsedTempo,
} from "../../../lib/workout/tempo-coach";

describe("parseTempo", () => {
  it("parses canonical dash-separated tempo", () => {
    const r = parseTempo("3-1-2-0");
    expect(r).toEqual<ParsedTempo>({ e: 3, b: 1, c: 2, t: 0 });
  });

  it("parses compact 4-digit tempo", () => {
    expect(parseTempo("3010")).toEqual({ e: 3, b: 0, c: 1, t: 0 });
    expect(parseTempo("4221")).toEqual({ e: 4, b: 2, c: 2, t: 1 });
  });

  it("parses two-digit phase values", () => {
    expect(parseTempo("10-0-10-0")).toEqual({ e: 10, b: 0, c: 10, t: 0 });
  });

  it("returns null for all-zero tempo (invalid)", () => {
    expect(parseTempo("0-0-0-0")).toBeNull();
    expect(parseTempo("0000")).toBeNull();
  });

  it("returns null when any phase exceeds 60", () => {
    expect(parseTempo("61-0-1-0")).toBeNull();
    expect(parseTempo("1-0-1-61")).toBeNull();
  });

  it("returns null for malformed strings", () => {
    expect(parseTempo("")).toBeNull();
    expect(parseTempo("abc")).toBeNull();
    expect(parseTempo("1-2-3")).toBeNull();       // only 3 parts
    expect(parseTempo("1-2-3-4-5")).toBeNull();   // 5 parts
  });

  it("returns null for X explosive notation (not supported in v1)", () => {
    expect(parseTempo("X-1-2-0")).toBeNull();
  });

  it("returns null for free-text descriptions", () => {
    expect(parseTempo("slow eccentric")).toBeNull();
    expect(parseTempo("controlled")).toBeNull();
  });
});

describe("formatTempo", () => {
  it("formats ParsedTempo to canonical dash string", () => {
    expect(formatTempo({ e: 3, b: 1, c: 2, t: 0 })).toBe("3-1-2-0");
    expect(formatTempo({ e: 10, b: 0, c: 10, t: 0 })).toBe("10-0-10-0");
  });

  it("preserves zero phases", () => {
    expect(formatTempo({ e: 4, b: 0, c: 0, t: 0 })).toBe("4-0-0-0");
  });
});

describe("canonicalizeTempo", () => {
  it("returns canonical form for valid input", () => {
    expect(canonicalizeTempo("3-1-2-0")).toBe("3-1-2-0");
    expect(canonicalizeTempo("3010")).toBe("3-0-1-0");
  });

  it("returns null for invalid tempo", () => {
    expect(canonicalizeTempo("0-0-0-0")).toBeNull();
    expect(canonicalizeTempo("bad")).toBeNull();
    expect(canonicalizeTempo("")).toBeNull();
  });

  it("is idempotent on canonical form", () => {
    const tempo = "4-2-2-1";
    expect(canonicalizeTempo(tempo)).toBe(tempo);
  });
});

describe("tempoAccessibilityLabel", () => {
  it("returns a human-readable label", () => {
    const label = tempoAccessibilityLabel({ e: 3, b: 1, c: 2, t: 0 });
    expect(label).toMatch(/eccentric|lowering/i);
    expect(label).toMatch(/3/);
  });

  it("includes all four phase values", () => {
    const label = tempoAccessibilityLabel({ e: 4, b: 2, c: 2, t: 1 });
    expect(label).toMatch(/4/);
    expect(label).toMatch(/2/);
    expect(label).toMatch(/1/);
  });
});
