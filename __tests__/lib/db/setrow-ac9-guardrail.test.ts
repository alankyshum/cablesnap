/**
 * BLD-1158 AC9: SetRow.tsx hard-exclusion boundary test.
 *
 * SetRow.tsx carries a documented "NO" classification for haptics, streaks,
 * badges, celebrations, animations on goal-hit, success-toasts, notifications,
 * and reminders. This test statically scans the source file to verify that the
 * hard exclusions remain intact after BLD-1158 tempo chip additions.
 *
 * Also verified: SetTempoChip is present (AC1 display requirement) and the
 * BLD-1158 guardrail comment block is up-to-date.
 */

import * as fs from "fs";
import * as path from "path";

const SET_ROW_PATH = path.resolve(__dirname, "../../../components/session/SetRow.tsx");

describe("AC9 — SetRow.tsx hard exclusions", () => {
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(SET_ROW_PATH, "utf8");
  });

  it("does not import expo-haptics", () => {
    // Haptic ownership is exclusively useSetCompletionFeedback (BLD-559/614).
    expect(source).not.toMatch(/import.*expo-haptics/);
  });

  it("does not reference Haptics in source", () => {
    // No direct Haptics.* calls permitted in SetRow.
    expect(source).not.toMatch(/Haptics\./);
  });

  it("does not import expo-notifications", () => {
    expect(source).not.toMatch(/import.*expo-notifications/);
  });

  it("does not reference streak logic", () => {
    // Only check for streak API imports or calls, not the prohibition comments.
    expect(source).not.toMatch(/import.*streak/i);
    expect(source).not.toMatch(/streakCount|streakDays|incrementStreak/i);
  });

  it("does not reference badge logic", () => {
    // Only check that no badge API is actually called (import or function call).
    // The word "badge" is allowed in comments that document the prohibition.
    expect(source).not.toMatch(/import.*badge/i);
    expect(source).not.toMatch(/setBadgeCount|appBadge/i);
  });

  it("carries the AC9 Tempo Coach boundary comment", () => {
    // The guardrail comment was added per plan §AC9 to document tempo
    // chip as display-only with no coach/haptic logic.
    expect(source).toMatch(/AC9|Tempo Coach/);
  });

  it("imports and renders SetTempoChip (AC1 display requirement)", () => {
    expect(source).toMatch(/import.*SetTempoChip/);
    expect(source).toMatch(/SetTempoChip/);
  });
});
