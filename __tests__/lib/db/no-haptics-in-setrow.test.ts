/**
 * BLD-1158 AC9: Static boundary guard — SetRow.tsx hard-exclusion boundary
 * and tempo-coach.ts psychologist guardrails.
 *
 * Two describe blocks:
 *  1. SetRow.tsx hard exclusions — haptics, streak, badge, notification imports
 *  2. tempo-coach.ts psychologist guardrails — no streak/adherence/badge/notifications
 *     (PR2: tempo-coach.ts now correctly imports expo-haptics as the engine; the
 *     PR1 "no haptics in tempo-coach" rule no longer applies after PR2 merges)
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

describe("AC9: tempo-coach.ts psychologist guardrails", () => {
  const tempoCoachSrc = readSrc("lib/workout/tempo-coach.ts");
  const tempoCoachCode = codeOnly(tempoCoachSrc);

  it("tempo-coach.ts does not contain streak/adherence/badge tracking in code", () => {
    expect(tempoCoachCode).not.toMatch(/\bstreak\b/i);
    expect(tempoCoachCode).not.toMatch(/\badherence\b/i);
    expect(tempoCoachCode).not.toMatch(/\bbadge\b/i);
  });

  it("tempo-coach.ts does not call scheduleNotificationAsync in code", () => {
    // Guardrail comments may mention the symbol; only actual calls are forbidden.
    expect(tempoCoachCode).not.toMatch(/scheduleNotificationAsync/);
  });

  it("tempo-coach.ts exports startCoach (coach engine present in PR2)", () => {
    expect(tempoCoachSrc).toMatch(/export function startCoach/);
  });
});
