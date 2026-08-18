import { isSentryEnabled, resolveSentryDsn } from "../../lib/sentry-enabled";
import { readFileSync } from "fs";
import { join } from "path";

const layoutSource = readFileSync(join(__dirname, "../../app/_layout.tsx"), "utf8");

describe("Sentry F-Droid gate", () => {
  it("disables Sentry for an F-Droid build", () => {
    expect(isSentryEnabled({ fdroidBuild: true })).toBe(false);
  });

  it("enables Sentry when the F-Droid flag is absent or false", () => {
    expect(isSentryEnabled({})).toBe(true);
    expect(isSentryEnabled({ fdroidBuild: false })).toBe(true);
    expect(isSentryEnabled(undefined)).toBe(true);
  });

  it("resolves DSN from non-F-Droid config only", () => {
    expect(resolveSentryDsn({ fdroidBuild: true })).toBeUndefined();
    expect(resolveSentryDsn({ fdroidBuild: false, sentryDsn: "https://example.invalid/1" })).toBe("https://example.invalid/1");
    expect(resolveSentryDsn({ sentryDsn: "https://example.invalid/1" })).toBe("https://example.invalid/1");
  });

  it("has no hardcoded DSN and gates native Sentry initialization", () => {
    expect(layoutSource).not.toContain("https://c61278ad2a774c2e586454f017d4b86f@");
    expect(layoutSource).toContain("...(sentryEnabled && sentryDsn ? { dsn: sentryDsn } : {})");
    expect(layoutSource).toMatch(/enableNative:\s*sentryEnabled/);
    expect(layoutSource).toMatch(/autoInitializeNativeSdk:\s*sentryEnabled/);
    expect(layoutSource).toMatch(/enableNativeCrashHandling:\s*sentryEnabled/);
    expect(layoutSource).toMatch(/enableAutoSessionTracking:\s*sentryEnabled/);
  });
});
