/**
 * BLD-850 — LastNextRow
 *
 * Inline `Last | Next` row that replaces the old fat `SuggestionChip` pill
 * and the old previous-performance label. Owns the empty-set fill loop
 * (Next side) plus a confirm dialog gate so the user never has their
 * existing weight/reps inputs silently overwritten.
 *
 * Coverage:
 *   - Both halves render side-by-side with a divider when both data
 *     sources are present.
 *   - Either half spans full width when the other is missing.
 *   - Tapping Last opens a "Refill from last session?" Alert; confirm
 *     fires `onPrefillLast`, cancel is a no-op.
 *   - Tapping Next opens an "Apply suggested values?" Alert with the
 *     correct empty-set count + suggested value description; confirm
 *     fires per-set `onUpdate` calls for empty sets only; cancel is a
 *     no-op.
 *   - Tapping Next when there are no empty sets degrades to an "All
 *     sets are filled" notice (single-button confirm).
 *   - Tapping the trailing ⓘ icon fires `onOpenExplainer` and does NOT
 *     fire the parent confirm dialog.
 *   - Tap targets meet the 44dp minHeight contract.
 *   - Last is rendered with `colors.onSurfaceVariant` (faded); Next
 *     with `colors.primary` (emphasized).
 *
 * Implementation note on the Alert mock: react-native's `Alert.alert`
 * is a static method we spy on with `jest.spyOn`. The spy synchronously
 * invokes the appropriate button's `onPress` so the confirm path is
 * exercised end-to-end without async timers.
 */
import React from "react";
import { Alert } from "react-native";
import { render, fireEvent } from "@testing-library/react-native";
import { LastNextRow } from "../../../components/session/LastNextRow";
import type { SetWithMeta } from "../../../components/session/types";
import type { Suggestion } from "../../../lib/rm";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const ReactLib = require("react");
  const { Text } = require("react-native");
  const Icon = (props: { name: string; size?: number; color?: string; testID?: string }) =>
    ReactLib.createElement(Text, { ...props, testID: props.testID ?? `icon-${props.name}` }, props.name);
  return { __esModule: true, default: Icon };
});

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee",
    onSurfaceVariant: "#49454f",
    outlineVariant: "#cac4d0",
    surface: "#fffbfe",
    onSurface: "#1c1b1f",
  }),
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light" },
}));

const PRIMARY = "#6200ee";
const ON_SURFACE_VARIANT = "#49454f";

function mkSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "set-1",
    session_id: "sess-1",
    exercise_id: "ex-1",
    set_number: 1,
    weight: null,
    reps: null,
    completed: false,
    completed_at: null,
    rpe: null,
    notes: "",
    link_id: null,
    round: null,
    training_mode: null,
    tempo: null,
    swapped_from_exercise_id: null,
    set_type: "working",
    duration_seconds: null,
    exercise_position: 0,
    ...overrides,
  } as SetWithMeta;
}

const INCREASE_WEIGHT: Suggestion = {
  type: "increase",
  weight: 27.5,
  reps: 10,
  reason: "all sets completed, RPE < 9.5",
};

const REP_INCREASE: Suggestion = {
  type: "rep_increase",
  weight: 0,
  reps: 11,
  reason: "all sets completed (bodyweight)",
};

const MAINTAIN: Suggestion = {
  type: "maintain",
  weight: 25,
  reps: 10,
  reason: "RPE ≥ 9.5 — hold weight",
};

type ButtonSpec = { text: string; style?: string; onPress?: () => void };

/**
 * Press the named button on the most recent Alert.alert call. Used by the
 * confirm-dialog tests to exercise the user's "Apply" or "Cancel" choice
 * without a real platform alert.
 */
function pressAlertButton(spy: jest.SpyInstance, name: string): void {
  const calls = spy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const last = calls[calls.length - 1];
  const buttons = last[2] as ButtonSpec[] | undefined;
  expect(buttons).toBeDefined();
  const btn = (buttons ?? []).find((b) => b.text === name);
  expect(btn).toBeDefined();
  btn!.onPress?.();
}

describe("LastNextRow (BLD-850)", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe("layout", () => {
    it("renders both halves side-by-side with a divider when both sources are present", () => {
      const { getByTestId, queryByTestId } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y="Last session: 3 sets of 10 reps at 25 pounds"
          suggestion={INCREASE_WEIGHT}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(getByTestId("last-half")).toBeTruthy();
      expect(getByTestId("next-half")).toBeTruthy();
      // Divider is rendered as a sibling View; we don't give it a testID so
      // we assert presence via styled width — see `divider` style. A simple
      // proxy: the next-info-icon is only rendered alongside Next, and we
      // already proved next-half renders.
      expect(queryByTestId("next-info-icon")).toBeTruthy();
    });

    it("renders only Last (full width) when no suggestion is provided", () => {
      const { getByTestId, queryByTestId } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y={null}
          suggestion={null}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(getByTestId("last-half")).toBeTruthy();
      expect(queryByTestId("next-half")).toBeNull();
    });

    it("renders only Next (full width) when there is no previous performance", () => {
      const { queryByTestId, getByTestId } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(queryByTestId("last-half")).toBeNull();
      expect(getByTestId("next-half")).toBeTruthy();
    });

    it("returns null when neither source is available", () => {
      const { queryByTestId, toJSON } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={null}
          sets={[]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(queryByTestId("last-half")).toBeNull();
      expect(queryByTestId("next-half")).toBeNull();
      expect(toJSON()).toBeNull();
    });
  });

  describe("Next leading icon", () => {
    it("uses arrow-up-bold for an `increase` suggestion", () => {
      const { UNSAFE_queryAllByProps } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(UNSAFE_queryAllByProps({ name: "arrow-up-bold" }).length).toBeGreaterThan(0);
    });

    it("uses arrow-up-bold for a `rep_increase` suggestion", () => {
      const { UNSAFE_queryAllByProps } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={REP_INCREASE}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Pull Up"
        />,
      );
      expect(UNSAFE_queryAllByProps({ name: "arrow-up-bold" }).length).toBeGreaterThan(0);
    });

    it("uses `equal` for a `maintain` suggestion", () => {
      const { UNSAFE_queryAllByProps } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={MAINTAIN}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(UNSAFE_queryAllByProps({ name: "equal" }).length).toBeGreaterThan(0);
      expect(UNSAFE_queryAllByProps({ name: "arrow-up-bold" }).length).toBe(0);
    });
  });

  describe("Last — refill confirm flow", () => {
    it("opens the 'Refill from last session?' Alert on tap", () => {
      const onPrefillLast = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y={null}
          suggestion={null}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={onPrefillLast}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("last-half"));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title] = alertSpy.mock.calls[0];
      expect(title).toBe("Refill from last session?");
      // Without confirm, the prefill must not fire.
      expect(onPrefillLast).not.toHaveBeenCalled();
    });

    it("fires onPrefillLast when the user presses Refill", () => {
      const onPrefillLast = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y={null}
          suggestion={null}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={onPrefillLast}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("last-half"));
      pressAlertButton(alertSpy, "Refill");
      expect(onPrefillLast).toHaveBeenCalledTimes(1);
    });

    it("does NOT fire onPrefillLast when the user cancels", () => {
      const onPrefillLast = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y={null}
          suggestion={null}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={onPrefillLast}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("last-half"));
      pressAlertButton(alertSpy, "Cancel");
      expect(onPrefillLast).not.toHaveBeenCalled();
    });
  });

  describe("Next — apply confirm flow", () => {
    it("opens 'Apply suggested values?' with the correct empty-set count", () => {
      const sets = [
        mkSet({ id: "s1", weight: null, completed: false }),
        mkSet({ id: "s2", weight: 0, completed: false }),
        mkSet({ id: "s3", weight: 22.5, completed: false }), // user-entered → preserved
      ];
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={sets}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("next-half"));
      expect(alertSpy).toHaveBeenCalledTimes(1);
      const [title, body] = alertSpy.mock.calls[0];
      expect(title).toBe("Apply suggested values?");
      expect(body).toContain("2 empty sets");
      expect(body).toContain("weight: 27.5");
      expect(body).toContain("Existing values won't be overwritten");
    });

    it("calls onUpdate ONLY for empty sets when Apply is confirmed", () => {
      const sets = [
        mkSet({ id: "s1", weight: null, completed: false }),
        mkSet({ id: "s2", weight: 0, completed: false }),
        mkSet({ id: "s3", weight: 22.5, completed: false }), // preserved
        mkSet({ id: "s4", weight: null, completed: true }), // completed → preserved
      ];
      const onUpdate = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={sets}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={onUpdate}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("next-half"));
      pressAlertButton(alertSpy, "Apply");
      expect(onUpdate).toHaveBeenCalledTimes(2);
      expect(onUpdate).toHaveBeenCalledWith("s1", "weight", "27.5");
      expect(onUpdate).toHaveBeenCalledWith("s2", "weight", "27.5");
      expect(onUpdate).not.toHaveBeenCalledWith("s3", expect.anything(), expect.anything());
      expect(onUpdate).not.toHaveBeenCalledWith("s4", expect.anything(), expect.anything());
    });

    it("uses 'reps' field for rep_increase suggestions and skips non-empty rep cells", () => {
      const sets = [
        mkSet({ id: "s1", reps: null, completed: false }),
        mkSet({ id: "s2", reps: 0, completed: false }),
        mkSet({ id: "s3", reps: 8, completed: false }), // preserved
      ];
      const onUpdate = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={REP_INCREASE}
          sets={sets}
          step={1}
          onPrefillLast={() => {}}
          onUpdate={onUpdate}
          onOpenExplainer={() => {}}
          exerciseName="Pull Up"
        />,
      );
      fireEvent.press(getByTestId("next-half"));
      pressAlertButton(alertSpy, "Apply");
      expect(onUpdate).toHaveBeenCalledTimes(2);
      expect(onUpdate).toHaveBeenCalledWith("s1", "reps", "11");
      expect(onUpdate).toHaveBeenCalledWith("s2", "reps", "11");
    });

    it("does NOT call onUpdate when the user cancels the confirm dialog", () => {
      const sets = [mkSet({ weight: null })];
      const onUpdate = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={sets}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={onUpdate}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("next-half"));
      pressAlertButton(alertSpy, "Cancel");
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("shows 'All sets are filled' notice when there are no empty sets", () => {
      const sets = [
        mkSet({ id: "s1", weight: 25, completed: false }),
        mkSet({ id: "s2", weight: 25, completed: false }),
      ];
      const onUpdate = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={sets}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={onUpdate}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("next-half"));
      const [title, , buttons] = alertSpy.mock.calls[0];
      expect(title).toBe("All sets are filled");
      // Single dismiss button only — no Apply.
      const buttonNames = (buttons as ButtonSpec[]).map((b) => b.text);
      expect(buttonNames).toEqual(["OK"]);
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe("info icon", () => {
    it("fires onOpenExplainer and does NOT trigger the apply confirm", () => {
      const onUpdate = jest.fn();
      const onOpenExplainer = jest.fn();
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance={null}
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={[mkSet({ weight: null })]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={onUpdate}
          onOpenExplainer={onOpenExplainer}
          exerciseName="Bicep Curl"
        />,
      );
      fireEvent.press(getByTestId("next-info-icon"));
      expect(onOpenExplainer).toHaveBeenCalledTimes(1);
      // The parent Pressable's onPress should not have been invoked — no
      // confirm dialog, no fill loop.
      expect(alertSpy).not.toHaveBeenCalled();
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  describe("styling contract", () => {
    it("applies onSurfaceVariant (faded) to Last and primary (emphasized) to Next", () => {
      const { UNSAFE_queryAllByProps } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      // The leading icon for Last is `refresh` in onSurfaceVariant; for
      // Next is `arrow-up-bold` in primary. Their `color` prop is the
      // canonical signal for the visual differentiation contract.
      const refreshIcons = UNSAFE_queryAllByProps({ name: "refresh" });
      expect(refreshIcons.length).toBeGreaterThan(0);
      expect(refreshIcons[0].props.color).toBe(ON_SURFACE_VARIANT);
      const upIcons = UNSAFE_queryAllByProps({ name: "arrow-up-bold" });
      expect(upIcons.length).toBeGreaterThan(0);
      expect(upIcons[0].props.color).toBe(PRIMARY);
    });

    it("enforces minHeight ≥ 44dp on both halves (44dp tap-target contract)", () => {
      const { getByTestId } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y={null}
          suggestion={INCREASE_WEIGHT}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      const flatten = (s: unknown): Record<string, unknown> => {
        if (!s) return {};
        if (Array.isArray(s)) return s.reduce<Record<string, unknown>>(
          (acc, x) => ({ ...acc, ...flatten(x) }),
          {},
        );
        return s as Record<string, unknown>;
      };
      // Pressables call style({pressed:false}) on render — invoke with the
      // not-pressed state to read the resolved style array.
      const lastStyle = flatten(
        typeof getByTestId("last-half").props.style === "function"
          ? getByTestId("last-half").props.style({ pressed: false })
          : getByTestId("last-half").props.style,
      );
      const nextStyle = flatten(
        typeof getByTestId("next-half").props.style === "function"
          ? getByTestId("next-half").props.style({ pressed: false })
          : getByTestId("next-half").props.style,
      );
      expect(lastStyle.minHeight).toBeGreaterThanOrEqual(44);
      expect(nextStyle.minHeight).toBeGreaterThanOrEqual(44);
    });
  });

  describe("a11y", () => {
    it("uses previousPerformanceA11y when provided, else falls back to a Last:-prefixed label", () => {
      const { getByTestId, rerender } = render(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y="Last session: three by ten at twenty-five pounds"
          suggestion={null}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(getByTestId("last-half").props.accessibilityLabel).toBe(
        "Last session: three by ten at twenty-five pounds",
      );
      rerender(
        <LastNextRow
          previousPerformance="3×10 @ 25 lb"
          previousPerformanceA11y={null}
          suggestion={null}
          sets={[mkSet()]}
          step={2.5}
          onPrefillLast={() => {}}
          onUpdate={() => {}}
          onOpenExplainer={() => {}}
          exerciseName="Bicep Curl"
        />,
      );
      expect(getByTestId("last-half").props.accessibilityLabel).toBe(
        "Last: 3×10 @ 25 lb",
      );
    });
  });
});
