/**
 * PacingCard.min-segment.test.tsx — BLD-2712
 *
 * Unit tests for the applyMinSegmentFraction helper and component-level
 * regression guard for the minimum-visible-width fix on the pacing bar.
 *
 * Coverage:
 *   1. Pure helper: applyMinSegmentFraction
 *      a. Tiny non-zero working segment is floored to MIN_SEGMENT_FRAC.
 *      b. Zero segments stay zero (no forced visibility).
 *      c. Normal data is a no-op (all segments already above MIN_SEGMENT_FRAC).
 *      d. Sum invariant: floored fractions sum to 1.0 (± 1e-6).
 *      e. Only one non-zero segment (= 1.0): stays 1.0.
 *      f. Two tiny non-zero: both floored, donors reduced, sum preserved.
 *
 *   2. Component regression: flex prop on Working segment
 *      a. Tiny working: flex >= MIN_SEGMENT_FRAC on pacing-seg-working.
 *      b. working=0: flex == 0 on pacing-seg-working (no forced visibility).
 *      c. Balanced session: flex unchanged (all above MIN_SEGMENT_FRAC).
 *      d. working=0: no working-pattern overlay rendered.
 */

import React from "react";
import { render } from "@testing-library/react-native";
import PacingCard, { applyMinSegmentFraction, MIN_SEGMENT_FRAC } from "../../../../components/session/summary/PacingCard";
import type { PacingBreakdown } from "@/lib/session-pacing";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => {
    const { makeMockThemeColors } = require("../../../helpers/theme");
    return makeMockThemeColors("light");
  },
}));

jest.mock(
  "../../../../components/session/summary/PacingBreakdownSheet",
  () => {
    const React = require("react");
    return {
      __esModule: true,
      default: () => React.createElement("PacingBreakdownSheet", null),
    };
  }
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePacing(overrides: Partial<PacingBreakdown> = {}): PacingBreakdown {
  return {
    working: 600,
    rest: 900,
    other: 300,
    gross: 1800,
    perExercise: [],
    isEmpty: false,
    ...overrides,
  };
}

/** Extract flattened style from a rendered element (handles array or object styles). */
function flatStyle(element: { props: { style?: object | object[] } }): Record<string, unknown> {
  const { style } = element.props;
  if (Array.isArray(style)) return Object.assign({}, ...style);
  return (style as Record<string, unknown>) ?? {};
}

// ── 1. Pure helper unit tests ─────────────────────────────────────────────────

describe("applyMinSegmentFraction — pure helper (BLD-2712)", () => {

  // 1a. Tiny non-zero working → floored to MIN_SEGMENT_FRAC
  it("floors a tiny non-zero working fraction to MIN_SEGMENT_FRAC", () => {
    // working=60, rest=0, other=3540, gross=3600
    // raw fracs: working≈0.0167 (< MIN), rest=0, other≈0.983
    const gross = 3600;
    const raw = {
      working: 60 / gross,     // ≈ 0.0167 < MIN_SEGMENT_FRAC
      rest: 0,
      other: 3540 / gross,     // ≈ 0.983
    };
    const result = applyMinSegmentFraction(raw);
    expect(result.working).toBeGreaterThanOrEqual(MIN_SEGMENT_FRAC);
  });

  // 1b. Zero segments stay zero
  it("preserves zero segments — working=0 stays at 0", () => {
    const raw = { working: 0, rest: 0.5, other: 0.5 };
    const result = applyMinSegmentFraction(raw);
    expect(result.working).toBe(0);
  });

  it("preserves zero segments — rest=0 stays at 0", () => {
    const raw = { working: 60 / 3600, rest: 0, other: 3540 / 3600 };
    const result = applyMinSegmentFraction(raw);
    expect(result.rest).toBe(0);
  });

  // 1c. Normal data (all already above MIN_SEGMENT_FRAC) is a no-op
  it("does not modify fractions that are already above MIN_SEGMENT_FRAC", () => {
    // working=600, rest=900, other=300, gross=1800
    const gross = 1800;
    const raw = {
      working: 600 / gross,   // 0.333
      rest: 900 / gross,      // 0.5
      other: 300 / gross,     // 0.167
    };
    const result = applyMinSegmentFraction(raw);
    expect(result.working).toBeCloseTo(raw.working, 9);
    expect(result.rest).toBeCloseTo(raw.rest, 9);
    expect(result.other).toBeCloseTo(raw.other, 9);
  });

  // 1d. Sum invariant: floored fractions sum to 1.0 ± 1e-6
  it("result fractions sum to 1.0 after flooring a tiny segment", () => {
    const gross = 3600;
    const raw = {
      working: 60 / gross,
      rest: 0,
      other: 3540 / gross,
    };
    const result = applyMinSegmentFraction(raw);
    const sum = result.working + result.rest + result.other;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
  });

  it("result fractions sum to 1.0 with three non-zero segments (one tiny)", () => {
    // working=30, rest=1800, other=1770, gross=3600
    const gross = 3600;
    const raw = {
      working: 30 / gross,    // ≈ 0.0083 < MIN
      rest: 1800 / gross,     // 0.5
      other: 1770 / gross,    // ≈ 0.492
    };
    const result = applyMinSegmentFraction(raw);
    const sum = result.working + result.rest + result.other;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
    expect(result.working).toBeGreaterThanOrEqual(MIN_SEGMENT_FRAC);
  });

  // 1e. Single non-zero segment = 1.0 stays at 1.0
  it("single non-zero segment at 1.0 is unchanged", () => {
    const raw = { working: 1.0, rest: 0, other: 0 };
    const result = applyMinSegmentFraction(raw);
    expect(result.working).toBeCloseTo(1.0, 9);
    expect(result.rest).toBe(0);
    expect(result.other).toBe(0);
  });

  // 1f. Two tiny non-zero segments: both floored, donors reduced, sum preserved
  it("floors two tiny segments and preserves sum=1.0", () => {
    // working=0.01, rest=0.01, other=0.98 — both working and rest below MIN
    const raw = { working: 0.01, rest: 0.01, other: 0.98 };
    const result = applyMinSegmentFraction(raw);
    expect(result.working).toBeGreaterThanOrEqual(MIN_SEGMENT_FRAC);
    expect(result.rest).toBeGreaterThanOrEqual(MIN_SEGMENT_FRAC);
    expect(result.other).toBeGreaterThan(0); // other donated some, still positive
    const sum = result.working + result.rest + result.other;
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
  });
});

// ── 2. Component regression: flex prop on pacing segments ────────────────────

describe("PacingCard — min segment flex guard (BLD-2712)", () => {

  // 2a. Tiny working segment: flex >= MIN_SEGMENT_FRAC on the Working bar
  it("Working segment flex is >= MIN_SEGMENT_FRAC when raw fraction is tiny but non-zero", () => {
    // working=60, rest=0, other=3540, gross=3600
    const pacing = makePacing({ working: 60, rest: 0, other: 3540, gross: 3600 });
    const { getByTestId } = render(<PacingCard pacing={pacing} />);
    const seg = getByTestId("pacing-seg-working", { includeHiddenElements: true });
    const style = flatStyle(seg);
    expect(typeof style.flex).toBe("number");
    expect(style.flex as number).toBeGreaterThanOrEqual(MIN_SEGMENT_FRAC);
  });

  // 2b. working=0: flex == 0 on Working (no forced visibility)
  it("Working segment flex is 0 when working=0 (no forced visibility)", () => {
    const pacing = makePacing({ working: 0, rest: 1800, other: 0, gross: 1800 });
    const { getByTestId } = render(<PacingCard pacing={pacing} />);
    const seg = getByTestId("pacing-seg-working", { includeHiddenElements: true });
    const style = flatStyle(seg);
    expect(style.flex).toBe(0);
  });

  // 2c. working=0: no dash overlay rendered
  it("does NOT render a Working dash pattern when working=0", () => {
    const pacing = makePacing({ working: 0, rest: 1800, other: 0, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-seg-working-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // 2d. Balanced session: Working flex effectively unchanged (already above MIN_SEGMENT_FRAC)
  it("does not alter Working flex for a balanced session (already above MIN_SEGMENT_FRAC)", () => {
    // working=600, rest=900, other=300, gross=1800 → workingFrac=0.333 >> MIN
    const pacing = makePacing({ working: 600, rest: 900, other: 300, gross: 1800 });
    const { getByTestId } = render(<PacingCard pacing={pacing} />);
    const seg = getByTestId("pacing-seg-working", { includeHiddenElements: true });
    const style = flatStyle(seg);
    // Should be close to 600/1800 = 0.333..., i.e., unchanged
    expect(style.flex as number).toBeCloseTo(600 / 1800, 3);
  });
});
