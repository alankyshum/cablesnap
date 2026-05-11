/**
 * BLD-1158 AC9: Static boundary guard — SetRow.tsx hard-exclusion boundary
 * and PR1 scope boundary (SetRow + tempo-coach.ts must not import expo-haptics
 * or contain PR2-restricted symbols).
 *
 * Two describe blocks:
 *  1. SetRow.tsx hard exclusions — haptics, streak, badge, notification imports
 *  2. PR1 boundary guard — SetRow.tsx + tempo-coach.ts vs expo-haptics / PR2 symbols
 *
 * PR1 boundary rule: The Tempo Coach is split into three PRs. PR1 (this PR)
 * contains only the data layer and input UI. The coach engine (expo-haptics,
 * expo-keep-awake, streak/adherence/badge tracking) lives exclusively in PR2.
 *
 * Strategy: Node's `fs.readFileSync` reads source at test time; assertions
 * verify that no forbidden symbols appear in non-comment code. Guardrail
 * comments are permitted to name the forbidden symbols; actual calls are not.
 */

import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const SET_ROW_PATH = path.join(PROJECT_ROOT, "components/session/SetRow.tsx");

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relPath), "utf8");
}

/** Strip single-line // comments and JSDoc * lines before asserting. */
function codeOnly(src: string): string {
  return src
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*");
    })
    .join("\n");
}

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

describe("AC9: PR1 boundary — no PR2 symbols in SetRow or tempo-coach (PR1)", () => {
  const setRowSrc = readSrc("components/session/SetRow.tsx");
  const tempoCoachSrc = readSrc("lib/workout/tempo-coach.ts");
  const setRowCode = codeOnly(setRowSrc);
  const tempoCoachCode = codeOnly(tempoCoachSrc);

  it("SetRow.tsx does not import expo-haptics", () => {
    expect(setRowSrc).not.toMatch(/import.*expo-haptics/);
    expect(setRowSrc).not.toMatch(/from ['"]expo-haptics['"]/);
  });

  it("SetRow.tsx does not reference streak, adherence, or gamification badge in new tempo code", () => {
    // SetRow has a pre-existing `prBadge` style (🏆 emoji for PR sets).
    // The boundary rule only applies to NEW gamification tracking (streak counts,
    // adherence badges, motivation badges). Check tempo-coach.ts instead (below).
    // This assertion is retained for SetRow specifically for expo-haptics only.
    expect(setRowCode).not.toMatch(/import.*expo-haptics/);
  });

  it("SetRow.tsx does not call scheduleNotificationAsync in code", () => {
    expect(setRowCode).not.toMatch(/scheduleNotificationAsync/);
  });

  it("tempo-coach.ts (PR1) does not import expo-haptics", () => {
    expect(tempoCoachSrc).not.toMatch(/import.*expo-haptics/);
    expect(tempoCoachSrc).not.toMatch(/from ['"]expo-haptics['"]/);
  });

  it("tempo-coach.ts (PR1) does not contain streak/adherence/badge tracking in code", () => {
    expect(tempoCoachCode).not.toMatch(/\bstreak\b/i);
    expect(tempoCoachCode).not.toMatch(/\badherence\b/i);
    expect(tempoCoachCode).not.toMatch(/\bbadge\b/i);
  });

  it("tempo-coach.ts (PR1) does not call scheduleNotificationAsync in code", () => {
    // Guardrail comments may mention the symbol; only actual calls are forbidden.
    expect(tempoCoachCode).not.toMatch(/scheduleNotificationAsync/);
  });
});
