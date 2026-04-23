/**
 * Dev-only Stack layout for `/__test__/*` visual-regression harness routes.
 *
 * Renders a plain `Stack`. Child harness routes (`rest-toolbar.tsx`) render
 * `null` in production via `__DEV__` guards, so even if the route is reached
 * in a prod bundle the tree is empty.
 *
 * Refs: BLD-535.
 */
import { Stack } from "expo-router";

export default function TestLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
