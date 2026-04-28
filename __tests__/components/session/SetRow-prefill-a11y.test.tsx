/**
 * BLD-682 AC11 — Accessibility label MUST read the *displayed* value,
 * not the underlying nullable `set.weight`. Under display-only
 * hydration, a pristine row shows the picker at the prefillCandidate
 * value while `set.weight === null`. If the label were keyed off
 * `set.weight ?? 0`, screen readers would announce "0 kilograms"
 * while the sighted user sees `100`.
 *
 * 3-case matrix from the plan:
 *   1. Pristine + prefillCandidate present → label reads candidate value.
 *   2. Persisted set (set.weight non-null) → label reads set.weight (NOT candidate).
 *   3. No data anywhere → label reads "0".
 *
 * Plus AC14: lb units render the unit word in the label ("pounds").
 */
import React from "react";
import { render } from "@testing-library/react-native";

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("@/lib/audio", () => ({
  play: jest.fn().mockResolvedValue(undefined),
  setEnabled: jest.fn(),
  preload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/db", () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#6200ee", primaryContainer: "#e8def8", onPrimary: "#ffffff",
    onSurface: "#1c1b1f", onSurfaceVariant: "#49454f",
    surface: "#fffbfe", surfaceVariant: "#e7e0ec",
    tertiaryContainer: "#f8e1e7", onTertiaryContainer: "#31101d",
    errorContainer: "#ffdad6", onErrorContainer: "#410002",
    error: "#b3261e", outline: "#79747e",
    background: "#fffbfe", onError: "#ffffff",
  }),
}));

jest.mock("../../../components/WeightPicker", () => {
  const { Text } = require("react-native");
  return {
    __esModule: true,
    default: ({
      value,
      accessibilityLabel,
      testID,
    }: { value: number | null; accessibilityLabel?: string; testID?: string }) => (
      <Text testID={testID} accessibilityLabel={accessibilityLabel}>
        {String(value ?? "null")}
      </Text>
    ),
  };
});

jest.mock("../../../components/session/PlateHint", () => ({ PlateHint: () => null }));

jest.mock("../../../components/SwipeToDelete", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { SetRow, type SetRowProps } from "../../../components/session/SetRow";
import type { SetWithMeta } from "../../../components/session/types";

function makeSet(overrides: Partial<SetWithMeta> = {}): SetWithMeta {
  return {
    id: "s1",
    workout_session_id: "sess",
    exercise_id: 1,
    set_number: 1,
    round: null,
    weight: null,
    reps: null,
    rpe: null,
    notes: null,
    completed: false,
    set_type: "normal",
    duration_seconds: null,
    created_at: Date.now(),
    previous: "",
    is_pr: false,
    prefillCandidate: null,
    ...overrides,
  } as unknown as SetWithMeta;
}

function baseProps(set: SetWithMeta): SetRowProps {
  const noop = jest.fn();
  return {
    set,
    step: 2.5,
    unit: "kg",
    trackingMode: "reps",
    equipment: "cable" as unknown as SetRowProps["equipment"],
    onUpdate: jest.fn(),
    onCheck: jest.fn(),
    onDelete: jest.fn(),
    onCycleSetType: noop,
    onLongPressSetType: noop,
  };
}

describe("BLD-682 AC11: a11y label reads displayed value (not nullable set.weight)", () => {
  it("pristine row + prefillCandidate → weight label announces candidate value, not 0", () => {
    const set = makeSet({
      weight: null,
      reps: null,
      prefillCandidate: { weight: 100, reps: 8, duration_seconds: null },
    });
    const { getAllByLabelText } = render(<SetRow {...baseProps(set)} />);
    expect(getAllByLabelText("Set 1 weight, 100 kilograms").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Set 1 reps, 8").length).toBeGreaterThan(0);
  });

  it("persisted row → weight label announces set.weight, NOT prefillCandidate", () => {
    const set = makeSet({
      weight: 90,
      reps: 5,
      // Even with a candidate present, the persisted value wins.
      prefillCandidate: { weight: 100, reps: 8, duration_seconds: null },
    });
    const { getAllByLabelText, queryByLabelText } = render(<SetRow {...baseProps(set)} />);
    expect(getAllByLabelText("Set 1 weight, 90 kilograms").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Set 1 reps, 5").length).toBeGreaterThan(0);
    expect(queryByLabelText("Set 1 weight, 100 kilograms")).toBeNull();
  });

  it("no data anywhere → label reads 0 (no crash, no NaN, no 'null')", () => {
    const set = makeSet({ weight: null, reps: null, prefillCandidate: null });
    const { getAllByLabelText } = render(<SetRow {...baseProps(set)} />);
    expect(getAllByLabelText("Set 1 weight, 0 kilograms").length).toBeGreaterThan(0);
    expect(getAllByLabelText("Set 1 reps, 0").length).toBeGreaterThan(0);
  });

  // BLD-704 — AC14 reframed: pin the SetRow no-conversion / pass-through
  // contract. SetRow is a display-only renderer; the `unit` prop changes
  // ONLY the unit *word* in the accessibilityLabel, never the *number*.
  //
  // Verified at the time of writing: no kg↔lb math runs at this seam.
  // - components/session/SetRow.tsx:177-181 (displayedWeight, a11y label)
  // - components/session/ExerciseGroupCard.tsx (parent — passes set.weight straight through)
  // - hooks/useSessionData.ts:149 (reads s.weight from DB, no transform)
  // - hooks/resolvePrefillCandidate.ts (pure shape helper, no conversion)
  // The only production callers of kgToLb / lbToKg / convertWeight are
  // hooks/useBodyProfile.ts (body weight, not set weight), lib/strava.ts,
  // and lib/plates.ts — none touch the session SetRow render path.
  //
  // Architectural decision (BLD-704, CEO + techlead verdict):
  //   - SetRow is a pure display layer. Storage units in → labelled units out.
  //   - If conversion is ever required, it MUST be introduced UPSTREAM —
  //     either at the data layer or in useSessionData — NOT inside SetRow.
  //     The Fix Placement Framework (single source of truth: storage units)
  //     forbids per-component conversion that would silently desync display
  //     and persistence.
  //
  // Why these tests exist:
  //   - Original PR #402 AC14 only asserted the unit *word* swap
  //     ("kilograms" → "pounds"). That's a weak invariant — it would still
  //     pass even if a future commit accidentally introduced kg→lb math at
  //     the SetRow seam (the displayed number would change, but the test
  //     wouldn't notice). These tests pin the *number* too, so any
  //     accidental conversion at this layer fails loudly.
  //
  // If you are reading this comment because a test below is failing after
  // you added conversion logic somewhere, STOP and consider:
  //   1. Is the conversion at the right layer? (Almost certainly NOT
  //      SetRow — see useSessionData / data layer per the framework.)
  //   2. Did you also update the persisted storage unit, or only the
  //      display? Silent display-only conversion creates a unit-system
  //      mismatch the moment the user switches preferences.
  //   3. If the answer is genuinely "yes, conversion at SetRow is correct
  //      now", update these tests AND post a comment on BLD-704 (or open
  //      a fresh planning issue) explaining the architectural shift.
  describe("AC14: SetRow is a pass-through display — `unit` prop swaps the WORD only", () => {
    it("set.weight=45 + unit='lb' → label reads '45 pounds' (NOT silently converted to 99.2)", () => {
      const set = makeSet({ weight: 45, reps: 8 });
      const props = { ...baseProps(set), unit: "lb" as const };
      const { getAllByLabelText, queryAllByLabelText } = render(<SetRow {...props} />);
      // Substring matching — resilient to "Set 1 …" prefix changes — but
      // anchored on the exact number `45` and the unit word `pounds`.
      const matches = queryAllByLabelText(/(?:^|[^\d.])45(?:[^\d.]|$).*\bpounds\b/);
      expect(matches.length).toBeGreaterThan(0);
      // Exact-string sanity check against the current label format.
      expect(getAllByLabelText("Set 1 weight, 45 pounds").length).toBeGreaterThan(0);
      // Defensive: no rounded-conversion result may appear under any unit.
      // 45 kg → 99.2 lb under kgToLb. If any of these appear, conversion
      // has leaked into SetRow and the architectural contract is broken.
      expect(queryAllByLabelText(/\b99\b.*\bpounds\b/).length).toBe(0);
      expect(queryAllByLabelText(/\b99\.2\b.*\bpounds\b/).length).toBe(0);
      expect(queryAllByLabelText(/\b100\b.*\bpounds\b/).length).toBe(0);
    });

    it("sibling: set.weight=45 + unit='kg' → label reads '45 kilograms' (same number, different word)", () => {
      const set = makeSet({ weight: 45, reps: 8 });
      const props = { ...baseProps(set), unit: "kg" as const };
      const { getAllByLabelText, queryAllByLabelText } = render(<SetRow {...props} />);
      const matches = queryAllByLabelText(/(?:^|[^\d.])45(?:[^\d.]|$).*\bkilograms\b/);
      expect(matches.length).toBeGreaterThan(0);
      expect(getAllByLabelText("Set 1 weight, 45 kilograms").length).toBeGreaterThan(0);
    });

    it("prefillCandidate path: candidate.weight=45 + unit='lb' → label reads '45 pounds' (no conversion of candidate either)", () => {
      // Pristine row — prefillCandidate provides the displayed value.
      // The pass-through contract MUST hold for the candidate path too;
      // resolvePrefillCandidate is a pure shape helper with no conversion.
      const set = makeSet({
        weight: null,
        prefillCandidate: { weight: 45, reps: 8, duration_seconds: null },
      });
      const props = { ...baseProps(set), unit: "lb" as const };
      const { getAllByLabelText, queryAllByLabelText } = render(<SetRow {...props} />);
      expect(queryAllByLabelText(/(?:^|[^\d.])45(?:[^\d.]|$).*\bpounds\b/).length).toBeGreaterThan(0);
      expect(getAllByLabelText("Set 1 weight, 45 pounds").length).toBeGreaterThan(0);
    });
  });

  it("AC4: duration mode label reads displayed duration, not nullable set.duration_seconds", () => {
    const set = makeSet({
      duration_seconds: null,
      prefillCandidate: { weight: 0, reps: null, duration_seconds: 60 },
    });
    const props = { ...baseProps(set), trackingMode: "duration" as const };
    const { getAllByLabelText } = render(<SetRow {...props} />);
    expect(getAllByLabelText("Set 1 duration, 60 seconds").length).toBeGreaterThan(0);
  });
});
