/**
 * Screenshot capture for pixelslop visual review.
 *
 * Navigates to every registered screen at each viewport size and saves
 * a full-page screenshot to `.pixelslop/screenshots/`. A manifest.json
 * is written after all captures complete.
 *
 * Screenshots are generated artifacts — they are gitignored and
 * regenerated on each run (old files are cleaned up first).
 */
import { test, type Page } from "@playwright/test";
import { skipOnboarding, navigateTo } from "./helpers";
import * as fs from "fs";
import * as path from "path";

// ── Screen Registry (mirrored from design-quality.spec.ts) ──────────

type Screen = {
  name: string;
  path: string;
};

const TAB_SCREENS: Screen[] = [
  { name: "Workouts", path: "/" },
  { name: "Exercises", path: "/exercises" },
  { name: "Nutrition", path: "/nutrition" },
  { name: "Progress", path: "/progress" },
  { name: "Settings", path: "/settings" },
];

const TOOL_SCREENS: Screen[] = [
  { name: "Tools Hub", path: "/tools" },
  { name: "1RM Calculator", path: "/tools/rm" },
  { name: "Plate Calculator", path: "/tools/plates" },
  { name: "Interval Timer", path: "/tools/timer" },
];

const STANDALONE_SCREENS: Screen[] = [
  { name: "Workout History", path: "/history" },
  { name: "Feedback", path: "/feedback" },
  { name: "Error Log", path: "/errors" },
  { name: "Body Measurements", path: "/body/measurements" },
  { name: "Body Goals", path: "/body/goals" },
  { name: "Macro Targets", path: "/nutrition/targets" },
  { name: "Add Food", path: "/nutrition/add" },
  { name: "New Exercise", path: "/exercise/create" },
  { name: "New Template", path: "/template/create" },
  { name: "Pick Exercise", path: "/template/pick-exercise" },
  { name: "New Program", path: "/program/create" },
  { name: "Pick Template", path: "/program/pick-template" },
];

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

const ONBOARDING_SCREENS: Screen[] = [
  { name: "Onboarding Welcome", path: "/onboarding/welcome" },
  { name: "Onboarding Setup", path: "/onboarding/setup" },
  { name: "Onboarding Recommend", path: "/onboarding/recommend" },
];

// ── Helpers ──────────────────────────────────────────────────────────

const SCREENSHOT_DIR = path.resolve(__dirname, "../.pixelslop/screenshots");
const MANIFEST_PATH = path.resolve(__dirname, "../.pixelslop/manifest.json");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getDateStamp(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

type ManifestScreen = {
  name: string;
  path: string;
  screenshots: Record<string, string>;
};

// Shared manifest data accumulated across projects/viewports
const manifestScreens = new Map<string, ManifestScreen>();

async function captureScreen(
  page: Page,
  screen: Screen,
  viewport: string,
  dateStamp: string,
) {
  const slug = slugify(screen.name);
  const filename = `${slug}-${viewport}-${dateStamp}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);

  try {
    await navigateTo(page, screen.path);
    await page.waitForTimeout(1000); // let content settle
    await page.screenshot({ path: filepath, fullPage: true });

    // Update manifest
    const key = screen.name;
    if (!manifestScreens.has(key)) {
      manifestScreens.set(key, {
        name: screen.name,
        path: screen.path,
        screenshots: {},
      });
    }
    manifestScreens.get(key)!.screenshots[viewport] = filename;
  } catch (err) {
    console.warn(
      `⚠ Screenshot skipped for ${screen.name} at ${viewport}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

// ── Setup: Clean old screenshots ─────────────────────────────────────

test.beforeAll(() => {
  // Ensure directory exists
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Clean old screenshots
  const existing = fs.readdirSync(SCREENSHOT_DIR);
  for (const file of existing) {
    if (file.endsWith(".png")) {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, file));
    }
  }
});

// ── Screenshot Capture Tests ─────────────────────────────────────────

test.describe("Screenshot Capture — All Screens", () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
  });

  for (const screen of ALL_SCREENS) {
    test(`capture ${screen.name}`, async ({ page }, testInfo) => {
      const viewport = testInfo.project.name; // "mobile" | "tablet" | "desktop"
      const dateStamp = getDateStamp();
      await captureScreen(page, screen, viewport, dateStamp);
    });
  }
});

test.describe("Screenshot Capture — Onboarding", () => {
  // Onboarding screens need the onboarding gate to be active,
  // so we do NOT call skipOnboarding here.
  for (const screen of ONBOARDING_SCREENS) {
    test(`capture ${screen.name}`, async ({ page }, testInfo) => {
      const viewport = testInfo.project.name;
      const dateStamp = getDateStamp();

      // Navigate directly to onboarding path
      await page.goto(screen.path);
      await page.waitForTimeout(1000);

      const slug = slugify(screen.name);
      const filename = `${slug}-${viewport}-${dateStamp}.png`;
      const filepath = path.join(SCREENSHOT_DIR, filename);

      try {
        await page.screenshot({ path: filepath, fullPage: true });

        const key = screen.name;
        if (!manifestScreens.has(key)) {
          manifestScreens.set(key, {
            name: screen.name,
            path: screen.path,
            screenshots: {},
          });
        }
        manifestScreens.get(key)!.screenshots[viewport] = filename;
      } catch (err) {
        console.warn(
          `⚠ Screenshot skipped for ${screen.name} at ${viewport}: ${err instanceof Error ? err.message : err}`,
        );
      }
    });
  }
});

// ── Write Manifest ───────────────────────────────────────────────────

test.afterAll(() => {
  const manifest = {
    capturedAt: new Date().toISOString(),
    screens: Array.from(manifestScreens.values()),
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
});
