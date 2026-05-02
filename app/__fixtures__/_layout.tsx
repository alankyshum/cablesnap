/**
 * Dev-only Stack layout for `/__fixtures__/*` visual-regression fixture routes.
 *
 * Mirrors the `app/__test__/_layout.tsx` pattern. Child fixture routes (e.g.
 * `bld-480-prefix.tsx`) render `null` in production via `__DEV__` guards, so
 * even if the route is reached in a prod bundle the tree is empty.
 *
 * The directory is named `__fixtures__` (not `__test__`) so the two harnesses
 * stay independently discoverable: `__test__` hosts component-isolation
 * harnesses (e.g. SessionHeaderToolbar), `__fixtures__` hosts known-buggy
 * regression-catcher fixtures (e.g. BLD-480 pre-fix).
 *
 * Refs: BLD-951.
 */
import { Stack } from "expo-router";

export default function FixturesLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
