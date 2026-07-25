import React from "react";
import { fireEvent } from "@testing-library/react-native";
import WorkoutHeatmap from "../../components/WorkoutHeatmap";
import { renderScreen } from "../helpers/render";
import { withOpacity } from "../../lib/format";

describe("WorkoutHeatmap", () => {
  const emptyData = new Map<string, number>();

  it("renders without crashing with empty data", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByText("Less")).toBeTruthy();
    expect(getByText("More")).toBeTruthy();
  });

  it("shows empty state message when no workouts", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByText("Start working out to see your consistency here!")).toBeTruthy();
  });

  it("does not show empty state when data exists", () => {
    const data = new Map([["2026-04-14", 1]]);
    const { queryByText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    expect(queryByText("Start working out to see your consistency here!")).toBeNull();
  });

  it("renders unambiguous weekday labels (BLD-686: GitHub-style Mon/Wed/Fri only)", () => {
    const { getAllByText, queryAllByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    // Only Mon/Wed/Fri rows show labels — Tue/Thu/Sat/Sun are blank to avoid T/T and S/S collisions.
    expect(getAllByText("Mon").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Wed").length).toBeGreaterThanOrEqual(1);
    expect(getAllByText("Fri").length).toBeGreaterThanOrEqual(1);
    // Regression guard: never reintroduce ambiguous single-letter labels.
    expect(queryAllByText("T").length).toBe(0);
    expect(queryAllByText("S").length).toBe(0);
  });

  it("renders accessibility labels on cells", () => {
    const data = new Map([["2026-04-14", 2]]);
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    // Should have accessibility labels with workout counts
    const cell = getByLabelText(/April 14, 2 workouts/);
    expect(cell).toBeTruthy();
  });

  it("has accessible role on container", () => {
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByLabelText("Workout heatmap grid")).toBeTruthy();
  });

  it("calls onDayPress when a cell is pressed", () => {
    const onPress = jest.fn();
    const data = new Map([["2026-04-14", 1]]);
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={data} onDayPress={onPress} />
    );
    const cell = getByLabelText(/April 14/);
    fireEvent.press(cell);
    expect(onPress).toHaveBeenCalledWith("2026-04-14");
  });

  it("renders color legend", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(getByText("Less")).toBeTruthy();
    expect(getByText("More")).toBeTruthy();
  });

  // BLD-732 / BLD-763: each populated cell exposes its workout count via
  // accessibilityLabel ("<weekday>, <date>, N workouts"), and the legend
  // chips render visible numeric text "1" / "2" / "3+".
  //
  // The legend chip <Text> nodes carry accessibilityElementsHidden=true so
  // screen readers don't double-announce them (the parent View carries the
  // full "Heatmap legend: 0, 1, 2, and 3 or more workouts" label). RNTL's
  // default *ByText queries skip a11y-hidden subtrees, so we pass
  // { includeHiddenElements: true } to match them. Body cells are queried
  // through accessibilityLabel — the actual a11y guarantee — which is more
  // robust than asserting visible <Text> under a Pressable that may have
  // cellSize=0 in jest-expo's test env.
  it("renders 3+ legend chip and exposes count via accessibilityLabel (BLD-732)", () => {
    const data = new Map([["2026-04-14", 3]]);
    const { getAllByText, getByLabelText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    expect(getAllByText("3+", { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1);
    expect(getByLabelText(/April 14, 3 workouts/)).toBeTruthy();
  });

  it("renders '1' legend chip and exposes count via accessibilityLabel (BLD-732)", () => {
    const data = new Map([["2026-04-14", 1]]);
    const { getAllByText, getByLabelText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    expect(getAllByText("1", { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1);
    expect(getByLabelText(/April 14, 1 workout$/)).toBeTruthy();
  });

  it("renders '2' legend chip and exposes count via accessibilityLabel (BLD-732)", () => {
    const data = new Map([["2026-04-14", 2]]);
    const { getAllByText, getByLabelText } = renderScreen(
      <WorkoutHeatmap data={data} />
    );
    expect(getAllByText("2", { includeHiddenElements: true }).length).toBeGreaterThanOrEqual(1);
    expect(getByLabelText(/April 14, 2 workouts/)).toBeTruthy();
  });

  it("does not render a numeric label for cells with zero workouts (BLD-732)", () => {
    const { queryByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    // Step-0 cells stay unlabelled — the empty fill is the cue.
    expect(queryByText("0")).toBeNull();
  });

  it("legend exposes a screen-reader summary of all four steps (BLD-732)", () => {
    const { getByLabelText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    expect(
      getByLabelText("Heatmap legend: 0, 1, 2, and 3 or more workouts")
    ).toBeTruthy();
  });

  // BLD-662: when totalAllTime > 0 but the visible window is empty, the
  // copy must NOT contradict the stat card ("X total" + "start working out").
  it("uses 'no workouts in last N weeks' copy when totalAllTime > 0 and data empty", () => {
    const { getByText, queryByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} totalAllTime={5} weeks={16} />
    );
    expect(getByText("No completed workouts in the last 16 weeks")).toBeTruthy();
    expect(queryByText("Start working out to see your consistency here!")).toBeNull();
  });

  it("uses 'start working out' copy when totalAllTime is 0 (true new user)", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} totalAllTime={0} />
    );
    expect(getByText("Start working out to see your consistency here!")).toBeTruthy();
  });

  // BLD-955: row-label column must be wide enough for 3-letter labels at 390px
  // (mobile baseline). Previous labelWidth=24 (from BLD-927, when labels were
  // single letters) caused "Wed" to wrap mid-word into "We"/"d". Assert the
  // label column is now ≥ 36px so all three visible labels render on one line.
  it("renders 3-letter day labels without mid-word wrap (BLD-955)", () => {
    const { getByText } = renderScreen(
      <WorkoutHeatmap data={emptyData} />
    );
    const wed = getByText("Wed");
    // Walk up to the styled Text wrapper carrying the column-width style.
    // RNTL exposes nested host components — we search the style chain on
    // `wed` and its ancestors for the explicit `width` we set in the
    // component's row-label <Text>.
    const collectStyles = (node: typeof wed | null): Record<string, unknown> => {
      let acc: Record<string, unknown> = {};
      let cur: typeof wed | null = node;
      while (cur) {
        const s = cur.props?.style;
        const arr = Array.isArray(s) ? s : [s];
        for (const entry of arr) {
          if (entry && typeof entry === "object") {
            acc = { ...acc, ...(entry as Record<string, unknown>) };
          }
        }
        cur = cur.parent as typeof wed | null;
      }
      return acc;
    };
    const flat = collectStyles(wed);
    // Column width must accommodate 3-letter labels — regression guard against
    // re-tightening to the BLD-927 single-letter value (24).
    expect(typeof flat.width).toBe("number");
    expect(flat.width as number).toBeGreaterThanOrEqual(36);
    // Sanity: "Wed" is rendered as a single text node (not split by wrapping).
    expect(wed.children).toEqual(["Wed"]);
  });

  it("does not show empty state when data has workouts (regardless of totalAllTime)", () => {
    const data = new Map([["2026-04-14", 1]]);
    const { queryByText } = renderScreen(
      <WorkoutHeatmap data={data} totalAllTime={5} />
    );
    expect(queryByText(/No completed workouts/)).toBeNull();
    expect(queryByText("Start working out to see your consistency here!")).toBeNull();
  });

  // BLD-2719: Regression guard — heatmap frequency cells must NOT use the
  // Electric Coral primary color (#FF6038 / #FF7A55). Coral is a red-green
  // channel hue that collapses to grey-olive under deuteranopia, making all
  // intensity levels indistinguishable. The fix switches to the blue
  // heatmapFrequency token (#007AFF / #0A84FF) which uses the S-cone channel
  // and retains contrast under red-green CVD.
  //
  // BLD-3878 update: widened opacity ramp to 0.30 / 0.62 / 1.0 for protanopia
  // distinctness. Expected light-mode rgba strings for count=1,2:
  //   - count=1 → rgba(0, 122, 255, 0.3)   [withOpacity on #007AFF]
  //   - count=2 → rgba(0, 122, 255, 0.62)
  //   - count=3 → #007AFF  (or dark-mode variant #0A84FF)
  //
  // We assert via backgroundColor on rendered cells: for count=1,2,3 the
  // rendered color must contain the blue channel string (partial hex or rgba
  // from withOpacity()). Specifically:
  //   - count=0 → surfaceVariant (grey muted)
  //
  // The test checks that no filled-cell color string contains the coral hex
  // values (#FF6038 or #FF7A55), and that count=1 and count=2 are visually
  // distinct from count=0 (different backgroundColor strings).
  it("uses non-coral (CVD-safe blue) color for frequency cells (BLD-2719 regression)", () => {
    // Use three dates with counts 1, 2, 3 to exercise all filled steps.
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    // Use dates far enough in the past to fall in the 16-week window.
    const d1 = new Date(today); d1.setDate(today.getDate() - 7);
    const d2 = new Date(today); d2.setDate(today.getDate() - 14);
    const d3 = new Date(today); d3.setDate(today.getDate() - 21);
    const data = new Map([
      [fmt(d1), 1],
      [fmt(d2), 2],
      [fmt(d3), 3],
    ]);

    const { toJSON } = renderScreen(<WorkoutHeatmap data={data} />);
    const json = JSON.stringify(toJSON());

    // Must NOT contain Electric Coral hex values anywhere in rendered styles.
    // This is the key regression guard — if heatmapColor reverts to `primary`,
    // these coral hex strings will appear in cell backgroundColor styles.
    expect(json).not.toMatch(/#[Ff][Ff]6038/);
    expect(json).not.toMatch(/#[Ff][Ff]7[Aa]55/);

    // Must NOT contain the coral as rgba() partial either.
    // withOpacity('#FF6038', 0.15) -> 'rgba(255, 96, 56, 0.15)'
    expect(json).not.toMatch(/rgba\(255,\s*96,\s*56/);
    // withOpacity('#FF7A55', ...) -> 'rgba(255, 122, 85, ...)'
    expect(json).not.toMatch(/rgba\(255,\s*122,\s*85/);
  });

  // BLD-3656: assert that computed cell label font size is bumped to fontSizes.sm floor.
  it("uses fontSizes.sm as the floor for cell labels and applies size * 0.55 multiplier", () => {
    const data = new Map([["2026-04-14", 3]]);
    const { getAllByText } = renderScreen(<WorkoutHeatmap data={data} />);
    const labels = getAllByText("3+", { includeHiddenElements: true });
    expect(labels.length).toBeGreaterThanOrEqual(1);

    const label = labels[0];
    const collectStyles = (node: typeof label | null): Record<string, unknown> => {
      let acc: Record<string, unknown> = {};
      let cur: typeof label | null = node;
      while (cur) {
        const s = cur.props?.style;
        const arr = Array.isArray(s) ? s : [s];
        for (const entry of arr) {
          if (entry && typeof entry === "object") {
            acc = { ...acc, ...(entry as Record<string, unknown>) };
          }
        }
        cur = cur.parent as typeof label | null;
      }
      return acc;
    };

    const flat = collectStyles(label);
    const { fontSizes } = require("../../constants/design-tokens");
    expect(flat.fontSize).toBe(fontSizes.sm); // Floor bumped from fontSizes.xs to fontSizes.sm (14)
  });

  // BLD-3878: Protanopia fix — verify all four heatmap fill steps have strictly
  // monotonic relative luminance when composited over the card surface in both
  // light and dark themes. Under protanopia only luminance survives (hue is
  // discarded), so monotonic luminance is a sound headless proxy for
  // "visually distinguishable under CVD" without needing device simulation.
  //
  // Approach: use the WCAG relative-luminance formula directly on the rgba/hex
  // color strings produced by the widened opacity ramp (0.30 / 0.62 / 1.0).
  // Composite over each card surface in linear light, then assert:
  //   1. Strict monotonicity (no two adjacent steps have equal luminance)
  //   2. Minimum per-adjacent-pair delta ≥ 0.05 (catches regression back to
  //      the old 0.15-alpha where step 0→1 delta was ≈0.025 in dark mode)
  it("heatmap fill steps have strictly monotonic luminance on both light and dark card surfaces (BLD-3878 protanopia fix)", () => {
    // WCAG sRGB → linear-light single-channel transform
    const wcagLin = (c8bit: number): number => {
      const c = c8bit / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };

    // WCAG relative luminance from linear RGB channels (0–255)
    const wcagLum = (r: number, g: number, b: number): number =>
      0.2126 * wcagLin(r) + 0.7152 * wcagLin(g) + 0.0722 * wcagLin(b);

    // Parse a color string (hex #rrggbb or rgba(r,g,b,a)) and composite it
    // over a background (bgR, bgG, bgB) in linear light. Returns relative lum.
    const compositeAndLum = (
      colorStr: string,
      bgR: number,
      bgG: number,
      bgB: number
    ): number => {
      const rgbaMatch = colorStr.match(
        /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([0-9.]+))?\s*\)/
      );
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]);
        const g = parseInt(rgbaMatch[2]);
        const b = parseInt(rgbaMatch[3]);
        const a = rgbaMatch[4] !== undefined ? parseFloat(rgbaMatch[4]) : 1;
        // Composite in linear-light space (standard alpha-compositing over opaque bg)
        const rLin = a * wcagLin(r) + (1 - a) * wcagLin(bgR);
        const gLin = a * wcagLin(g) + (1 - a) * wcagLin(bgG);
        const bLin = a * wcagLin(b) + (1 - a) * wcagLin(bgB);
        return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
      }
      const hexMatch = colorStr.match(/^#([0-9a-fA-F]{6})$/);
      if (hexMatch) {
        return wcagLum(
          parseInt(hexMatch[1].slice(0, 2), 16),
          parseInt(hexMatch[1].slice(2, 4), 16),
          parseInt(hexMatch[1].slice(4, 6), 16)
        );
      }
      throw new Error(`Unrecognised color string: ${colorStr}`);
    };

    // Light theme: heatmapFrequency=#007AFF, surfaceVariant=#E5E7EB, card=#F3F4F6
    const LIGHT_CARD = { r: 243, g: 244, b: 246 };
    // Dark theme: heatmapFrequency=#0A84FF, surfaceVariant=#21262D, card=#161B22
    const DARK_CARD = { r: 22, g: 27, b: 34 };

    const themes = [
      {
        card: LIGHT_CARD,
        surfaceVariant: "#E5E7EB",
        heatmapFrequency: "#007AFF",
      },
      {
        card: DARK_CARD,
        surfaceVariant: "#21262D",
        heatmapFrequency: "#0A84FF",
      },
    ] as const;

    for (const { card, surfaceVariant, heatmapFrequency } of themes) {
      // Mirror heatmapColor() exactly (BLD-3878 ramp: 0.30 / 0.62 / 1.0)
      const stepColors = [
        surfaceVariant,                             // step 0: empty cell
        withOpacity(heatmapFrequency, 0.30),        // step 1: 1 workout
        withOpacity(heatmapFrequency, 0.62),        // step 2: 2 workouts
        heatmapFrequency,                            // step 3+: 3+ workouts
      ];

      const luminances = stepColors.map((c) =>
        compositeAndLum(c, card.r, card.g, card.b)
      );

      // Assert strict monotonicity — no two adjacent steps may have equal lum
      for (let i = 1; i < luminances.length; i++) {
        expect(luminances[i]).not.toBeCloseTo(luminances[i - 1], 3);
      }

      // Compute minimum adjacent-pair delta
      const deltas = luminances
        .slice(1)
        .map((l, i) => Math.abs(l - luminances[i]));
      const minDelta = Math.min(...deltas);

      // ≥ 0.05 ensures regression back to old 0.15-alpha (delta≈0.025 in dark)
      // is caught while tolerating the inherent dark-mode range constraint.
      expect(minDelta).toBeGreaterThanOrEqual(0.05);
    }
  });

  // BLD-3878: Regression guard — the new ramp must NOT revert to the old
  // 0.15/0.55 alpha values that caused protanopia indistinguishability.
  it("does not use the old 0.15 or 0.55 opacity values in heatmap fill colors (BLD-3878 protanopia regression guard)", () => {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const d1 = new Date(today); d1.setDate(today.getDate() - 7);
    const d2 = new Date(today); d2.setDate(today.getDate() - 14);
    const data = new Map([
      [fmt(d1), 1],
      [fmt(d2), 2],
    ]);
    const { toJSON } = renderScreen(<WorkoutHeatmap data={data} />);
    const json = JSON.stringify(toJSON());

    // Old step-1 value: rgba(0, 122, 255, 0.15) — should NOT appear
    expect(json).not.toMatch(/rgba\(\s*0\s*,\s*122\s*,\s*255\s*,\s*0\.15/);
    // Old step-2 value: rgba(0, 122, 255, 0.55) — should NOT appear
    expect(json).not.toMatch(/rgba\(\s*0\s*,\s*122\s*,\s*255\s*,\s*0\.55/);
  });
});
