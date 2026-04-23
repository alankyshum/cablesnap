/**
 * Visual-regression harness for SessionHeaderToolbar's adaptive rest chip.
 *
 * This route exists purely to give the Playwright visual-regression spec
 * (e2e/rest-chip-visual.spec.ts) a stable mount point for the toolbar at
 * different viewport widths and breakdown states. It is NOT linked from any
 * production flow.
 *
 * Guards (all must hold — otherwise the route renders a blank view):
 *   1. `__DEV__ === true`                     — stripped from prod web bundle
 *   2. `Platform.OS === 'web'`                — native ignores
 *   3. `navigator.webdriver === true`         — only active under Playwright
 *
 * Guard #3 means a real user landing on `/e2e-rest-chip` sees an empty page,
 * never the harness. Mirrors the BLD-526 escape-hatch pattern for
 * `__E2E_EXERCISE_FIXTURE__` and the BLD-494 test-seed guards.
 *
 * Query params:
 *   ?mode=adaptive   → non-default breakdown with 3 tokens (triggers
 *                      `truncateChipLabel` at <360dp viewport widths)
 *   ?mode=default    → `isDefault: true` breakdown (chip suppressed)
 *
 * Refs: BLD-534 (this spec), BLD-531 / PR #322 (adaptive chip feature).
 */
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import { SessionHeaderToolbar } from "../components/session/SessionHeaderToolbar";
import type { RestBreakdown } from "../lib/rest";

function isHarnessEnabled(): boolean {
  if (!__DEV__) return false;
  if (Platform.OS !== "web") return false;
  if (typeof navigator === "undefined") return false;
  // Playwright sets navigator.webdriver = true automatically; console-injected
  // flags in a real user's browser cannot satisfy this.
  return navigator.webdriver === true;
}

const ADAPTIVE_BREAKDOWN: RestBreakdown = {
  totalSeconds: 60,
  baseSeconds: 90,
  factors: [
    { label: "Heavy", multiplier: 1.3, deltaSeconds: 27 },
    { label: "RPE 9", multiplier: 1.15, deltaSeconds: 18 },
    { label: "Cable", multiplier: 0.8, deltaSeconds: -27 },
  ],
  isDefault: false,
  // 3 tokens so <360dp viewport truncates to first 2 via truncateChipLabel.
  reasonShort: "Heavy · RPE 9 · Cable",
  reasonAccessible: "Heavy set at RPE 9 on cable equipment",
};

const DEFAULT_BREAKDOWN: RestBreakdown = {
  totalSeconds: 60,
  baseSeconds: 60,
  factors: [],
  isDefault: true,
  reasonShort: "",
  reasonAccessible: "",
};

export default function E2ERestChipHarness() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const colors = useThemeColors();
  const mode = params.mode === "default" ? "default" : "adaptive";

  if (!isHarnessEnabled()) {
    return (
      <View
        testID="e2e-rest-chip-disabled"
        style={[styles.root, { backgroundColor: colors.background }]}
      />
    );
  }

  const breakdown = mode === "default" ? DEFAULT_BREAKDOWN : ADAPTIVE_BREAKDOWN;

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background }]}
      testID="e2e-rest-chip-harness"
    >
      <View style={styles.toolbarWrap} testID="e2e-rest-chip-toolbar">
        <SessionHeaderToolbar
          rest={60}
          elapsed={1234}
          estimatedDuration={null}
          breakdown={breakdown}
          onStartRest={noop}
          onDismissRest={noop}
          onOpenToolbox={noop}
        />
      </View>
    </View>
  );
}

function noop() {}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 12,
  },
  toolbarWrap: {
    // Wrap the toolbar so the spec can locator.screenshot() just this region
    // and stay immune to unrelated changes elsewhere on the page.
    alignSelf: "flex-start",
  },
});
