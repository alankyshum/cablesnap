/**
 * PacingCard.cvd.test.tsx — BLD-1939, BLD-2713, BLD-2714
 *
 * Headless proxy tests for the CVD (colour-vision-deficiency) fixes on the
 * pacing bar. Visual CVD emulation judgments cannot be re-run headlessly;
 * these tests cover the same risk by verifying the structural properties
 * that make each fix work.
 *
 * Fix inventory:
 *   BLD-1939  — "Other" bar + legend dot carry a dot/stipple texture (HatchOverlay).
 *   BLD-2725  — Stripes → dots on Other (same testIDs; stripe was "disabled"-looking).
 *   BLD-2713/2714 — "Working" bar + legend dot carry a distinct horizontal-dash
 *                   overlay (WorkingDashOverlay) so all three segs are mutually
 *                   distinguishable in grayscale and under red-green CVD.
 *   BLD-2205  — Bar Other hatch covers the full segment (full-fill, not 18px).
 *
 * Per-segment non-color cue summary:
 *   Working → horizontal-dash pattern (pacing-seg-working-pattern / pacing-dot-working-pattern)
 *   Rest    → solid only              (no pattern overlay)
 *   Other   → dot stipple             (pacing-seg-other-pattern  / pacing-dot-other-pattern)
 */

import React from "react";
import { Platform } from "react-native";
import { render } from "@testing-library/react-native";
import PacingCard, { HatchOverlay, WorkingDashOverlay, RestDashOverlay } from "../../../../components/session/summary/PacingCard";
import type { PacingBreakdown } from "@/lib/session-pacing";

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => {
    const { makeMockThemeColors } = require("../../../helpers/theme");
    return makeMockThemeColors("light");
  },
}));

// PacingBreakdownSheet opened on tap — not under test here; stub it out.
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

// ── Factories ────────────────────────────────────────────────────────────────

function makePacing(overrides: Partial<PacingBreakdown> = {}): PacingBreakdown {
  return {
    working: 600,   // 10 min
    rest: 900,      // 15 min
    other: 300,     // 5 min   ← ensures otherFrac > 0
    gross: 1800,    // 30 min
    perExercise: [],
    isEmpty: false,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PacingCard — CVD hatch fix (BLD-1939)", () => {
  // ── 1. Hatch presence on Other bar segment ─────────────────────────────────
  it("renders the hatch pattern overlay on the Other bar segment", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    // testID is assigned in the HatchOverlay rendered inside pacing-seg-other
    // barContainer has accessibilityElementsHidden so we must include hidden elements
    const hatch = getByTestId("pacing-seg-other-pattern", { includeHiddenElements: true });
    expect(hatch).toBeTruthy();
  });

  // ── 2. Hatch presence on Other legend dot ─────────────────────────────────
  it("renders the hatch pattern overlay on the Other legend dot", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dotHatch = getByTestId("pacing-dot-other-pattern", { includeHiddenElements: true });
    expect(dotHatch).toBeTruthy();
  });

  // ── 3. Working bar segment carries the horizontal-dash cue (BLD-2713/BLD-2714)
  //
  // Previously: test asserted Working had NO pattern (testIDs absent).
  // Updated: Working must NOW carry WorkingDashOverlay so all three segments
  // are mutually distinguishable in grayscale and under red-green CVD.
  it("renders the dash pattern overlay on the Working bar segment", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dash = getByTestId("pacing-seg-working-pattern", { includeHiddenElements: true });
    expect(dash).toBeTruthy();
  });

  // ── 4. Rest segment carries the vertical-dash cue (BLD-3879) ───────────────
  it("renders the vertical dash pattern overlay on the Rest bar segment", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const restPattern = getByTestId("pacing-seg-rest-pattern", { includeHiddenElements: true });
    expect(restPattern).toBeTruthy();
  });

  // ── 5. Working legend dot carries the horizontal-dash cue (BLD-2713/BLD-2714)
  //
  // Previously: test asserted Working dot had NO pattern.
  // Updated: Working dot must carry WorkingDashOverlay.
  it("renders the dash pattern overlay on the Working legend dot", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dotDash = getByTestId("pacing-dot-working-pattern", { includeHiddenElements: true });
    expect(dotDash).toBeTruthy();
  });

  // ── 6. Rest dot carries the vertical-dash cue (BLD-3879) ───────────────────
  it("renders the vertical dash pattern overlay on the Rest legend dot", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dotRestPattern = getByTestId("pacing-dot-rest-pattern", { includeHiddenElements: true });
    expect(dotRestPattern).toBeTruthy();
  });

  // ── 7. Base backgroundColor preserved on each segment ─────────────────────
  it("preserves coral backgroundColor on the Working segment", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const seg = getByTestId("pacing-seg-working", { includeHiddenElements: true });
    const style = seg.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.backgroundColor).toBeTruthy();
  });

  it("preserves blue backgroundColor on the Rest segment", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const seg = getByTestId("pacing-seg-rest", { includeHiddenElements: true });
    const style = seg.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.backgroundColor).toBeTruthy();
  });

  it("preserves grey backgroundColor on the Other segment", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const seg = getByTestId("pacing-seg-other", { includeHiddenElements: true });
    const style = seg.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.backgroundColor).toBeTruthy();
  });

  // ── 8. HatchOverlay is a11y-hidden (Platform-aware — BLD-1994) ──────────
  //
  // On native, accessibilityElementsHidden must be true so screen readers skip
  // the decorative overlay. On web, the prop must NOT be true — react-native-svg's
  // WebShape does not strip RN-only a11y props before DOM render, which causes
  // a React DOM warning "Received `true` for a non-boolean attribute" and a
  // visible error toast. Web a11y is handled correctly via aria-hidden instead.
  it("hatch overlay accessibilityElementsHidden is Platform-gated (true on native, false on web)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const hatch = getByTestId("pacing-seg-other-pattern", { includeHiddenElements: true });
    if (Platform.OS === 'web') {
      // Must NOT be true on web — avoids DOM prop warning / error toast
      expect(hatch.props.accessibilityElementsHidden).not.toBe(true);
    } else {
      // Must be true on native — screen reader skips decorative overlay
      expect(hatch.props.accessibilityElementsHidden).toBe(true);
    }
  });

  it("hatch overlay importantForAccessibility is undefined on web", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const hatch = getByTestId("pacing-seg-other-pattern", { includeHiddenElements: true });
    if (Platform.OS === 'web') {
      // Must be undefined on web — avoids DOM prop warning (BLD-1994)
      expect(hatch.props.importantForAccessibility).toBeUndefined();
    } else {
      // Must be 'no-hide-descendants' on native
      expect(hatch.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });

  // ── 8b. WorkingDashOverlay is a11y-hidden (BLD-2713/BLD-2714, BLD-1994) ──
  it("dash overlay accessibilityElementsHidden is Platform-gated (true on native, false on web)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dash = getByTestId("pacing-seg-working-pattern", { includeHiddenElements: true });
    if (Platform.OS === 'web') {
      expect(dash.props.accessibilityElementsHidden).not.toBe(true);
    } else {
      expect(dash.props.accessibilityElementsHidden).toBe(true);
    }
  });

  it("dash overlay importantForAccessibility is undefined on web", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dash = getByTestId("pacing-seg-working-pattern", { includeHiddenElements: true });
    if (Platform.OS === 'web') {
      expect(dash.props.importantForAccessibility).toBeUndefined();
    } else {
      expect(dash.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });

  // ── 9. Empty state — otherFrac == 0: no crash, hatch absent ───────────────
  it("does not render hatch on Other segment when other time is zero", () => {
    // working + rest == gross leaves otherFrac = 0
    const pacing = makePacing({ working: 900, rest: 900, other: 0, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-seg-other-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 9b. workingFrac == 0: no crash, dash absent ────────────────────────────
  it("does not render dash on Working segment when working time is zero", () => {
    // rest == gross leaves workingFrac = 0
    const pacing = makePacing({ working: 0, rest: 1800, other: 0, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-seg-working-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 9c. restFrac == 0: no crash, rest pattern absent ──────────────────────
  it("does not render rest pattern on Rest segment when rest time is zero", () => {
    // working + other == gross leaves restFrac = 0
    const pacing = makePacing({ working: 900, rest: 0, other: 900, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-seg-rest-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 10. isEmpty path renders without crash ────────────────────────────────
  it("renders empty state without crashing (no bar rendered)", () => {
    const pacing = makePacing({ isEmpty: true, working: 0, rest: 0, other: 0, gross: 0 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    // No bar segments in empty state
    expect(queryByTestId("pacing-seg-other", { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId("pacing-seg-other-pattern", { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId("pacing-seg-working-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 11. Copy contracts unchanged ─────────────────────────────────────────
  it("still renders the title 'Estimated pacing'", () => {
    const { getByText } = render(<PacingCard pacing={makePacing()} />);
    expect(getByText("Estimated pacing")).toBeTruthy();
  });

  it("still renders segment labels Working / Rest / Other", () => {
    const { getByText } = render(<PacingCard pacing={makePacing()} />);
    expect(getByText("Working")).toBeTruthy();
    expect(getByText("Rest")).toBeTruthy();
    expect(getByText("Other")).toBeTruthy();
  });

  // ── 12. HatchOverlay unit: returns null for zero/negative dimensions ──────
  it("HatchOverlay returns null when width is 0", () => {
    const { toJSON } = render(<HatchOverlay width={0} height={18} />);
    expect(toJSON()).toBeNull();
  });

  it("HatchOverlay returns null when height is 0", () => {
    const { toJSON } = render(<HatchOverlay width={18} height={0} />);
    expect(toJSON()).toBeNull();
  });

  // ── 12b. WorkingDashOverlay unit: returns null for zero/negative dims ─────
  it("WorkingDashOverlay returns null when width is 0", () => {
    const { toJSON } = render(<WorkingDashOverlay width={0} height={18} />);
    expect(toJSON()).toBeNull();
  });

  it("WorkingDashOverlay returns null when height is 0", () => {
    const { toJSON } = render(<WorkingDashOverlay width={18} height={0} />);
    expect(toJSON()).toBeNull();
  });

  // ── 12c. RestDashOverlay unit: returns null for zero/negative dims ─────
  it("RestDashOverlay returns null when width is 0", () => {
    const { toJSON } = render(<RestDashOverlay width={0} height={18} />);
    expect(toJSON()).toBeNull();
  });

  it("RestDashOverlay returns null when height is 0", () => {
    const { toJSON } = render(<RestDashOverlay width={18} height={0} />);
    expect(toJSON()).toBeNull();
  });

  // ── 13. Bar Other hatch must be full-fill, NOT a fixed px size (BLD-2205) ──
  //
  // This test locks the regression: the bar segment is flex-sized (often 100-300px
  // wide) but the original fix (BLD-1939) rendered the SVG at 18×18px, covering
  // only the leftmost 18px of the Other segment. Full-fill requires width="100%"
  // and height="100%" on both the Svg canvas and the Rect fill element.
  it("bar Other hatch SVG canvas is full-fill (width/height = '100%', not a fixed px number)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const hatch = getByTestId("pacing-seg-other-pattern", { includeHiddenElements: true });
    // The Svg element receives the width/height props directly.
    expect(hatch.props.width).toBe("100%");
    expect(hatch.props.height).toBe("100%");
  });

  it("bar Other hatch Rect fill is full-fill (width/height = '100%', not a fixed px number)", () => {
    const { getByTestId, UNSAFE_getAllByType } = render(<PacingCard pacing={makePacing()} />);
    // Verify hatch is present first
    getByTestId("pacing-seg-other-pattern", { includeHiddenElements: true });
    // Find all Rect elements (from react-native-svg) and locate the fill rect
    // inside the bar hatch SVG. The Rect that covers the hatch area uses the
    // fill url pattern and should have "100%" dimensions.
    const Rect = require("react-native-svg").Rect;
    const rects = UNSAFE_getAllByType(Rect);
    // The bar's fill Rect (pacing-seg-other-pattern's inner rect) uses "100%"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fillRect = rects.find((r: any) =>
      r.props.width === "100%" &&
      typeof r.props.fill === "string" &&
      r.props.fill.startsWith("url(")
    );
    expect(fillRect).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((fillRect as any).props.height).toBe("100%");
  });

  it("legend dot hatch SVG canvas keeps explicit 8×8 dimensions (not full-fill)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dotHatch = getByTestId("pacing-dot-other-pattern", { includeHiddenElements: true });
    // Legend dot is fixed 8×8 — must NOT use "100%" (that would scale with the dot container)
    expect(dotHatch.props.width).toBe(8);
    expect(dotHatch.props.height).toBe(8);
  });

  // ── 13b. Working dash bar must be full-fill (BLD-2713/BLD-2714) ──────────
  //
  // Same regression guard as BLD-2205: the dash SVG canvas must be "100%×100%"
  // to cover the full flex-sized bar segment.
  it("bar Working dash SVG canvas is full-fill (width/height = '100%')", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dash = getByTestId("pacing-seg-working-pattern", { includeHiddenElements: true });
    expect(dash.props.width).toBe("100%");
    expect(dash.props.height).toBe("100%");
  });

  it("legend dot dash SVG canvas keeps explicit 8×8 dimensions (not full-fill)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dotDash = getByTestId("pacing-dot-working-pattern", { includeHiddenElements: true });
    expect(dotDash.props.width).toBe(8);
    expect(dotDash.props.height).toBe(8);
  });

  // ── 13c. Rest dash bar must be full-fill (BLD-3902) ──────────────────────
  it("bar Rest dash SVG canvas is full-fill (width/height = '100%')", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const restDash = getByTestId("pacing-seg-rest-pattern", { includeHiddenElements: true });
    expect(restDash.props.width).toBe("100%");
    expect(restDash.props.height).toBe("100%");
  });

  it("legend dot rest dash SVG canvas keeps explicit 8×8 dimensions (not full-fill)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dotRestDash = getByTestId("pacing-dot-rest-pattern", { includeHiddenElements: true });
    expect(dotRestDash.props.width).toBe(8);
    expect(dotRestDash.props.height).toBe(8);
  });

  // ── 14. Working dash, Rest dash, and Other dot use distinct SVG pattern IDs 
  //
  // The three overlays must use DIFFERENT SVG Pattern IDs so they render distinct
  // shapes. If two had the same ID, the second Defs block would shadow the first
  // and both segments would look identical — defeating the CVD fix.
  //
  // They use url(#...) pattern fills; we distinguish by finding both Defs
  // patterns and asserting that the Pattern elements have different IDs.
  it("Other dot, Working dash, and Rest dash patterns have distinct SVG Pattern IDs", () => {
    const { UNSAFE_getAllByType } = render(<PacingCard pacing={makePacing()} />);
    const { Pattern } = require("react-native-svg");
    const patterns = UNSAFE_getAllByType(Pattern);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ids = new Set(patterns.map((p: any) => p.props.id as string | undefined));
    // Must have at least three distinct IDs (one for dot, one for working dash, one for rest vertical dash)
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });
});
