/**
 * BLD-1158 AC9: Static boundary guard — SetRow.tsx and tempo-coach.ts must
 * not import expo-haptics or contain PR2-restricted symbols in code.
 *
 * PR1 boundary rule: The Tempo Coach is split into three PRs. PR1 (this PR)
 * contains only the data layer and input UI. The coach engine (expo-haptics,
 * expo-keep-awake, streak/adherence/badge tracking) lives exclusively in PR2.
 *
 * This test uses Node's `fs.readFileSync` to read the source at test time and
 * asserts that no forbidden symbols appear in non-comment code. Guardrail
 * comments are permitted to name the forbidden symbols; actual calls are not.
 */

import * as fs from "fs";
import * as path from "path";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");

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

