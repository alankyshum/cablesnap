/**
 * Regression lock for BLD-4109 / AC10b.
 *
 * The Wear OS tests workflow (`.github/workflows/wear-tests.yml`) runs
 * `npx expo prebuild --clean --platform android` and then
 * `./gradlew :app:assembleReleaseFdroid`. Both steps MUST export
 * `CABLESNAP_FDROID: "1"` because every F-Droid patch in
 * `plugins/with-wearos-module.js` is gated on
 * `process.env.CABLESNAP_FDROID === "1"` (prebuild time) and
 * `System.getenv("CABLESNAP_FDROID") == "1"` (gradle time).
 *
 * When this env var is not set on either step, the entire GMS-exclude
 * machinery is a no-op and `com.google.android.gms:play-services-wearable`
 * (pulled in by `modules/expo-wearos-bridge/android/build.gradle`) leaks 446
 * `com/google/android/gms/wearable` classes into `app-releaseFdroid.apk`,
 * failing the AC10b dex-strings gate (GitHub Actions run #30216904911).
 *
 * This test pins the flag on both step blocks so it cannot silently regress
 * again.
 */

import * as fs from "fs";
import * as path from "path";

const WORKFLOW_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "wear-tests.yml",
);

/**
 * Return the text of the step whose name matches `stepName` (up to but
 * excluding the next `- name:` step or end of file).
 */
function extractStep(yaml: string, stepName: string): string {
  const escaped = stepName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startRe = new RegExp(`^\\s*-\\s+name:\\s*${escaped}\\s*$`, "m");
  const startMatch = startRe.exec(yaml);
  if (!startMatch) {
    throw new Error(
      `Could not find step named "${stepName}" in wear-tests.yml — ` +
        `if the step was renamed, update this test to match.`,
    );
  }
  const rest = yaml.slice(startMatch.index + startMatch[0].length);
  const nextRe = /^\s*-\s+name:\s*/m;
  const nextMatch = nextRe.exec(rest);
  return nextMatch ? rest.slice(0, nextMatch.index) : rest;
}

describe("wear-tests.yml AC10b F-Droid flag (BLD-4109 regression lock)", () => {
  const yaml = fs.readFileSync(WORKFLOW_PATH, "utf8");

  it("prebuild step exports CABLESNAP_FDROID=\"1\"", () => {
    const step = extractStep(yaml, "Generate native project");
    expect(step).toMatch(/CABLESNAP_FDROID:\s*"1"/);
  });

  it("AC10b assembleReleaseFdroid step exports CABLESNAP_FDROID=\"1\"", () => {
    const step = extractStep(
      yaml,
      "Assemble :app releaseFdroid + verify GMS-free (AC10b)",
    );
    expect(step).toMatch(/CABLESNAP_FDROID:\s*"1"/);
    // Sanity: the flag must be inside this step's env block, not another.
    expect(step).toMatch(/assembleReleaseFdroid/);
  });
});
