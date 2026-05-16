/**
 * Dev-only visual-regression harness for the Advanced Set Types help screen.
 *
 * Renders all help content in a plain `View` (not a bounded `ScrollView`) so
 * Playwright's `fullPage: true` screenshots can capture every entry regardless
 * of viewport width. On narrow viewports (390 px) the Myo-reps description
 * text wraps to more lines and the total content height exceeds 844 px; the
 * production route wraps content in a `ScrollView` whose interior overflow is
 * not captured by `fullPage: true` at the HTML-document level, causing audit
 * screenshots to appear truncated (BLD-1261).
 *
 * Guards (both must hold — any false => component renders `null`):
 *   1. `__DEV__ === true`    (not a prod build)
 *   2. `Platform.OS === "web"`  (native targets never mount)
 *
 * Bundle hygiene: all references to harness symbols are inside `if (__DEV__)`
 * branches. Metro constant-folds `__DEV__` to `false` in production and strips
 * the branches, so nothing from this file appears in the prod web bundle.
 *
 * Refs: BLD-1261.
 */
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { spacing, fontSizes } from "@/constants/design-tokens";
import {
  ADVANCED_SET_INTRO,
  ADVANCED_SET_FOOTER,
  ADVANCED_SET_HELP_ENTRIES,
} from "@/app/settings/advanced-sets";

export default function AdvancedSetsHelpHarness() {
  const colors = useThemeColors();
  const layout = useLayout();

  useEffect(() => {
    if (__DEV__) {
      if (Platform.OS !== "web") return;
      if (typeof document !== "undefined" && document.body) {
        document.body.dataset.testReady = "true";
      }
    }
  }, []);

  if (!__DEV__) return null;
  if (Platform.OS !== "web") return null;

  return (
    // Plain View (not ScrollView) so the HTML document height grows with
    // content — fullPage screenshots capture all entries at any viewport width.
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding },
      ]}
    >
      <Text variant="body" style={[styles.intro, { color: colors.onSurface }]}>
        {ADVANCED_SET_INTRO}
      </Text>

      {ADVANCED_SET_HELP_ENTRIES.map((entry, index) => (
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
              <Text
                variant="caption"
                style={[styles.example, { color: colors.onSurfaceVariant }]}
              >
                {entry.example}
              </Text>
            </CardContent>
          </Card>
        </View>
      ))}

      <Text variant="caption" style={[styles.note, { color: colors.onSurfaceVariant }]}>
        {ADVANCED_SET_FOOTER}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
});
