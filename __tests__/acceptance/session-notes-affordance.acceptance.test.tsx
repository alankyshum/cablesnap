/**
 * BLD-2743: Session notes card visible input affordance
 *
 * Both the session summary screen (app/session/summary/[id].tsx) and
 * the session detail RatingNotesCard (components/session/detail/RatingNotesCard.tsx)
 * previously hid the notes TextInput behind a notesExpanded gate. For sessions
 * with no existing notes, the input was never mounted — only a collapsed header.
 *
 * This suite verifies the fix: the notes Input is always visible, uses the shared
 * Input component with variant="outline", and all save/counter behavior is preserved.
 */

// ── Source-contract assertions (headless, no render needed) ──────────────────

import fs from "fs";
import path from "path";

describe("Session notes input — always-visible affordance (BLD-2743) — source contracts", () => {
  const summaryPath = path.resolve(
    __dirname,
    "../../app/session/summary/[id].tsx",
  );
  const ratingNotesPath = path.resolve(
    __dirname,
    "../../components/session/detail/RatingNotesCard.tsx",
  );

  const summarySrc = fs.readFileSync(summaryPath, "utf-8");
  const ratingNotesSrc = fs.readFileSync(ratingNotesPath, "utf-8");

  describe("app/session/summary/[id].tsx", () => {
    it("does not gate the notes input behind notesExpanded", () => {
      // The old pattern: {notesExpanded && (<View>...<TextInput ... /></View>)}
      expect(summarySrc).not.toMatch(/notesExpanded\s*&&/);
    });

    it("does not use raw TextInput for session notes", () => {
      // Should have replaced raw TextInput with the shared Input component
      expect(summarySrc).not.toMatch(/<TextInput/);
    });

    it("uses shared Input with variant='outline' for session notes", () => {
      expect(summarySrc).toMatch(/variant="outline"/);
    });

    it("uses Input type='textarea' with rows={5}", () => {
      expect(summarySrc).toMatch(/type="textarea"/);
      expect(summarySrc).toMatch(/rows=\{5\}/);
    });

    it("uses placeholderTextColor from theme (AA contrast)", () => {
      expect(summarySrc).toMatch(/placeholderTextColor=\{colors\.onSurfaceVariant\}/);
    });

    it("uses text color from theme (colors.onSurface)", () => {
      expect(summarySrc).toMatch(/color:\s*colors\.onSurface/);
    });

    it("textarea minHeight is at least 140dp (≈5 lines)", () => {
      // Match minHeight inside the notesInput style specifically (not notesHeader)
      const m = summarySrc.match(/notesInput:\s*\{[^}]*minHeight:\s*(\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(140);
    });

    it("textarea fontSize is at least fontSizes.lg (18) for legibility", () => {
      const m = summarySrc.match(/notesInput:\s*\{[^}]*fontSize:\s*fontSizes\.(\w+)/);
      expect(m).not.toBeNull();
      const fontSizeMap: Record<string, number> = {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
      };
      expect(fontSizeMap[m![1]] ?? 0).toBeGreaterThanOrEqual(18);
    });

    it("uses textAlignVertical='top' so Android multiline starts top-left", () => {
      expect(summarySrc).toMatch(/textAlignVertical="top"/);
    });

    it("preserves 500-char maxLength", () => {
      expect(summarySrc).toMatch(/maxLength=\{500\}/);
    });

    it("preserves accessibilityLabel='Session notes'", () => {
      expect(summarySrc).toMatch(/accessibilityLabel="Session notes"/);
    });

    it("does not pass notesExpanded prop to SummaryHeader", () => {
      // The notesExpanded prop should have been removed from SummaryHeader
      expect(summarySrc).not.toMatch(/notesExpanded=\{/);
    });
  });

  describe("components/session/detail/RatingNotesCard.tsx", () => {
    it("does not gate the notes input behind notesExpanded", () => {
      expect(ratingNotesSrc).not.toMatch(/notesExpanded\s*&&/);
    });

    it("does not use raw TextInput for session notes", () => {
      expect(ratingNotesSrc).not.toMatch(/<TextInput/);
    });

    it("uses shared Input with variant='outline' for session notes", () => {
      expect(ratingNotesSrc).toMatch(/variant="outline"/);
    });

    it("uses Input type='textarea' with rows={5}", () => {
      expect(ratingNotesSrc).toMatch(/type="textarea"/);
      expect(ratingNotesSrc).toMatch(/rows=\{5\}/);
    });

    it("uses placeholderTextColor from theme (AA contrast)", () => {
      expect(ratingNotesSrc).toMatch(/placeholderTextColor=\{colors\.onSurfaceVariant\}/);
    });

    it("uses text color from theme (colors.onSurface)", () => {
      expect(ratingNotesSrc).toMatch(/color:\s*colors\.onSurface/);
    });

    it("textarea minHeight is at least 140dp (≈5 lines)", () => {
      // Match minHeight inside the notesInput style specifically (not notesHeader)
      const m = ratingNotesSrc.match(/notesInput:\s*\{[^}]*minHeight:\s*(\d+)/);
      expect(m).not.toBeNull();
      expect(Number(m![1])).toBeGreaterThanOrEqual(140);
    });

    it("textarea fontSize is at least fontSizes.lg (18) for legibility", () => {
      const m = ratingNotesSrc.match(/notesInput:\s*\{[^}]*fontSize:\s*fontSizes\.(\w+)/);
      expect(m).not.toBeNull();
      const fontSizeMap: Record<string, number> = {
        xs: 12,
        sm: 14,
        base: 16,
        lg: 18,
        xl: 20,
      };
      expect(fontSizeMap[m![1]] ?? 0).toBeGreaterThanOrEqual(18);
    });

    it("uses textAlignVertical='top' so Android multiline starts top-left", () => {
      expect(ratingNotesSrc).toMatch(/textAlignVertical="top"/);
    });

    it("preserves 500-char maxLength", () => {
      expect(ratingNotesSrc).toMatch(/maxLength=\{500\}/);
    });

    it("preserves accessibilityLabel='Session notes'", () => {
      expect(ratingNotesSrc).toMatch(/accessibilityLabel="Session notes"/);
    });

    it("does not have notesExpanded or onToggleNotes in the Props type", () => {
      // These props were removed in BLD-2743
      expect(ratingNotesSrc).not.toMatch(/notesExpanded\s*:/);
      expect(ratingNotesSrc).not.toMatch(/onToggleNotes\s*:/);
    });
  });

  describe("hooks/useSummaryActions.ts", () => {
    const hookSrc = fs.readFileSync(
      path.resolve(__dirname, "../../hooks/useSummaryActions.ts"),
      "utf-8",
    );

    it("does not declare notesExpanded state (removed as no longer needed)", () => {
      expect(hookSrc).not.toMatch(/notesExpanded/);
    });
  });

  describe("hooks/useSessionDetail.ts", () => {
    const hookSrc = fs.readFileSync(
      path.resolve(__dirname, "../../hooks/useSessionDetail.ts"),
      "utf-8",
    );

    it("does not declare notesExpanded state (removed as no longer needed)", () => {
      expect(hookSrc).not.toMatch(/notesExpanded/);
    });
  });
});

// ── Render-based tests ────────────────────────────────────────────────────────

jest.mock("../../lib/db", () => ({
  getSessionById: jest.fn(),
  getSessionSets: jest.fn().mockResolvedValue([]),
  getBodySettings: jest.fn().mockResolvedValue({
    weight_unit: "kg",
    measurement_unit: "cm",
    sex: "male",
    weight_goal: null,
    body_fat_goal: null,
  }),
  getSessionPRs: jest.fn().mockResolvedValue([]),
  getSessionRepPRs: jest.fn().mockResolvedValue([]),
  getSessionDurationPRs: jest.fn().mockResolvedValue([]),
  getSessionWeightIncreases: jest.fn().mockResolvedValue([]),
  getSessionComparison: jest.fn().mockResolvedValue(null),
  getSessionSetCount: jest.fn().mockResolvedValue(0),
  getExercisesByIds: jest.fn().mockResolvedValue({}),
  buildAchievementContext: jest.fn().mockResolvedValue({}),
  getEarnedAchievementIds: jest.fn().mockResolvedValue([]),
  saveEarnedAchievements: jest.fn().mockResolvedValue(undefined),
  updateSession: jest.fn().mockResolvedValue(undefined),
  getEffectivePromoCaption: jest.fn().mockResolvedValue(""),
  getShareSettings: jest.fn().mockResolvedValue({ promo_caption_enabled: 0 }),
  getSyncLogForSession: jest.fn().mockResolvedValue(null),
}));

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: "sess-completed" }),
  usePathname: () => "/session/summary/sess-completed",
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}));

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");
jest.mock("../../lib/layout", () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0 }),
}));
jest.mock("../../lib/errors", () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue("{}"),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue("https://github.com"),
}));
jest.mock("../../lib/interactions", () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning" },
}));
jest.mock("expo-file-system", () => ({ File: jest.fn(), Paths: { cache: "/cache" } }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));
jest.mock("../../lib/units", () => ({
  toDisplay: (v: number) => v,
  toKg: (v: number) => v,
  KG_TO_LB: 2.20462,
  LB_TO_KG: 0.453592,
}));
jest.mock("../../lib/useProfileGender", () => ({
  useProfileGender: () => "male",
}));
jest.mock("../../components/MuscleMap", () => {
  const React = require("react");
  return {
    MuscleMap: (props: Record<string, unknown>) =>
      React.createElement("MuscleMap", props),
  };
});

import React from "react";
import { renderScreen } from "../helpers/render";
import { resetIds } from "../helpers/factories";
import { createCompletedWorkoutFixture } from "../fixtures/completedWorkoutSummary";
import Summary from "../../app/session/summary/[id]";

const mockDb = require("../../lib/db") as Record<string, jest.Mock>;

describe("Session notes — always-visible textarea (BLD-2743) — render tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetIds();
  });

  it("renders the notes textarea immediately (no tap required) for a session with NO saved notes", async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture();
    // Ensure notes is empty/null
    const sessionWithNoNotes = { ...session, notes: null };
    mockDb.getSessionById.mockResolvedValue(sessionWithNoNotes);
    mockDb.getSessionSets.mockResolvedValue(sets);
    mockDb.getExercisesByIds.mockResolvedValue(exercises);

    const screen = renderScreen(<Summary />);

    // The notes input must be present immediately — accessibilityLabel="Session notes"
    const notesInput = await screen.findByLabelText("Session notes");
    expect(notesInput).toBeTruthy();
  });

  it("renders the notes textarea with the correct placeholder text", async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture();
    const sessionWithNoNotes = { ...session, notes: null };
    mockDb.getSessionById.mockResolvedValue(sessionWithNoNotes);
    mockDb.getSessionSets.mockResolvedValue(sets);
    mockDb.getExercisesByIds.mockResolvedValue(exercises);

    const screen = renderScreen(<Summary />);

    const notesInput = await screen.findByLabelText("Session notes");
    expect(notesInput.props.placeholder).toBe("Add notes about this workout...");
  });

  it("renders notes textarea with existing text for a session WITH saved notes (no regression)", async () => {
    const { session, exercises, sets } = createCompletedWorkoutFixture();
    const savedNotes = "Felt strong today, PR on bench!";
    const sessionWithNotes = { ...session, notes: savedNotes };
    mockDb.getSessionById.mockResolvedValue(sessionWithNotes);
    mockDb.getSessionSets.mockResolvedValue(sets);
    mockDb.getExercisesByIds.mockResolvedValue(exercises);

    const screen = renderScreen(<Summary />);

    const notesInput = await screen.findByLabelText("Session notes");
    expect(notesInput).toBeTruthy();
    expect(notesInput.props.value).toBe(savedNotes);
  });
});
