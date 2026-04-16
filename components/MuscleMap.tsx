import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Body, { type Slug, type ExtendedBodyPart } from "react-native-body-highlighter";
import type { MuscleGroup } from "../lib/types";
import { MUSCLE_LABELS } from "../lib/types";
import { muscle } from "../constants/theme";
import { radii } from "../constants/design-tokens";

type Props = {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  width?: number;
  gender?: "male" | "female";
};

const SLUG_MAP: Record<MuscleGroup, Slug[]> = {
  chest: ["chest"],
  back: ["upper-back", "lower-back"],
  shoulders: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
  core: ["abs", "obliques"],
  forearms: ["forearm"],
  traps: ["trapezius"],
  lats: ["upper-back"],
  full_body: [
    "chest", "biceps", "abs", "obliques", "quadriceps", "deltoids",
    "trapezius", "triceps", "forearm", "calves", "hamstring", "gluteal",
    "upper-back", "lower-back", "adductors",
  ],
};

function buildData(
  groups: MuscleGroup[],
  intensity: number,
): ExtendedBodyPart[] {
  const seen = new Set<Slug>();
  const result: ExtendedBodyPart[] = [];
  for (const g of groups) {
    const slugs = SLUG_MAP[g] ?? [];
    for (const s of slugs) {
      if (!seen.has(s)) {
        seen.add(s);
        result.push({ slug: s, intensity });
      }
    }
  }
  return result;
}

function MuscleMapInner({ primary, secondary, width: w, gender = "male" }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const c = isDark ? muscle.dark : muscle.light;
  const total = w ?? 280;
  const scale = Math.min((total - 8) / 400, 1.2);

  const data = [
    ...buildData(primary, 2),
    ...buildData(secondary, 1),
  ];

  const labels = (list: MuscleGroup[]) =>
    list.filter((m) => m !== "full_body").map((m) => MUSCLE_LABELS[m]).join(", ");

  const summary = [
    primary.length > 0 ? `primary muscles: ${labels(primary)}` : "",
    secondary.length > 0 ? `secondary muscles: ${labels(secondary)}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const acc = summary
    ? `Muscle diagram showing ${summary}`
    : "Muscle diagram with no muscle data";

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={acc}
      style={styles.container}
    >
      <View style={styles.horizontal}>
        <Body
          data={data}
          gender={gender}
          side="front"
          scale={scale}
          colors={[c.secondary, c.primary]}
          border={isDark ? muscle.dark.outline : muscle.light.outline}
        />
        <Body
          data={data}
          gender={gender}
          side="back"
          scale={scale}
          colors={[c.secondary, c.primary]}
          border={isDark ? muscle.dark.outline : muscle.light.outline}
        />
      </View>
      <Legend primary={primary} secondary={secondary} isDark={isDark} />
    </View>
  );
}

function Legend({
  primary,
  secondary,
  isDark,
}: {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  isDark: boolean;
}) {
  const theme = useTheme();
  const c = isDark ? muscle.dark : muscle.light;
  const names = (list: MuscleGroup[]) =>
    list.filter((m) => m !== "full_body").map((m) => MUSCLE_LABELS[m]).join(", ");

  if (primary.length === 0) {
    return (
      <Text
        variant="bodySmall"
        style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", marginTop: 8 }}
      >
        No muscle data
      </Text>
    );
  }

  const label = primary.includes("full_body") ? "Full Body" : names(primary);

  return (
    <View style={styles.legend}>
      <View style={styles.row}>
        <View style={[styles.dot, { backgroundColor: c.primary }]} />
        <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
          <Text style={{ fontWeight: "700" }}>Primary: </Text>
          {label}
        </Text>
      </View>
      {secondary.length > 0 && (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: c.secondary }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            <Text style={{ fontWeight: "700" }}>Secondary: </Text>
            {names(secondary)}
          </Text>
        </View>
      )}
    </View>
  );
}

export const MuscleMap = React.memo(MuscleMapInner);

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 8,
  },
  horizontal: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  legend: {
    marginTop: 12,
    gap: 6,
    alignSelf: "stretch",
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: radii.md,
  },
});
