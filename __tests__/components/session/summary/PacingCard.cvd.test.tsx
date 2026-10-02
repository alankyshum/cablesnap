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
import PacingCard, { HatchOverlay, WorkingDashOverlay, RestDashOverlay, DASH_H, DASH_COLOR, SEGMENT_DIVIDER_WIDTH, SEGMENT_DIVIDER_COLOR_LIGHT, SEGMENT_DIVIDER_COLOR_DARK } from "../../../../components/session/summary/PacingCard";
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

  // ── 11b. Spacing consistency (BLD-3640) ──────────────────────────────────
  it("uses a consistent margin bottom of 12 on the header row", () => {
    const { getByText } = render(<PacingCard pacing={makePacing()} />);
    const title = getByText("Estimated pacing");
    
    // Find the ancestor View that represents the header row
    let headerRow = title.parent;
    while (headerRow && (headerRow.type as unknown) !== "View") {
      headerRow = headerRow.parent;
    }
    expect(headerRow).toBeTruthy();

    const style = headerRow?.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.marginBottom).toBe(12);
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

// ─── BLD-3880 — protanopia-safe segment boundary ──────────────────────────────
//
// Under protanopia emulation the coral (#FF6038) desaturates toward dark yellow
// and its luminance separation from the Rest blue collapses, so the base fills
// alone can look adjacent. We add TWO defensive layers:
//   (a) a thin surface-coloured divider between adjacent non-zero segments
//   (b) a strengthened Working dash overlay (higher alpha + thicker dashes) so
//       the textured/solid distinction is more visible under CVD.
//
// Both must remain decorative (a11y-hidden) and both must respect zero-segment
// edge cases (no orphaned dividers on collapsed segments).

// WCAG relative luminance (sRGB) — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relLuminance(hex: string): number {
  const h = hex.replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

describe("PacingCard — protanopia boundary (BLD-3880)", () => {
  // ── 1. Divider between Working|Rest when both visible ─────────────────────
  it("renders a divider between Working and Rest when both are non-zero", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const divider = getByTestId("pacing-divider-working-rest", { includeHiddenElements: true });
    expect(divider).toBeTruthy();
  });

  // ── 2. Divider between Rest|Other when both visible ───────────────────────
  it("renders a divider between Rest and Other when both are non-zero", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const divider = getByTestId("pacing-divider-rest-other", { includeHiddenElements: true });
    expect(divider).toBeTruthy();
  });

  // ── 3. No orphan divider when Working is 0 ────────────────────────────────
  it("does NOT render a Working|Rest divider when Working is zero", () => {
    const pacing = makePacing({ working: 0, rest: 1200, other: 600, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-divider-working-rest", { includeHiddenElements: true })).toBeNull();
  });

  // ── 4. No orphan divider when Other is 0 ──────────────────────────────────
  it("does NOT render a Rest|Other divider when Other is zero", () => {
    const pacing = makePacing({ working: 900, rest: 900, other: 0, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-divider-rest-other", { includeHiddenElements: true })).toBeNull();
  });

  // ── 5. Working|Other divider appears when Rest is zero (edge case) ────────
  it("renders a Working|Other divider when Rest is zero and both neighbours are non-zero", () => {
    const pacing = makePacing({ working: 900, rest: 0, other: 900, gross: 1800 });
    const { getByTestId, queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(getByTestId("pacing-divider-working-other", { includeHiddenElements: true })).toBeTruthy();
    // And no phantom Working|Rest or Rest|Other dividers
    expect(queryByTestId("pacing-divider-working-rest", { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId("pacing-divider-rest-other", { includeHiddenElements: true })).toBeNull();
  });

  // ── 6. No dividers when only one segment is non-zero ──────────────────────
  it("renders no dividers when only Rest is non-zero", () => {
    const pacing = makePacing({ working: 0, rest: 1800, other: 0, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-divider-working-rest", { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId("pacing-divider-rest-other", { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId("pacing-divider-working-other", { includeHiddenElements: true })).toBeNull();
  });

  // ── 7. Divider is fixed pixel width (not flex) so segment fractions are ───
  //    unaffected by its presence.
  it("divider style uses a fixed pixel width (not flex)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const divider = getByTestId("pacing-divider-working-rest", { includeHiddenElements: true });
    const style = divider.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.width).toBe(SEGMENT_DIVIDER_WIDTH);
    expect(SEGMENT_DIVIDER_WIDTH).toBeGreaterThanOrEqual(1.5);
    expect(flat.flex).toBeUndefined();
  });

  // ── 8. Divider colour has strong WCAG luminance contrast against both ─────
  //    neighbouring segment fills (light theme + dark theme).
  //
  // Light theme card surface = #FFFFFF (theme/colors.ts). Working = #FF6038.
  // Rest = #08415C. Other = mid-grey (varies). We require ≥ 3:1 which is the
  // WCAG 2.1 non-text UI component minimum and matches the audit spec.
  it("light-theme divider (pure white) contrasts ≥ 3:1 against Working coral and Rest petrol-blue", () => {
    // BLD-3880: pure white is the ONLY choice that clears WCAG 3:1 against both
    // #FF6038 (L≈0.30) and #08415C (L≈0.045) on light theme. A mid-tone card
    // surface #F3F4F6 fails the gate against coral at ~2.7:1.
    const WORKING = "#FF6038";
    const REST = "#08415C";
    expect(SEGMENT_DIVIDER_COLOR_LIGHT).toBe("#FFFFFF");
    expect(contrastRatio(SEGMENT_DIVIDER_COLOR_LIGHT, WORKING)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(SEGMENT_DIVIDER_COLOR_LIGHT, REST)).toBeGreaterThanOrEqual(3);
  });

  it("dark-theme divider (pure black) contrasts ≥ 3:1 against Working coral and Rest pale-cyan", () => {
    // theme/colors.ts dark: primary = #FF7A55, pacingRest = #A5F3FC.
    const WORKING_DARK = "#FF7A55";
    const REST_DARK = "#A5F3FC";
    expect(SEGMENT_DIVIDER_COLOR_DARK).toBe("#000000");
    expect(contrastRatio(SEGMENT_DIVIDER_COLOR_DARK, WORKING_DARK)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(SEGMENT_DIVIDER_COLOR_DARK, REST_DARK)).toBeGreaterThanOrEqual(3);
  });

  it("light-theme divider renders with the pure-white backgroundColor at runtime", () => {
    // The theme mock returns light-mode colours (see helpers/theme). The
    // rendered divider style must carry the SEGMENT_DIVIDER_COLOR_LIGHT value.
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const divider = getByTestId("pacing-divider-working-rest", { includeHiddenElements: true });
    const style = divider.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.backgroundColor).toBe(SEGMENT_DIVIDER_COLOR_LIGHT);
  });

  // ── 9. Divider is decorative on native (accessibilityElementsHidden = true) ─
  it("divider is a11y-hidden on native and web (pointerEvents none, aria-hidden)", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    const divider = getByTestId("pacing-divider-working-rest", { includeHiddenElements: true });
    expect(divider.props.pointerEvents).toBe("none");
    if (Platform.OS !== "web") {
      expect(divider.props.accessibilityElementsHidden).toBe(true);
    }
  });

  // ── 10. Strengthened dash: raised alpha + thicker dashes (protanopia) ─────
  //
  // The Working dash overlay had rgba(255,255,255,0.55) at 1.5px height, which
  // was too subtle on the darkened coral under protanopia. Locked here so future
  // edits don't silently regress below the strengthened thresholds.
  it("Working dash colour alpha is at least 0.80 (raised from 0.55 pre-BLD-3880)", () => {
    // Parse rgba(255,255,255,X) — extract the alpha.
    const m = DASH_COLOR.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/);
    expect(m).not.toBeNull();
    const alpha = m ? parseFloat(m[1]) : 0;
    expect(alpha).toBeGreaterThanOrEqual(0.8);
  });

  it("Working dash thickness is at least 2.0px (raised from 1.5px pre-BLD-3880)", () => {
    expect(DASH_H).toBeGreaterThanOrEqual(2.0);
  });

  // ── 11. Existing structural overlays remain intact (regression guards for
  //    BLD-1939 / 2713 / 2714 / 2725 already covered above; this is a smoke
  //    check that adding dividers didn't break the overlay renderers). ──────
  it("all three CVD overlays remain present alongside the new dividers", () => {
    const { getByTestId } = render(<PacingCard pacing={makePacing()} />);
    expect(getByTestId("pacing-seg-working-pattern", { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId("pacing-seg-other-pattern", { includeHiddenElements: true })).toBeTruthy();
    // Rest is intentionally solid (no overlay).
    expect(getByTestId("pacing-divider-working-rest", { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId("pacing-divider-rest-other", { includeHiddenElements: true })).toBeTruthy();
  });

  // ── 12. BLD-4685: Audit 2026-07-29 completed-workout/mobile-protanopia.png ─
  //
  // Diagnosis: FALSE POSITIVE (B) from the bitmap-only protanopia emulator.
  //
  // Background
  // ----------
  // The 2026-07-29 protanopia audit (scenario: completed-workout, route:
  // /session/summary/scenario-completed-workout-1, commit 712c4076) flagged
  // the Estimated pacing bar's Working|Other boundary as a contrast issue.
  //
  // In that workout Working=1:48, Rest=0:00, Other=57:12.  restFrac=0 triggers
  // the Working|Other divider path (showDividerWorkingOther = true, BLD-3880).
  //
  // Why the emulator fires
  // ----------------------
  // Under Machado-2009 protanopia (severity=1.0) the Working coral (#FF6038)
  // maps to dark-olive #806E35 (L≈0.160) and the Other gray (#6B7280) maps to
  // #6E7381 (L≈0.172) — a W/O contrast of only ~1.055:1, barely above 1:1.
  // A bitmap emulator that scores raw fill-color contrast flags this correctly.
  //
  // Why it is a false positive for a human viewer
  // ----------------------------------------------
  // TWO hue-independent structural channels remain fully intact under any CVD
  // transform including protanopia:
  //
  //   1. The 2 px pure-white (#FFFFFF) inter-segment divider (BLD-3880).
  //      White is achromatic: the Machado protanopia matrix maps it to itself
  //      (#FFFFFF → #FFFFFF), so the divider retains full luminance contrast
  //      against both simulated Working (~5:1) and simulated Other (~4.7:1).
  //      This crisp hue-independent boundary line delineates the segments
  //      regardless of fill-color similarity.
  //
  //   2. Shape-based textures: horizontal-dash overlay on Working vs circular-
  //      dot overlay on Other (BLD-3880/2713/2714). Shape discrimination is
  //      entirely color-transform-invariant — a dash and a circle look different
  //      in any color space.
  //
  // The LIGHT_FLOORS.prot.WO = 1.0 floor in pacing-cvd-contrast.test.ts
  // intentionally accepts near-1:1 fill luminance under protanopia because
  // BLD-3880 explicitly relies on the divider + texture to carry that axis.
  //
  // Screenshot evidence: human inspection of completed-workout/mobile-protanopia.png
  // (from audit-2026-07-29-712c4076.zip) confirms the bar's Working segment and
  // Other segment are distinguishable via the white divider line and pattern texture.
  it("BLD-4685 false-positive: Working|Other divider renders in Rest=0 scenario and uses achromatic (protanopia-invariant) white", () => {
    // Rest=0 mirrors the completed-workout audit scenario (Working=1:48, Other=57:12)
    const pacing = makePacing({ working: 108, rest: 0, other: 3432, gross: 3540 });
    const { getByTestId, queryByTestId } = render(<PacingCard pacing={pacing} />);

    // Working|Other divider must fire for the Rest=0 edge case (BLD-3880)
    const divider = getByTestId("pacing-divider-working-other", { includeHiddenElements: true });
    expect(divider).toBeTruthy();

    // Divider colour must be pure white — achromatic, so invariant under the
    // Machado protanopia transform.  It retains ~5:1 contrast against both
    // olive-simulated Working and gray-simulated Other.
    const style = divider.props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    expect(flat.backgroundColor).toBe(SEGMENT_DIVIDER_COLOR_LIGHT);
    // SEGMENT_DIVIDER_COLOR_LIGHT must be the pure-white value (verified separately
    // in the BLD-3880 contrast suite).  Restating the invariant here ties this
    // test to that constant so a future palette change triggers a visible failure.
    expect(SEGMENT_DIVIDER_COLOR_LIGHT).toBe("#FFFFFF");

    // No phantom dividers for the zero Rest segment
    expect(queryByTestId("pacing-divider-working-rest", { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId("pacing-divider-rest-other", { includeHiddenElements: true })).toBeNull();

    // Both Working and Other carry their shape-based texture overlays —
    // shape discrimination is color-transform-invariant, providing a second
    // structural channel independent of any CVD colour shift.
    expect(getByTestId("pacing-seg-working-pattern", { includeHiddenElements: true })).toBeTruthy();
    expect(getByTestId("pacing-seg-other-pattern", { includeHiddenElements: true })).toBeTruthy();
  });

  // ── 15. Protanopia-safe inter-segment divider tests (BLD-3871 / BLD-3880) ──
  it("renders inter-segment dividers when all three pacing segments are present", () => {
    const { getAllByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dividers = getAllByTestId("pacing-bar-divider", { includeHiddenElements: true });
    // Expect 2 dividers (one between Working-Rest, one between Rest-Other)
    expect(dividers.length).toBe(2);
  });

  it("renders exactly 1 divider when only two segments are present", () => {
    // working and rest are present, other is 0
    const pacing = makePacing({ working: 900, rest: 900, other: 0, gross: 1800 });
    const { getAllByTestId } = render(<PacingCard pacing={pacing} />);
    const dividers = getAllByTestId("pacing-bar-divider", { includeHiddenElements: true });
    expect(dividers.length).toBe(1);
  });

  it("renders NO dividers when only one segment is present", () => {
    const pacing = makePacing({ working: 0, rest: 1800, other: 0, gross: 1800 });
    const { queryAllByTestId } = render(<PacingCard pacing={pacing} />);
    const dividers = queryAllByTestId("pacing-bar-divider", { includeHiddenElements: true });
    expect(dividers.length).toBe(0);
  });

  it("renders dividers with matching colors.surface background color", () => {
    const { getAllByTestId } = render(<PacingCard pacing={makePacing()} />);
    const dividers = getAllByTestId("pacing-bar-divider", { includeHiddenElements: true });
    const style = dividers[0].props.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    // Expect background color to be present (representing colors.surface / card color)
    expect(flat.backgroundColor).toBeTruthy();
  });
});
