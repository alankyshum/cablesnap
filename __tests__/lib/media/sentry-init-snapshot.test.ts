/**
 * AC12 source snapshot test (BLD-1092).
 *
 * Asserts that app/_layout.tsx contains the required Sentry privacy gate
 * configuration:
 *   - replaysSessionSampleRate: 0
 *   - maskAllImages: true
 *   - beforeErrorSampling
 *
 * This is a static analysis test — it reads the source file, not
 * executes it. Purpose: catch accidental removal of the privacy gate
 * in code review or refactoring.
 */
import * as fs from "fs";
import * as path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../../../app/_layout.tsx");

let source: string;
beforeAll(() => {
  source = fs.readFileSync(LAYOUT_PATH, "utf8");
});

describe("Sentry init — AC12 privacy gate (source snapshot)", () => {
  it("sets replaysSessionSampleRate: 0 (no random session-sampled replay)", () => {
    expect(source).toContain("replaysSessionSampleRate: 0");
  });

  it("sets maskAllImages: true (defense-in-depth)", () => {
    expect(source).toContain("maskAllImages: true");
  });

  it("sets beforeErrorSampling callback", () => {
    expect(source).toContain("beforeErrorSampling");
  });

  it("does NOT set replaysSessionSampleRate > 0", () => {
    // Must not have a non-zero value (e.g. 0.1 was the old value).
    expect(source).not.toMatch(/replaysSessionSampleRate:\s*0\.[1-9]/);
  });

  it("imports mediaSurfaceMountCount from lib/media/replay-gate", () => {
    expect(source).toContain("mediaSurfaceMountCount");
  });
});
