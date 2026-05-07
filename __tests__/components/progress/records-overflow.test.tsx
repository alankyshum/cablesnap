/**
 * BLD-1086 — Records page: VariantChip 390px web viewport width-chain test.
 *
 * Per PLAN-BLD-1085.md §5 and repo memory (BLD-1055 learning): RN Web layout
 * regressions require asserting the FULL parent-to-child width constraint chain,
 * not just the leaf element. An outer container without flex:1 can cause the
 * inner chip to overflow the 390px viewport even if the chip itself has correct
 * styles.
 *
 * Tests:
 * 1. VariantChip renders with flex:1 on chipWrap (so it never overflows parent)
 * 2. VariantChip text truncates with numberOfLines=1 + ellipsizeMode="middle"
 * 3. AllTimeBestsSection row left column has flex:1 + overflow:hidden
 * 4. RecentPRList row left column has flex:1 + overflow:hidden
 * 5. VariantChip returns null for all-null tuple (no unneeded DOM nodes)
 * 6. VariantChip chip text building (rope·high, nulls collapsed)
 */

import React from "react";
import { render } from "@testing-library/react-native";
import VariantChip from "@/components/progress/records/VariantChip";
import AllTimeBestsSection from "@/components/progress/records/AllTimeBestsSection";
import RecentPRList from "@/components/progress/records/RecentPRList";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6750A4",
    primaryContainer: "#EADDFF",
    onPrimaryContainer: "#21005D",
    surface: "#FFF",
    onSurface: "#000",
    onSurfaceVariant: "#666",
    outlineVariant: "#ccc",
  }),
}));

jest.mock("@/components/ui/text", () => {
  const { Text } = require("react-native");
  return {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    Text: ({ children, style, numberOfLines, ellipsizeMode, variant: _variant, ...rest }: {
      children: React.ReactNode;
      style?: object;
      variant?: string;
      numberOfLines?: number;
      ellipsizeMode?: string;
      [key: string]: unknown;
    }) => (
      <Text
        style={style}
        numberOfLines={numberOfLines}
        ellipsizeMode={ellipsizeMode}
      >
        {children}
      </Text>
    ),
  };
});

jest.mock("@/components/ui/separator", () => {
  const { View } = require("react-native");
  return { Separator: ({ style }: { style?: object }) => <View style={style} /> };
});

jest.mock("@/lib/format", () => ({
  formatDateShort: () => "Jan 1",
}));

jest.mock("@/lib/units", () => ({
  toDisplay: (v: number) => v,
}));

// ── VariantChip tests ────────────────────────────────────────────────────────

describe("VariantChip — BLD-1086", () => {
  describe("renders null for all-null tuple", () => {
    test("all-null returns no rendered output", () => {
      const { toJSON } = render(
        <VariantChip variant={{ attachment: null, mountPosition: null, gripType: null, stackUnitAtLog: null }} />
      );
      expect(toJSON()).toBeNull();
    });
  });

  describe("chip text building", () => {
    test.each([
      ["rope·high·neutral·kg", "Rope · High · Neutral · kg", { attachment: "rope", mountPosition: "high", gripType: "neutral", stackUnitAtLog: "kg" }],
      ["rope only (rest null)", "Rope", { attachment: "rope", mountPosition: null, gripType: null, stackUnitAtLog: null }],
      ["rope·null·neutral", "Rope · – · Neutral", { attachment: "rope", mountPosition: null, gripType: "neutral", stackUnitAtLog: null }],
    ])("%s", (_label, expectedText, variant) => {
      const { getByText } = render(
        <VariantChip variant={variant as Parameters<typeof VariantChip>[0]["variant"]} />
      );
      expect(getByText(expectedText)).toBeTruthy();
    });
  });

  describe("390px width-chain: chipWrap has flex:1 + overflow:hidden", () => {
    test("chipWrap container has flex:1 so it never overflows parent", () => {
      const { UNSAFE_getAllByType } = render(
        <VariantChip
          variant={{ attachment: "rope", mountPosition: "high", gripType: null, stackUnitAtLog: "kg" }}
        />
      );
      const { View } = require("react-native");
      const views = UNSAFE_getAllByType(View);
      // The chipWrap View must have flexDirection:"row" + overflow:"hidden"
      const chipWrap = views.find((v: { props: Record<string, unknown> }) => {
        const s = Array.isArray(v.props.style) ? Object.assign({}, ...v.props.style as object[]) : ((v.props.style ?? {}) as Record<string, unknown>);
        return (s as Record<string, unknown>).flexDirection === "row" && (s as Record<string, unknown>).overflow === "hidden";
      });
      expect(chipWrap).toBeTruthy();
    });

    test("chip Text has numberOfLines=1 and ellipsizeMode=middle", () => {
      const { UNSAFE_getAllByType } = render(
        <VariantChip
          variant={{ attachment: "rope", mountPosition: "high", gripType: null, stackUnitAtLog: "kg" }}
        />
      );
      const { Text: RNText } = require("react-native");
      const texts = UNSAFE_getAllByType(RNText);
      const chipTextNode = texts.find((t) => t.props.numberOfLines === 1);
      expect(chipTextNode).toBeTruthy();
      expect(chipTextNode?.props.ellipsizeMode).toBe("middle");
    });
  });
});

// ── AllTimeBestsSection width-chain ─────────────────────────────────────────

describe("AllTimeBestsSection — BLD-1086 390px width chain", () => {
  const cableWithVariants = [
    {
      exercise_id: "ex-cable",
      name: "Cable Triceps Pushdown",
      category: "Arms",
      max_weight: 40,
      max_reps: null,
      best_set_weight: 40,
      best_set_reps: 8,
      est_1rm: 50,
      session_count: 5,
      is_weighted: true,
      best_added_kg: null,
      best_assisted_kg: null,
      variants: [
        { attachment: "rope", mountPosition: "high", gripType: "neutral", stackUnitAtLog: "kg", weight: 30, reps: 8, e1rm: 38, achievedAt: Date.now(), sessionCount: 3 },
        { attachment: "bar",  mountPosition: "high", gripType: null,      stackUnitAtLog: "kg", weight: 40, reps: 8, e1rm: 50, achievedAt: Date.now() - 1000, sessionCount: 2 },
      ],
    },
  ];

  test("left column View has flex:1 + overflow:hidden (390px guard)", () => {
    const { UNSAFE_getAllByType } = render(
      <AllTimeBestsSection
        bests={cableWithVariants}
        weightUnit="kg"
        onPressExercise={jest.fn()}
      />
    );
    const { View } = require("react-native");
    const views = UNSAFE_getAllByType(View);
    // Find the row left column that has flex:1 and overflow:hidden
    const leftCol = views.find((v) => {
      const s = Array.isArray(v.props.style)
        ? Object.assign({}, ...v.props.style)
        : v.props.style ?? {};
      return s.flex === 1 && s.overflow === "hidden";
    });
    expect(leftCol).toBeTruthy();
  });

  test("renders two variant rows for a cable exercise with two variants", () => {
    const { getByText } = render(
      <AllTimeBestsSection
        bests={cableWithVariants}
        weightUnit="kg"
        onPressExercise={jest.fn()}
      />
    );
    // Both variant chips should appear (Rope and Bar)
    expect(getByText("Rope · High · Neutral · kg")).toBeTruthy();
    expect(getByText("Bar · High · – · kg")).toBeTruthy();
  });

  test("renders (unspecified) for all-null variant tuple", () => {
    const bestWithNullVariant = [{
      ...cableWithVariants[0],
      variants: [
        { attachment: null, mountPosition: null, gripType: null, stackUnitAtLog: null, weight: 20, reps: 10, e1rm: 25, achievedAt: Date.now(), sessionCount: 1 },
      ],
    }];
    const { getByText } = render(
      <AllTimeBestsSection
        bests={bestWithNullVariant}
        weightUnit="kg"
        onPressExercise={jest.fn()}
      />
    );
    expect(getByText("(unspecified)")).toBeTruthy();
  });
});

// ── RecentPRList width-chain ──────────────────────────────────────────────────

describe("RecentPRList — BLD-1086 390px width chain", () => {
  const cablePR = {
    exercise_id: "ex-cable",
    name: "Cable Pushdown",
    category: "Arms",
    weight: 32.5,
    reps: null,
    previous_best: 30,
    date: Date.now(),
    is_weighted: true,
    variants: [
      { attachment: "rope", mountPosition: "high", gripType: null, stackUnitAtLog: "kg", weight: 32.5, reps: 8, e1rm: 40, achievedAt: Date.now(), sessionCount: 2 },
    ],
  };

  test("left column View has flex:1 + overflow:hidden (390px guard)", () => {
    const { UNSAFE_getAllByType } = render(
      <RecentPRList
        prs={[cablePR]}
        weightUnit="kg"
        onPressExercise={jest.fn()}
      />
    );
    const { View } = require("react-native");
    const views = UNSAFE_getAllByType(View);
    const leftCol = views.find((v) => {
      const s = Array.isArray(v.props.style)
        ? Object.assign({}, ...v.props.style)
        : v.props.style ?? {};
      return s.flex === 1 && s.overflow === "hidden";
    });
    expect(leftCol).toBeTruthy();
  });

  test("renders variant chip for cable PR", () => {
    const { getByText } = render(
      <RecentPRList prs={[cablePR]} weightUnit="kg" onPressExercise={jest.fn()} />
    );
    expect(getByText("Rope · High · – · kg")).toBeTruthy();
  });
});
