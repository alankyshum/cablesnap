/**
 * Regression lock: app.config.ts must register the Sentry Expo config plugin
 * so that release builds upload source maps. Also asserts that no Sentry auth
 * token literal ever leaks into the committed config — the plugin's own
 * `authToken` prop is forbidden; only env-var indirection is allowed.
 *
 * Refs: BLD-567 (Sentry source-map upload for release builds).
 */
import fs from "fs";
import path from "path";

describe("Sentry source-map upload wiring (BLD-567)", () => {
  const configSrc = fs.readFileSync(
    path.resolve(__dirname, "../../app.config.ts"),
    "utf8",
  );
  const yamlSrc = fs.readFileSync(
    path.resolve(
      __dirname,
      "../../.github/workflows/scheduled-release.yml",
    ),
    "utf8",
  );

  it("app.config.ts registers the Expo plugin with env-var org/project and no embedded auth token", () => {
    expect(configSrc).toMatch(/@sentry\/react-native\/expo/);
    expect(configSrc).toMatch(/organization:\s*process\.env\.SENTRY_ORG/);
    expect(configSrc).toMatch(/project:\s*process\.env\.SENTRY_PROJECT/);
    expect(configSrc).not.toMatch(/authToken\s*:/);
  });

  it("scheduled-release.yml passes SENTRY_* secrets to BOTH prebuild + gradle steps", () => {
    const tokenRefs =
      yamlSrc.match(
        /SENTRY_AUTH_TOKEN:\s*\$\{\{\s*secrets\.SENTRY_AUTH_TOKEN\s*\}\}/g,
      ) ?? [];
    expect(tokenRefs.length).toBeGreaterThanOrEqual(2);
    const orgRefs =
      yamlSrc.match(/SENTRY_ORG:\s*\$\{\{\s*secrets\.SENTRY_ORG\s*\}\}/g) ?? [];
    expect(orgRefs.length).toBeGreaterThanOrEqual(2);
    const projectRefs =
      yamlSrc.match(
        /SENTRY_PROJECT:\s*\$\{\{\s*secrets\.SENTRY_PROJECT\s*\}\}/g,
      ) ?? [];
    expect(projectRefs.length).toBeGreaterThanOrEqual(2);
  });

  it("no Sentry auth-token literal leaks into committed config or workflow", () => {
    // Sentry auth tokens use `sntrys_`/`sntryu_` prefix; legacy tokens appear
    // as `auth.token=<value>` inside a committed properties file.
    for (const src of [configSrc, yamlSrc]) {
      expect(src).not.toMatch(/sntry[su]_[A-Za-z0-9_-]{10,}/);
      expect(src).not.toMatch(/auth\.token\s*=/i);
    }
  });
});
