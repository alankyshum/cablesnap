/**
 * BLD-582 / AC-10: single-source regression lock for lib/audio.ts.
 *
 * PLAN-BLD-580 §Technical Approach forbids variant packs, per-variant
 * arrays, and runtime pitch/rate manipulation of the set_complete cue
 * (Dealer-drift vector; slot-machine acoustics).
 *
 * Static source scan — no runtime import needed.
 */
import { readFileSync } from "fs";
import { join } from "path";

const AUDIO_PATH = join(__dirname, "..", "..", "lib", "audio.ts");
const src = readFileSync(AUDIO_PATH, "utf8");

describe("lib/audio.ts single-source invariant (BLD-582 AC-10)", () => {
  it("has exactly one `set_complete: require(...)` mapping", () => {
    const matches = src.match(/set_complete:\s*require\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it("has no `[` within 40 chars after the set_complete anchor (no variant array)", () => {
    const idx = src.indexOf("set_complete:");
    expect(idx).toBeGreaterThanOrEqual(0);
    const window = src.slice(idx, idx + 53 /* anchor + 40 */);
    expect(window).not.toMatch(/\[/);
  });

  it.each([
    ["pitchShift"],
    ["detune"],
    ["rate:"],
    ["playbackRate"],
  ])("does not reference %s anywhere in the module", (token) => {
    expect(src).not.toContain(token);
  });
});
