import * as fs from "fs";
import * as path from "path";

/**
 * BLD-565 regression-lock: on an unsupported web host, RootLayout MUST
 * short-circuit to <WebUnsupportedScreen/> BEFORE mounting the
 * <QueryProvider> / <Stack> tree. Any descendant of that tree can
 * reach drizzle-orm/expo-sqlite's sync API and crash with
 * `ReferenceError: SharedArrayBuffer is not defined`.
 *
 * This is a source-scan test (same pattern as
 * __tests__/hooks/usePRCelebration-regression-lock.test.ts) rather
 * than a render-time integration test, because the RootLayout module
 * runs `Sentry.init`, `SplashScreen.preventAutoHideAsync`,
 * `setupHandler`, `setupConsoleLogBuffer`, and Reanimated flag setup
 * at import time — all of which are painful to mock and irrelevant to
 * this particular gate.
 */

const layoutPath = path.resolve(__dirname, "../../app/_layout.tsx");
const bannersPath = path.resolve(__dirname, "../../components/LayoutBanners.tsx");
const layoutSrc = fs.readFileSync(layoutPath, "utf-8");
const bannersSrc = fs.readFileSync(bannersPath, "utf-8");

describe("RootLayout web-unsupported render gate (BLD-565)", () => {
  it("destructures webUnsupported from useAppInit", () => {
    expect(layoutSrc).toMatch(/webUnsupported\s*[},]/);
  });

  it("imports WebUnsupportedScreen and WEB_UNSUPPORTED_MESSAGE", () => {
    expect(layoutSrc).toMatch(
      /from ['"](?:\.\.\/)?components\/WebUnsupportedScreen['"]/
    );
    expect(layoutSrc).toMatch(/WEB_UNSUPPORTED_MESSAGE/);
  });

  it("checks webUnsupported BEFORE rendering QueryProvider/Stack", () => {
    const gateIdx = layoutSrc.search(/if\s*\(\s*webUnsupported\s*\)/);
    const providerIdx = layoutSrc.indexOf("<QueryProvider");
    const stackIdx = layoutSrc.indexOf("<Stack");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(providerIdx).toBeGreaterThan(-1);
    expect(stackIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(providerIdx);
    expect(gateIdx).toBeLessThan(stackIdx);
  });

  it("the webUnsupported branch returns WebUnsupportedScreen and nothing from the drizzle-reachable tree", () => {
    // Extract everything from `if (webUnsupported) {` up to the
    // matching closing `}` via a simple brace-depth walk.
    const startIdx = layoutSrc.search(/if\s*\(\s*webUnsupported\s*\)\s*\{/);
    expect(startIdx).toBeGreaterThan(-1);
    const openBrace = layoutSrc.indexOf("{", startIdx);
    let depth = 0;
    let endIdx = openBrace;
    for (let i = openBrace; i < layoutSrc.length; i++) {
      if (layoutSrc[i] === "{") depth++;
      else if (layoutSrc[i] === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
    const gateBlock = layoutSrc.slice(openBrace, endIdx + 1);
    expect(gateBlock).toMatch(/<WebUnsupportedScreen/);
    // Must NOT mount anything that would let a descendant touch drizzle.
    expect(gateBlock).not.toMatch(/<QueryProvider/);
    expect(gateBlock).not.toMatch(/<Stack\b/);
    expect(gateBlock).not.toMatch(/<LayoutBanners/);
  });
});

describe("LayoutBanners web-unsupported Retry suppression (BLD-565)", () => {
  it("imports WEB_UNSUPPORTED_MESSAGE from lib/web-support", () => {
    expect(bannersSrc).toMatch(/WEB_UNSUPPORTED_MESSAGE/);
    expect(bannersSrc).toMatch(/from ['"]@\/lib\/web-support['"]/);
  });

  it("gates the Retry affordance on error !== WEB_UNSUPPORTED_MESSAGE", () => {
    expect(bannersSrc).toMatch(/error\s*!==\s*WEB_UNSUPPORTED_MESSAGE/);
    // The Retry <Text> element must now be rendered behind a JSX
    // conditional (`{canRetry && (…)}`). We locate the Retry label
    // literal that occurs inside JSX (between > and <) to avoid
    // matching the comment-block mentions of the word.
    const match = bannersSrc.match(/>\s*Retry\s*</);
    expect(match).not.toBeNull();
    const retryIdx = match!.index!;
    const before = bannersSrc.slice(Math.max(0, retryIdx - 400), retryIdx);
    expect(before).toMatch(/&&\s*\(/);
  });
});
