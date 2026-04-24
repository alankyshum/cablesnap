/**
 * BLD-577 regression lock: the session screen MUST pair every
 * activateKeepAwakeAsync with a deactivateKeepAwake on unmount.
 *
 * Without this, navigating away mid-session can leak the wake-lock and
 * keep the screen on indefinitely — one of the top drain vectors
 * reported in GitHub issue #336 (17% battery / hour).
 *
 * This is a source-scan regression-lock test (same pattern as
 * __tests__/config/sentry-plugin.test.ts). If someone removes the
 * deactivation, this fails before the change ships.
 */
import { readFileSync } from "fs";
import { join } from "path";

describe("session screen keep-awake lifecycle (BLD-577)", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "app", "session", "[id].tsx"),
    "utf8",
  );

  it("imports both activateKeepAwakeAsync AND deactivateKeepAwake", () => {
    expect(source).toMatch(/activateKeepAwakeAsync/);
    expect(source).toMatch(/deactivateKeepAwake\b/);
  });

  it("calls activateKeepAwakeAsync() inside a useEffect", () => {
    // Require the activation to be inside some useEffect so the cleanup
    // return function can balance it.
    expect(source).toMatch(/useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?activateKeepAwakeAsync/);
  });

  it("returns a cleanup function from that useEffect that calls deactivateKeepAwake", () => {
    // Match the shape: useEffect(() => { ... activateKeepAwakeAsync ... return () => { ... deactivateKeepAwake ... } }, [])
    const match = source.match(
      /useEffect\(\s*\(\)\s*=>\s*\{[\s\S]*?activateKeepAwakeAsync[\s\S]*?return\s*\(\)\s*=>\s*\{[\s\S]*?deactivateKeepAwake\(\)[\s\S]*?\}[\s\S]*?\}\s*,\s*\[\s*\]\s*\)/,
    );
    expect(match).not.toBeNull();
  });
});
