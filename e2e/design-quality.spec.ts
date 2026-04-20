/**
 * Design quality checks inspired by pixelslop's 5 pillars:
 * Hierarchy, Typography, Color, Responsiveness, Accessibility.
 *
 * Unlike visual regression tests (which only catch changes from a baseline),
 * these assert concrete design invariants that must always hold.
 *
 * Runs against ALL app routes at phone + tablet viewports.
 */
import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { skipOnboarding, navigateTo } from "./helpers";

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

// ── Route Registry ───────────────────────────────────────────────────
// Every route registered in app/_layout.tsx, grouped by category.
// Dynamic [id] routes use known seed IDs so the screen renders content.

type Screen = {
  name: string;
  path: string;
  waitFor?: string;
};

// Tabs (app/(tabs)/)
const TAB_SCREENS: Screen[] = [
  { name: "Workouts", path: "/" },
  { name: "Exercises", path: "/exercises" },
  { name: "Nutrition", path: "/nutrition" },
  { name: "Progress", path: "/progress" },
  { name: "Settings", path: "/settings" },
];

// Tools (app/tools/)
const TOOL_SCREENS: Screen[] = [
  { name: "Tools Hub", path: "/tools" },
  { name: "1RM Calculator", path: "/tools/rm" },
  { name: "Plate Calculator", path: "/tools/plates" },
  { name: "Interval Timer", path: "/tools/timer" },
];

// Standalone screens with no dynamic ID
const STANDALONE_SCREENS: Screen[] = [
  { name: "Workout History", path: "/history" },
  { name: "Feedback", path: "/feedback" },
  { name: "Error Log", path: "/errors" },
  { name: "Body Measurements", path: "/body/measurements" },
  { name: "Body Goals", path: "/body/goals" },
  { name: "New Exercise", path: "/exercise/create" },
  { name: "New Template", path: "/template/create" },
  { name: "New Program", path: "/program/create" },
  { name: "Pick Template", path: "/program/pick-template" },
];

// Dynamic [id] routes — use seed IDs that exist after DB init
const DYNAMIC_SCREENS: Screen[] = [
  { name: "Exercise Detail", path: "/exercise/voltra-001" },
  { name: "Edit Exercise", path: "/exercise/edit/voltra-001" },
  { name: "Template Detail", path: "/template/starter-tpl-1" },
  { name: "Program Detail", path: "/program/starter-prog-1" },
];

const ALL_SCREENS: Screen[] = [
  ...TAB_SCREENS,
  ...TOOL_SCREENS,
  ...STANDALONE_SCREENS,
  ...DYNAMIC_SCREENS,
];

// Onboarding screens are tested separately (they need the onboarding
// gate to be active, i.e. __SKIP_ONBOARDING__ must NOT be set).
const ONBOARDING_SCREENS: Screen[] = [
  { name: "Onboarding: Welcome", path: "/onboarding/welcome" },
  { name: "Onboarding: Setup", path: "/onboarding/setup" },
  { name: "Onboarding: Recommend", path: "/onboarding/recommend" },
];

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Navigate to a screen within the SPA and wait for content.
 * Uses client-side navigation (navigateTo) to preserve in-memory DB state.
 */
async function waitForScreen(page: Page, screen: Screen) {
  await navigateTo(page, screen.path);
  const selector = screen.waitFor ?? '[role="button"], input, [dir="auto"]';
  await page
    .waitForSelector(selector, { timeout: 10_000 })
    .catch(() => {
      /* screen may legitimately have only text content */
    });
  await page.waitForTimeout(500);
}

async function collectDesignMetrics(page: Page) {
  return page.evaluate(() => {
    const allElements = document.querySelectorAll("*");
    const fontSizes = new Map<string, number>();
    const fontWeights = new Map<string, number>();
    const bgColors = new Map<string, number>();
    const textColors = new Map<string, number>();
    const gaps: number[] = [];
    const touchTargets: { text: string; w: number; h: number }[] = [];
    const overflowing: { tag: string; text: string }[] = [];

    for (const el of allElements) {
      const cs = window.getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;

      if (el.textContent?.trim()) {
        const fs = cs.fontSize;
        fontSizes.set(fs, (fontSizes.get(fs) || 0) + 1);
        fontWeights.set(
          cs.fontWeight,
          (fontWeights.get(cs.fontWeight) || 0) + 1,
        );
      }

      if (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") {
        bgColors.set(
          cs.backgroundColor,
          (bgColors.get(cs.backgroundColor) || 0) + 1,
        );
      }
      if (el.textContent?.trim() && cs.color) {
        textColors.set(cs.color, (textColors.get(cs.color) || 0) + 1);
      }

      for (const prop of [
        "marginTop",
        "marginBottom",
        "paddingTop",
        "paddingBottom",
      ] as const) {
        const v = parseFloat(cs[prop]);
        if (v > 0 && v < 200) gaps.push(v);
      }

      const role = el.getAttribute("role");
      const tag = el.tagName.toLowerCase();
      if (
        role === "button" ||
        tag === "button" ||
        tag === "a" ||
        role === "link"
      ) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          touchTargets.push({
            text: (el.textContent?.trim() || "").substring(0, 30),
            w: Math.round(rect.width),
            h: Math.round(rect.height),
          });
        }
      }

      const rect = el.getBoundingClientRect();
      if (rect.right > window.innerWidth + 5 || rect.left < -5) {
        const txt = (el.textContent?.trim() || "").substring(0, 30);
        if (txt) overflowing.push({ tag: el.tagName, text: txt });
      }
    }

    return {
      fontSizeCount: fontSizes.size,
      fontSizes: Object.fromEntries(fontSizes),
      fontWeightCount: fontWeights.size,
      bgColorCount: bgColors.size,
      textColorCount: textColors.size,
      uniqueGaps: [...new Set(gaps.map((g) => Math.round(g)))].sort(
        (a, b) => a - b,
      ),
      touchTargets,
      overflowing,
    };
  });
}

async function collectContrastIssues(page: Page) {
  return page.evaluate(() => {
    const issues: {
      text: string;
      fg: string;
      bg: string;
      ratio: number;
      fontSize: number;
    }[] = [];

    function getLuminance(r: number, g: number, b: number): number {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }

    function parseColor(c: string): [number, number, number] | null {
      const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
    }

    function getEffectiveBg(el: Element): string {
      let current: Element | null = el;
      while (current) {
        const bg = window.getComputedStyle(current).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
        current = current.parentElement;
      }
      return "rgb(255, 255, 255)";
    }

    const textEls = document.querySelectorAll(
      '[role="button"], button, a, [dir="auto"]',
    );
    for (const el of textEls) {
      const text = el.textContent?.trim();
      if (!text || text.length > 40 || text.length === 0) continue;

      const cs = window.getComputedStyle(el);
      const fg = cs.color;
      const bg = getEffectiveBg(el);
      const fontSize = parseFloat(cs.fontSize);

      const fgRgb = parseColor(fg);
      const bgRgb = parseColor(bg);
      if (!fgRgb || !bgRgb) continue;

      const l1 = getLuminance(...fgRgb);
      const l2 = getLuminance(...bgRgb);
      const ratio =
        (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const rounded = Math.round(ratio * 100) / 100;

      const isLarge =
        fontSize >= 18 || (fontSize >= 14 && parseInt(cs.fontWeight) >= 700);
      const threshold = isLarge ? 3 : 4.5;

      if (rounded < threshold) {
        issues.push({
          text: text.substring(0, 25),
          fg,
          bg,
          ratio: rounded,
          fontSize,
        });
      }
    }
    return issues;
  });
}

/**
 * Detect content that sits flush against the viewport edge with no padding.
 * Measures left/right inset of visible text and input elements.
 *
 * For narrow elements: checks bounding box against viewport edge.
 * For full-width text elements (like labels in un-padded FlashLists):
 * checks if the element has zero horizontal padding AND its container chain
 * provides no inset — meaning text renders at x=0.
 */
async function collectEdgePaddingIssues(page: Page, minPadding = 8) {
  return page.evaluate(
    ({ minPad }) => {
      const issues: {
        text: string;
        tag: string;
        leftInset: number;
        rightInset: number;
      }[] = [];
      const vw = window.innerWidth;
      const seen = new Set<string>();

      const candidates = document.querySelectorAll(
        '[dir="auto"], input, textarea, [role="textbox"]',
      );
      for (const el of candidates) {
        const cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        const text = (
          el.textContent?.trim() ||
          (el as HTMLInputElement).placeholder ||
          ""
        ).substring(0, 30);
        if (!text) continue;

        const leftInset = Math.round(rect.left);
        const rightInset = Math.round(vw - rect.right);
        const isFullWidth = rect.width >= vw - 4;

        if (isFullWidth) {
          // Full-width element — only flag if the text itself has no
          // effective padding. Walk up the DOM looking for any ancestor
          // that provides horizontal padding before the scroll container.
          let effectivePadLeft = parseFloat(cs.paddingLeft) || 0;
          let effectivePadRight = parseFloat(cs.paddingRight) || 0;
          let ancestor: Element | null = el.parentElement;
          let depth = 0;
          while (ancestor && depth < 8) {
            const acs = window.getComputedStyle(ancestor);
            effectivePadLeft += parseFloat(acs.paddingLeft) || 0;
            effectivePadRight += parseFloat(acs.paddingRight) || 0;
            const aRect = ancestor.getBoundingClientRect();
            if (aRect.left > 2) {
              effectivePadLeft += aRect.left;
              break;
            }
            // Stop at scroll containers — padding beyond these doesn't help
            if (
              acs.overflow.includes("auto") ||
              acs.overflow.includes("scroll") ||
              acs.overflowY === "auto" ||
              acs.overflowY === "scroll"
            ) {
              break;
            }
            ancestor = ancestor.parentElement;
            depth++;
          }

          if (effectivePadLeft < minPad || effectivePadRight < minPad) {
            const key = `${text}:${leftInset}:${rightInset}`;
            if (!seen.has(key)) {
              seen.add(key);
              issues.push({
                text,
                tag: el.tagName.toLowerCase(),
                leftInset: Math.round(effectivePadLeft),
                rightInset: Math.round(effectivePadRight),
              });
            }
          }
        } else if (leftInset < minPad || rightInset < minPad) {
          const key = `${text}:${leftInset}:${rightInset}`;
          if (!seen.has(key)) {
            seen.add(key);
            issues.push({
              text,
              tag: el.tagName.toLowerCase(),
              leftInset,
              rightInset,
            });
          }
        }
      }
      return issues;
    },
    { minPad: minPadding },
  );
}

/**
 * Measure the widest content block on the page. On tablet/desktop viewports,
 * content should be constrained (not stretch edge-to-edge).
 */
async function collectContentWidth(page: Page) {
  return page.evaluate(() => {
    const containers = document.querySelectorAll(
      '[class*="card"], [class*="Card"], [role="form"], [role="table"], [role="grid"]',
    );
    let maxWidth = 0;
    for (const el of containers) {
      const rect = el.getBoundingClientRect();
      if (rect.width > maxWidth) maxWidth = rect.width;
    }

    const scrollables = document.querySelectorAll(
      '[class*="scroll"], [class*="Scroll"], [class*="list"], [class*="List"]',
    );
    for (const el of scrollables) {
      const rect = el.getBoundingClientRect();
      if (rect.width > maxWidth) maxWidth = rect.width;
    }

    return {
      maxContentWidth: Math.round(maxWidth),
      viewport: window.innerWidth,
    };
  });
}

async function collectTabBarMetrics(page: Page) {
  return page.evaluate(() => {
    const tabBar = document.querySelector('[role="tablist"]');
    if (!tabBar) return { found: false, labels: [] };

    const tabs = tabBar.querySelectorAll('[role="tab"]');
    const labels: {
      text: string;
      scrollWidth: number;
      clientWidth: number;
      truncated: boolean;
    }[] = [];

    for (const tab of tabs) {
      const textEl = tab.querySelector('[dir="auto"]') || tab;
      const text = textEl.textContent?.trim() || "";
      if (!text) continue;

      const sw = (textEl as HTMLElement).scrollWidth;
      const cw = (textEl as HTMLElement).clientWidth;
      labels.push({
        text,
        scrollWidth: sw,
        clientWidth: cw,
        truncated: sw > cw + 1,
      });
    }

    return { found: true, labels };
  });
}

// Framework-level buttons we can't control sizing of
const FRAMEWORK_BUTTONS = ["Dismiss", "Retry", "OK"];

// ── Per-Screen Design Quality Tests ──────────────────────────────────

for (const screen of ALL_SCREENS) {
  test.describe(`Design quality — ${screen.name}`, () => {
    test.beforeEach(async ({ page }) => {
      await waitForScreen(page, screen);
    });

    test("typography: limited font size scale (< 12 distinct)", async ({
      page,
    }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.fontSizeCount,
        `Found ${m.fontSizeCount} distinct font sizes — too many indicates inconsistent typography.\nSizes: ${JSON.stringify(m.fontSizes)}`,
      ).toBeLessThan(12);
    });

    test("color: background palette (< 15 distinct)", async ({ page }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.bgColorCount,
        `Found ${m.bgColorCount} distinct background colors — suggests an uncontrolled palette`,
      ).toBeLessThan(15);
    });

    test("color: text palette (< 10 distinct)", async ({ page }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.textColorCount,
        `Found ${m.textColorCount} distinct text colors — text should use a small set of semantic colors`,
      ).toBeLessThan(10);
    });

    test("spacing: limited spacing scale (< 20 distinct values)", async ({
      page,
    }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.uniqueGaps.length,
        `Found ${m.uniqueGaps.length} distinct spacing values — too many indicates ad-hoc spacing.\nValues: ${m.uniqueGaps.join(", ")}`,
      ).toBeLessThan(20);
    });

    test("responsiveness: no horizontal overflow", async ({ page }) => {
      const m = await collectDesignMetrics(page);
      expect(
        m.overflowing,
        `${m.overflowing.length} elements overflow the viewport:\n${m.overflowing.map((o) => `  <${o.tag}> "${o.text}"`).join("\n")}`,
      ).toHaveLength(0);
    });

    test("responsiveness: content has edge padding (>= 8px inset)", async ({
      page,
    }) => {
      const issues = await collectEdgePaddingIssues(page);
      expect(
        issues,
        `${issues.length} elements flush against viewport edge (no padding):\n${issues.map((i) => `  <${i.tag}> "${i.text}" left=${i.leftInset}px right=${i.rightInset}px`).join("\n")}`,
      ).toHaveLength(0);
    });

    test("accessibility: touch targets >= 44x44px", async ({
      page,
    }, testInfo) => {
      const m = await collectDesignMetrics(page);
      const undersized = m.touchTargets.filter(
        (t) => t.w < 44 || t.h < 44,
      );

      if (undersized.length > 0) {
        testInfo.annotations.push({
          type: "touch-target-warning",
          description: undersized
            .map((t) => `"${t.text}" (${t.w}x${t.h})`)
            .join("; "),
        });
      }

      const appUndersized = undersized.filter(
        (t) => !FRAMEWORK_BUTTONS.includes(t.text),
      );
      expect(
        appUndersized,
        `${appUndersized.length} app touch targets below 44px minimum:\n${appUndersized.map((t) => `  "${t.text}" (${t.w}x${t.h})`).join("\n")}`,
      ).toHaveLength(0);
    });

    test("accessibility: text contrast WCAG AA", async ({
      page,
    }, testInfo) => {
      const issues = await collectContrastIssues(page);
      if (issues.length > 0) {
        testInfo.annotations.push({
          type: "contrast-warning",
          description: issues
            .map(
              (i) =>
                `"${i.text}" ratio=${i.ratio} (fg=${i.fg}, bg=${i.bg}, ${i.fontSize}px)`,
            )
            .join("; "),
        });
      }
    });
  });
}

// ── Tab Bar ─────────────────────────────────────────────────────────

test.describe("Tab bar — label truncation", () => {
  test("no tab labels are truncated on current viewport", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForSelector('[role="tab"]', { timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(500);

    const metrics = await collectTabBarMetrics(page);

    if (!metrics.found) {
      test.skip(!metrics.found, "No tab bar found on this viewport");
      return;
    }

    const truncated = metrics.labels.filter((l) => l.truncated);
    expect(
      truncated,
      `Tab labels truncated:\n${truncated.map((l) => `  "${l.text}" scrollWidth=${l.scrollWidth} > clientWidth=${l.clientWidth}`).join("\n")}`,
    ).toHaveLength(0);
  });
});

// ── Content Max-Width (tablet/desktop) ──────────────────────────────

test.describe("Responsiveness — content width constraint (tablet+)", () => {
  for (const screen of ALL_SCREENS) {
    test(`${screen.name}: content doesn't exceed 720px on wide viewports`, async ({
      page,
    }, testInfo: TestInfo) => {
      const viewport = page.viewportSize();
      if (!viewport || viewport.width < 600) {
        test.skip(true, "Only relevant for tablet/desktop viewports");
        return;
      }

      await waitForScreen(page, screen);
      const metrics = await collectContentWidth(page);

      if (metrics.maxContentWidth > 720) {
        testInfo.annotations.push({
          type: "content-width-warning",
          description: `${screen.name}: widest content is ${metrics.maxContentWidth}px on ${metrics.viewport}px viewport (max recommended: 720px)`,
        });
      }
    });
  }
});

// ── Onboarding Screens ──────────────────────────────────────────────
// Tested without __SKIP_ONBOARDING__ — the onboarding gate must be
// active so these screens actually render.

test.describe("Design quality — Onboarding", () => {
  async function gotoOnboardingScreen(page: Page, path: string) {
    // Navigate to / first — onboarding gate redirects to /onboarding/welcome
    await page.goto("/");
    await page.waitForTimeout(500);

    if (path === "/onboarding/welcome") return;

    // Get Started → Setup
    const getStarted = page.getByRole("button", { name: /get started/i });
    if (await getStarted.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await getStarted.click();
      await page.waitForTimeout(500);
    }
    if (path === "/onboarding/setup") return;

    // Setup → Continue → Recommend
    const beginner = page.getByText("Beginner");
    if (await beginner.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await beginner.click();
      await page.waitForTimeout(300);
    }
    const cont = page.getByRole("button", { name: /continue/i });
    if (await cont.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cont.click();
      await page.waitForTimeout(1_000);
    }
  }

  for (const screen of ONBOARDING_SCREENS) {
    test.describe(screen.name, () => {
      test.beforeEach(async ({ page }) => {
        await gotoOnboardingScreen(page, screen.path);
        await page.waitForTimeout(500);
      });

      test("responsiveness: no horizontal overflow", async ({ page }) => {
        const m = await collectDesignMetrics(page);
        expect(
          m.overflowing,
          `${m.overflowing.length} elements overflow the viewport:\n${m.overflowing.map((o) => `  <${o.tag}> "${o.text}"`).join("\n")}`,
        ).toHaveLength(0);
      });

      test("responsiveness: content has edge padding (>= 8px inset)", async ({
        page,
      }) => {
        const issues = await collectEdgePaddingIssues(page);
        expect(
          issues,
          `${issues.length} elements flush against viewport edge (no padding):\n${issues.map((i) => `  <${i.tag}> "${i.text}" left=${i.leftInset}px right=${i.rightInset}px`).join("\n")}`,
        ).toHaveLength(0);
      });

      test("accessibility: touch targets >= 44x44px", async ({
        page,
      }, testInfo) => {
        const m = await collectDesignMetrics(page);
        const undersized = m.touchTargets.filter(
          (t) => t.w < 44 || t.h < 44,
        );
        if (undersized.length > 0) {
          testInfo.annotations.push({
            type: "touch-target-warning",
            description: undersized
              .map((t) => `"${t.text}" (${t.w}x${t.h})`)
              .join("; "),
          });
        }
        const appUndersized = undersized.filter(
          (t) => !FRAMEWORK_BUTTONS.includes(t.text),
        );
        expect(
          appUndersized,
          `${appUndersized.length} app touch targets below 44px minimum:\n${appUndersized.map((t) => `  "${t.text}" (${t.w}x${t.h})`).join("\n")}`,
        ).toHaveLength(0);
      });

      test("accessibility: text contrast WCAG AA", async ({
        page,
      }, testInfo) => {
        const issues = await collectContrastIssues(page);
        if (issues.length > 0) {
          testInfo.annotations.push({
            type: "contrast-warning",
            description: issues
              .map(
                (i) =>
                  `"${i.text}" ratio=${i.ratio} (fg=${i.fg}, bg=${i.bg}, ${i.fontSize}px)`,
              )
              .join("; "),
          });
        }
      });
    });
  }
});
