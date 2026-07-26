/**
 * AC12 source snapshot test (BLD-1092).
 *
 * Asserts that app/_layout.tsx contains the required Sentry privacy gate
 * configuration:
 *   - replaysSessionSampleRate: 0
 *   - maskAllImages: true
 *   - beforeErrorSampling
 *
 * Also asserts the BLD-2446 localhost/CI event filter is wired in:
 *   - beforeSend: filterLocalhostEvents
 *   - import from lib/sentry-localhost-filter
 *
 * This is a static analysis test — it reads the source file, not
 * executes it. Purpose: catch accidental removal of the privacy gate
 * in code review or refactoring.
 */
import * as fs from "fs";
import * as path from "path";

const LAYOUT_PATH = path.resolve(__dirname, "../../../app/_layout.tsx");
const CONFIG_PATH = path.resolve(__dirname, "../../../app.config.ts");

let source: string;
let configSource: string;
beforeAll(() => {
  source = fs.readFileSync(LAYOUT_PATH, "utf8");
  configSource = fs.readFileSync(CONFIG_PATH, "utf8");
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

describe("Sentry init — BLD-2446 localhost/CI event filter (source snapshot)", () => {
  it("imports filterLocalhostEvents from lib/sentry-localhost-filter", () => {
    expect(source).toContain("filterLocalhostEvents");
    expect(source).toContain("sentry-localhost-filter");
  });

  it("wires beforeSend to filterLocalhostEvents", () => {
    expect(source).toContain("beforeSend: filterLocalhostEvents");
  });

  it("disables Sentry only for F-Droid builds", () => {
    expect(source).toContain("const sentryEnabled = isSentryEnabled(Constants.expoConfig?.extra);");
    expect(source).toContain("enabled: sentryEnabled");
    expect(configSource).toContain('const isFdroidBuild = process.env.CABLESNAP_FDROID === "1";');
    expect(configSource).toContain("fdroidBuild: isFdroidBuild");
    expect(configSource).toContain("sentryDsn:");
    expect(source).not.toContain("https://c61278ad2a774c2e586454f017d4b86f@");
    expect(source).toContain("...(sentryEnabled && sentryDsn ? { dsn: sentryDsn } : {})");
  });
});
