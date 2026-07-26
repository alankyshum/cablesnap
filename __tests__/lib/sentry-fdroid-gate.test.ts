import { isSentryEnabled } from "../../lib/sentry-enabled";
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

  it("omits the DSN and gates native Sentry initialization when disabled", () => {
    expect(layoutSource).toMatch(/\.\.\.\(sentryEnabled \? \{ dsn: SENTRY_DSN \} : \{\}\)/);
    expect(layoutSource).toMatch(/enableNative:\s*sentryEnabled/);
    expect(layoutSource).toMatch(/autoInitializeNativeSdk:\s*sentryEnabled/);
    expect(layoutSource).toMatch(/enableNativeCrashHandling:\s*sentryEnabled/);
    expect(layoutSource).toMatch(/enableAutoSessionTracking:\s*sentryEnabled/);
  });
});
