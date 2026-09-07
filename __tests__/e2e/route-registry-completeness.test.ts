import fs from "node:fs";
import path from "node:path";

import { ALL_SCREENS, ONBOARDING_SCREENS } from "../../e2e/route-registry";

const APP_ROOT = path.resolve(__dirname, "../../app");

/** Routes that are intentionally not screens are documented here, not hidden by the scan. */
const EXCLUDED: Record<string, string> = {};
EXCLUDED["/_settings-handlers"] =
  "Helper module imported by the settings tab; it is not an Expo Router screen.";

function routeFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(absolute);
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name === "_layout.tsx") return [];
    const relative = path.relative(APP_ROOT, absolute).split(path.sep).join("/");
    if (relative.startsWith("__test__/") || relative.startsWith("__fixtures__/")) return [];
    return [relative];
  });
}

function fileToRoute(relativeFile: string): string {
  const withoutExtension = relativeFile.replace(/\.(ts|tsx)$/, "");
  const segments = withoutExtension.split("/");
  const route = segments
    .filter((segment) => !/^\([^)]*\)$/.test(segment))
    .map((segment) => (segment === "index" ? "" : segment.startsWith("[") ? "[id]" : segment));
  const joined = route.filter(Boolean).join("/");
  return joined ? `/${joined.replace(/\/$/, "")}` : "/";
}

test("every app route file is registered or explicitly excluded", () => {
  const registered = [...ALL_SCREENS, ...ONBOARDING_SCREENS].map((screen) => screen.path);
  const missing = routeFiles(APP_ROOT).filter((file) => {
    const route = fileToRoute(file);
    const matchesRegistry = registered.some((registeredRoute) => {
      const routeSegments = route.split("/");
      const registeredSegments = registeredRoute.split("/");
      return (
        routeSegments.length === registeredSegments.length &&
        routeSegments.every(
          (segment, index) => segment === "[id]" || segment === registeredSegments[index],
        )
      );
    });
    return !matchesRegistry && !(route in EXCLUDED);
  });

  expect(missing).toEqual([]);
  for (const [route, reason] of Object.entries(EXCLUDED)) {
    expect(`${route}: ${reason.trim()}`).not.toBe(`${route}: `);
  }
});
