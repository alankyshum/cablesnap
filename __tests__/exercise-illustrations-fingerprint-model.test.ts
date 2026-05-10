/**
 * BLD-1145: covers AC (mixed-provider check) from PLAN-BLD-989.md
 *
 * Scans every voltra-[n]/fingerprint.json and asserts all have
 * model: gemini-3-pro-image-preview (no gpt-image-1 leftovers).
 */

import * as fs from "fs";
import * as path from "path";

const ILLUSTRATIONS_DIR = path.resolve(
  __dirname,
  "../assets/exercise-illustrations",
);
const EXPECTED_MODEL = "gemini-3-pro-image-preview";

describe("BLD-989: exercise illustration fingerprints — no mixed-provider", () => {
  const voltraDirs = fs
    .readdirSync(ILLUSTRATIONS_DIR)
    .filter((d) => d.startsWith("voltra-"))
    .map((d) => path.join(ILLUSTRATIONS_DIR, d))
    .filter((d) => fs.statSync(d).isDirectory());

  it("finds at least one voltra- directory", () => {
    expect(voltraDirs.length).toBeGreaterThan(0);
  });

  it("every voltra-* directory has a fingerprint.json", () => {
    for (const dir of voltraDirs) {
      const fp = path.join(dir, "fingerprint.json");
      expect(fs.existsSync(fp)).toBe(true);
    }
  });

  it("every voltra-* fingerprint.json has model: gemini-3-pro-image-preview (no gpt-image-1)", () => {
    const mismatches: string[] = [];
    for (const dir of voltraDirs) {
      const fp = path.join(dir, "fingerprint.json");
      if (!fs.existsSync(fp)) continue;
      const data = JSON.parse(fs.readFileSync(fp, "utf-8")) as { model?: string };
      if (data.model !== EXPECTED_MODEL) {
        mismatches.push(`${path.basename(dir)}: model="${data.model}"`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
