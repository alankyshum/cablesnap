import * as fs from "fs";
import * as path from "path";

/**
 * Contract test for the BLD-534 visual-regression harness route.
 *
 * The harness is dev-only and must be unreachable in production builds.
 * Rather than spinning up the full Expo bundler just to prove the guards
 * work, we static-analyse the source for the three required guards:
 *   1. `__DEV__` check so Metro tree-shakes the harness branch
 *   2. `Platform.OS === "web"` so native never renders it
 *   3. `navigator.webdriver === true` so console-injected flags in a real
 *      user's browser cannot unlock it
 *
 * Mirrors the BLD-526 escape-hatch gating convention.
 */
describe("e2e-rest-chip harness guards", () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, "../../app/e2e-rest-chip.tsx"),
    "utf-8",
  );

  it("checks __DEV__ to allow prod bundle tree-shaking", () => {
    expect(source).toMatch(/if\s*\(!\s*__DEV__\)\s*return\s+false/);
  });

  it("checks Platform.OS === 'web'", () => {
    expect(source).toMatch(/Platform\.OS\s*!==?\s*"web"/);
  });

  it("checks navigator.webdriver === true", () => {
    expect(source).toMatch(/navigator\.webdriver\s*===\s*true/);
  });

  it("exposes the adaptive breakdown with 3 tokens so <360dp truncates", () => {
    const match = source.match(/reasonShort:\s*"([^"]+)"/);
    expect(match).not.toBeNull();
    const label = match?.[1] ?? "";
    const tokens = label.split(/\s*·\s*/).filter(Boolean);
    expect(tokens.length).toBeGreaterThanOrEqual(3);
  });

  it("renders a default-breakdown fixture with isDefault: true", () => {
    expect(source).toMatch(/DEFAULT_BREAKDOWN[\s\S]{0,400}isDefault:\s*true/);
  });
});
