/**
 * BLD-1176: Settings → Help screen for advanced set types.
 * Copy is descriptive only — no aspirational language.
 * See `__tests__/help-copy-tone.test.ts` for tone enforcement.
 */
import { useCallback, useEffect, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Stack } from "expo-router";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { spacing, fontSizes } from "@/constants/design-tokens";
import { useLingui } from "@lingui/react/macro";

/** Height (px) of the bottom fade gradient hinting at scrollable content below the fold. */
const BOTTOM_FADE_HEIGHT = 40;

/**
 * Pure predicate for whether the bottom scroll-affordance fade should be shown.
 *
 * The fade is visible only when the content overflows the visible scroll
 * viewport AND the user has not yet scrolled to the bottom. A 1px slack absorbs
 * floating-point rounding at the boundary so the fade reliably disappears at the
 * true end of the list.
 *
 * On web the production ScrollView omits `flex: 1` (BLD-1261), so its rendered
 * height equals the full content height; there `contentHeight ≈ layoutHeight`
 * and this predicate returns false — no false affordance, and the BLD-1261
 * fullPage screenshot capture is unaffected.
 *
 * @param scrollY      Current vertical scroll offset (contentOffset.y).
 * @param layoutHeight Height of the visible scroll viewport (layoutMeasurement.height).
 * @param contentHeight Total scrollable content height (contentSize.height).
 */
export function isBottomFadeVisible(
  scrollY: number,
  layoutHeight: number,
  contentHeight: number,
): boolean {
  if (layoutHeight <= 0 || contentHeight <= 0) return false;
  const overflows = contentHeight > layoutHeight + 1;
  const atBottom = scrollY + layoutHeight >= contentHeight - 1;
  return overflows && !atBottom;
}

/** Intro paragraph rendered above the help cards. Exported for copy-tone test coverage. */
export const ADVANCED_SET_INTRO =
  "Advanced set types let you log structured multi-burst sets as a single parent with ordered mini-sets. Each mini-set records its own reps, optional weight, and rest duration.";

/** Footer note rendered below the help cards. Exported for copy-tone test coverage. */
export const ADVANCED_SET_FOOTER =
  "Each parent set supports up to 8 mini-sets. To log more than 8 bursts, use a separate set.";

export const ADVANCED_SET_HELP_ENTRIES = [
  {
    setType: "rest_pause" as const,
    title: "Rest-pause",
    description:
        "Rest 10–20 seconds mid-set, then continue with the same load until your target total reps. Each burst is logged as a mini-set.",
    example: "Example: 8 reps, rest 15 s, 3 reps, rest 15 s, 2 reps → parent shows 13 reps.",
  },
  {
    setType: "cluster" as const,
    title: "Cluster",
    description:
        "Rest 30–60 seconds between mini-sets to maintain a heavy load across all reps. Each cluster is logged separately.",
    example: "Example: 5 reps @ 100 kg, rest 45 s, 5 reps @ 100 kg, rest 45 s, 4 reps @ 95 kg.",
  },
  {
    setType: "myo_reps" as const,
    title: "Myo-reps",
    description:
        "An activation set of 10–20 reps followed by short 5-second rests for additional small clusters of 3–5 reps.",
    example: "Example: 15-rep activation, then 5, 5, 4, 3 — each mini-cluster logged as its own segment.",
  },
] as const;

export default function AdvancedSetsHelpScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const { t } = useLingui();
  const intro = t({ id: "settings.advancedSets.intro", message: "Advanced set types let you log structured multi-burst sets as a single parent with ordered mini-sets. Each mini-set records its own reps, optional weight, and rest duration." });
  const footer = t({ id: "settings.advancedSets.footer", message: "Each parent set supports up to 8 mini-sets. To log more than 8 bursts, use a separate set." });
  const helpEntries = [
    {
      setType: "rest_pause" as const,
      title: t({ id: "settings.advancedSets.restPause.title", message: "Rest-pause" }),
      description: t({ id: "settings.advancedSets.restPause.description", message: "Rest 10–20 seconds mid-set, then continue with the same load until your target total reps. Each burst is logged as a mini-set." }),
      example: t({ id: "settings.advancedSets.restPause.example", message: "Example: 8 reps, rest 15 s, 3 reps, rest 15 s, 2 reps → parent shows 13 reps." }),
    },
    {
      setType: "cluster" as const,
      title: t({ id: "settings.advancedSets.cluster.title", message: "Cluster" }),
      description: t({ id: "settings.advancedSets.cluster.description", message: "Rest 30–60 seconds between mini-sets to maintain a heavy load across all reps. Each cluster is logged separately." }),
      example: t({ id: "settings.advancedSets.cluster.example", message: "Example: 5 reps @ 100 kg, rest 45 s, 5 reps @ 100 kg, rest 45 s, 4 reps @ 95 kg." }),
    },
    {
      setType: "myo_reps" as const,
      title: t({ id: "settings.advancedSets.myoReps.title", message: "Myo-reps" }),
      description: t({ id: "settings.advancedSets.myoReps.description", message: "An activation set of 10–20 reps followed by short 5-second rests for additional small clusters of 3–5 reps." }),
      example: t({ id: "settings.advancedSets.myoReps.example", message: "Example: 15-rep activation, then 5, 5, 4, 3 — each mini-cluster logged as its own segment." }),
    },
  ];

  // Scroll-affordance state: track viewport vs. content height and scroll
  // offset so the bottom fade hints that more content exists below the fold
  // at narrow viewports (e.g. 320×640) where the last section is clipped.
  const [scrollY, setScrollY] = useState(0);
  const [layoutHeight, setLayoutHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setScrollY(e.nativeEvent.contentOffset.y);
  }, []);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setLayoutHeight(e.nativeEvent.layout.height);
  }, []);

  const onContentSizeChange = useCallback((_w: number, h: number) => {
    setContentHeight(h);
  }, []);

  const bottomFadeVisible = isBottomFadeVisible(scrollY, layoutHeight, contentHeight);

  // Signal readiness for Playwright fullPage screenshots (dev/web only).
  // Combined with the web flex guard below, this lets the e2e spec wait on
  // `body[data-test-ready='true']` before capturing the production route.
  useEffect(() => {
    if (!__DEV__ || Platform.OS !== "web") return;
    if (typeof document !== "undefined" && document.body) {
      document.body.dataset.testReady = "true";
    }
  }, []);

  return (
    // Outer wrapper is the positioning context for the bottom fade overlay.
    // On native it fills the screen (flex: 1); on web it grows with content so
    // the BLD-1261 document-height invariant for fullPage capture is preserved.
    <View
      style={[
        Platform.OS !== "web" ? styles.fill : null,
        { backgroundColor: colors.background },
      ]}
    >
      <ScrollView
        // BLD-1261: on web, omit flex: 1 so the HTML document height equals
        // content height — Playwright's fullPage screenshots then capture every
        // entry at narrow viewports (390 px) where the Myo-reps description
        // wraps to more lines and total content exceeds 844 px.
        // On native: keep flex: 1 for the standard screen-filling scroll layout.
        style={Platform.OS !== "web" ? styles.fill : undefined}
        contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
      >
         <Stack.Screen options={{ title: t({ id: "settings.advancedSets.title", message: "Advanced Set Types" }) }} />

        <Text variant="body" style={[styles.intro, { color: colors.onSurface }]}>
          {intro}
        </Text>

        {helpEntries.map((entry, index) => (
          <View key={entry.setType}>
            {index > 0 && <Separator style={styles.separator} />}
            <Card style={styles.card}>
              <CardContent>
                <Text variant="subtitle" style={[styles.title, { color: colors.onSurface }]}>
                  {entry.title}
                </Text>
                <Text variant="body" style={[styles.description, { color: colors.onSurface }]}>
                  {entry.description}
                </Text>
                <Text variant="caption" style={[styles.example, { color: colors.onSurfaceVariant }]}>
                  {entry.example}
                </Text>
              </CardContent>
            </Card>
          </View>
        ))}

        <Text variant="caption" style={[styles.note, { color: colors.onSurfaceVariant }]}>
          {footer}
        </Text>
      </ScrollView>

      {/* Bottom fade scroll affordance — overlays the lower edge of the scroll
          viewport to signal "more content below" when the last section
          (Myo-reps) is clipped at narrow viewports. Hidden once scrolled to the
          end, and never shown when content already fits (BLD-1916). */}
      {bottomFadeVisible && (
        <View
          pointerEvents="none"
          style={[styles.bottomFade, { height: BOTTOM_FADE_HEIGHT }]}
          testID="advanced-sets-bottom-fade"
        >
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="advancedSetsBottomFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.background} stopOpacity="0" />
                <Stop offset="1" stopColor={colors.background} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#advancedSetsBottomFade)" />
          </Svg>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.xxxl,
    gap: spacing.sm,
  },
  intro: {
    marginBottom: spacing.xs,
  },
  card: {
    marginBottom: 0,
  },
  separator: {
    marginVertical: spacing.xs,
  },
  title: {
    fontSize: fontSizes.base,
    fontWeight: "600",
    marginBottom: spacing.xxs,
  },
  description: {
    marginBottom: spacing.xxs,
  },
  example: {
    fontStyle: "italic",
  },
  note: {
    marginTop: spacing.xs,
    textAlign: "center",
  },
  bottomFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
