/**
 * Playwright globalTeardown: generates .pixelslop/manifest.json
 *
 * Runs AFTER all workers complete, so every screenshot file is on disk.
 * Scans .pixelslop/screenshots/ and maps filenames back to the screen
 * registry to produce the manifest.
 *
 * Filename convention: {slug}-{viewport}-{datestamp}.png
 * e.g. workouts-mobile-20260416.png
 */
import * as fs from "fs";
import * as path from "path";
import { buildSlugMap } from "./screen-registry";

const SCREENSHOT_DIR = path.resolve(__dirname, "../.pixelslop/screenshots");
const MANIFEST_PATH = path.resolve(__dirname, "../.pixelslop/manifest.json");
const VIEWPORTS = ["mobile", "tablet", "desktop"];

export default function globalTeardown() {
  if (!fs.existsSync(SCREENSHOT_DIR)) return;

  const files = fs
    .readdirSync(SCREENSHOT_DIR)
    .filter((f) => f.endsWith(".png"));

  if (files.length === 0) return;

  const slugMap = buildSlugMap();

  // Group files by screen slug
  const screenMap = new Map<
    string,
    { name: string; path: string; screenshots: Record<string, string> }
  >();

  for (const file of files) {
    // Parse: {slug}-{viewport}-{datestamp}.png
    const baseName = file.replace(/\.png$/, "");
    let matchedViewport: string | undefined;
    let slug: string | undefined;

    for (const vp of VIEWPORTS) {
      const vpSuffix = `-${vp}-`;
      const idx = baseName.lastIndexOf(vpSuffix);
      if (idx !== -1) {
        matchedViewport = vp;
        slug = baseName.substring(0, idx);
        break;
      }
    }

    if (!matchedViewport || !slug) continue;

    const screen = slugMap.get(slug);
    if (!screen) continue;

    if (!screenMap.has(slug)) {
      screenMap.set(slug, {
        name: screen.name,
        path: screen.path,
        screenshots: {},
      });
    }
    screenMap.get(slug)!.screenshots[matchedViewport] = file;
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    screens: Array.from(screenMap.values()),
  };

  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
}
