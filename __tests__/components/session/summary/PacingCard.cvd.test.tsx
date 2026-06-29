/**
 * PacingCard.cvd.test.tsx — BLD-1939
 *
 * Headless proxy tests for the CVD (colour-vision-deficiency) fix on the
 * pacing bar. The original finding is a deuteranopia emulation visual
 * judgment that cannot be re-run headlessly; these tests cover the same
 * risk by verifying the structural properties that make the fix work:
 *
 * 1. The "Other" bar segment renders the diagonal hatch pattern element.
 * 2. The "Other" legend dot renders the diagonal hatch pattern element.
 * 3. "Working" and "Rest" bar/dot do NOT carry the hatch.
 * 4. Each segment still has its base backgroundColor (additive, not replacement).
 * 5. The hatch overlay is decorative: a11y hidden, pointer-events none.
 * 6. Empty state path (otherFrac == 0) does not crash and hatch is absent.
 * 7. Source contracts (labels/copy) are unchanged.
 */

import React from "react";
import { Platform } from "react-native";
import { render } from "@testing-library/react-native";
import PacingCard, { HatchOverlay } from "../../../../components/session/summary/PacingCard";
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

  // ── 3. Working segment has NO hatch ───────────────────────────────────────
  it("does NOT render a hatch on the Working bar segment", () => {
    const { queryByTestId } = render(<PacingCard pacing={makePacing()} />);
    expect(queryByTestId("pacing-seg-working-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 4. Rest segment has NO hatch ──────────────────────────────────────────
  it("does NOT render a hatch on the Rest bar segment", () => {
    const { queryByTestId } = render(<PacingCard pacing={makePacing()} />);
    expect(queryByTestId("pacing-seg-rest-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 5. Working dot has NO hatch ────────────────────────────────────────────
  it("does NOT render a hatch on the Working legend dot", () => {
    const { queryByTestId } = render(<PacingCard pacing={makePacing()} />);
    expect(queryByTestId("pacing-dot-working-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 6. Rest dot has NO hatch ──────────────────────────────────────────────
  it("does NOT render a hatch on the Rest legend dot", () => {
    const { queryByTestId } = render(<PacingCard pacing={makePacing()} />);
    expect(queryByTestId("pacing-dot-rest-pattern", { includeHiddenElements: true })).toBeNull();
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

  // ── 8. Hatch overlay is a11y-hidden (Platform-aware — BLD-1994) ──────────
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

  // ── 9. Empty state — otherFrac == 0: no crash, hatch absent ───────────────
  it("does not render hatch on Other segment when other time is zero", () => {
    // working + rest == gross leaves otherFrac = 0
    const pacing = makePacing({ working: 900, rest: 900, other: 0, gross: 1800 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    expect(queryByTestId("pacing-seg-other-pattern", { includeHiddenElements: true })).toBeNull();
  });

  // ── 10. isEmpty path renders without crash ────────────────────────────────
  it("renders empty state without crashing (no bar rendered)", () => {
    const pacing = makePacing({ isEmpty: true, working: 0, rest: 0, other: 0, gross: 0 });
    const { queryByTestId } = render(<PacingCard pacing={pacing} />);
    // No bar segments in empty state
    expect(queryByTestId("pacing-seg-other", { includeHiddenElements: true })).toBeNull();
    expect(queryByTestId("pacing-seg-other-pattern", { includeHiddenElements: true })).toBeNull();
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
});
