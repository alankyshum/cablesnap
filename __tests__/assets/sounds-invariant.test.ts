/**
 * BLD-559 AC-11 (asset invariant): assets/sounds/ contains exactly one
 * file matching `set-complete.*` (non-recursive) AND has zero
 * subdirectories. Locks the "no variant pack" guardrail (PSY-3).
 */
import { readdirSync, statSync, readFileSync } from "fs";
import { join } from "path";

const SOUNDS_DIR = join(__dirname, "..", "..", "assets", "sounds");

describe("assets/sounds invariant (BLD-559)", () => {
  it("contains exactly one set-complete.* file (non-recursive)", () => {
    const entries = readdirSync(SOUNDS_DIR);
    const matches = entries.filter((name) => /^set-complete\.[^/]+$/.test(name));
    expect(matches).toHaveLength(1);
  });

  it("has zero subdirectories", () => {
    const entries = readdirSync(SOUNDS_DIR);
    const dirs = entries.filter((name) => {
      try {
        return statSync(join(SOUNDS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    });
    expect(dirs).toEqual([]);
  });

  it("LICENSES.md declares set-complete.wav as CC0-1.0", () => {
    const licenseText = readFileSync(join(SOUNDS_DIR, "LICENSES.md"), "utf8");
    expect(licenseText).toMatch(/set-complete\.wav/);
    expect(licenseText).toMatch(/CC0-1\.0/);
  });
});
