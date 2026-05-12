/**
 * BLD-1176: Settings → Help screen for advanced set types.
 * Copy is descriptive only — no aspirational language.
 * See `__tests__/help-copy-tone.test.ts` for tone enforcement.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { spacing, fontSizes } from "@/constants/design-tokens";

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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
    >
      <Stack.Screen options={{ title: "Advanced Set Types" }} />

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
              <Text variant="caption" style={[styles.example, { color: colors.onSurfaceVariant }]}>
                {entry.example}
              </Text>
            </CardContent>
          </Card>
        </View>
      ))}

      <Text variant="caption" style={[styles.note, { color: colors.onSurfaceVariant }]}>
        {ADVANCED_SET_FOOTER}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingVertical: spacing.xs,
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
