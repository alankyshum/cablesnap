import React from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Svg, { Path } from "react-native-svg";
import type { MuscleGroup } from "../lib/types";
import { MUSCLE_LABELS } from "../lib/types";
import { muscle } from "../constants/theme";
import {
  BODY_OUTLINE_FRONT,
  BODY_OUTLINE_REAR,
  FRONT_PATHS,
  REAR_PATHS,
  ALL_MUSCLES,
} from "./muscle-paths";

type Props = {
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  width?: number;
};

function colors(isDark: boolean) {
  return isDark ? muscle.dark : muscle.light;
}

function role(
  group: MuscleGroup,
  primary: MuscleGroup[],
  secondary: MuscleGroup[]
): "primary" | "secondary" | "inactive" {
  const expanded = primary.includes("full_body") ? ALL_MUSCLES : primary;
  if (expanded.includes(group)) return "primary";
  if (secondary.includes(group)) return "secondary";
  return "inactive";
}

function fill(r: "primary" | "secondary" | "inactive", c: ReturnType<typeof colors>) {
  if (r === "primary") return c.primary;
  if (r === "secondary") return c.secondary;
  return c.inactive;
}

function opacity(r: "primary" | "secondary" | "inactive") {
  if (r === "primary") return 0.7;
  if (r === "secondary") return 0.5;
  return 0.15;
}

function stroke(r: "primary" | "secondary" | "inactive", c: ReturnType<typeof colors>) {
  if (r === "primary") return { width: 2, dash: "" };
  if (r === "secondary") return { width: 1, dash: "4,3" };
  return { width: 1, dash: "" };
}

function BodyView({
  paths,
  outline,
  primary,
  secondary,
  size,
  label,
  isDark,
}: {
  paths: Partial<Record<MuscleGroup, string[]>>;
  outline: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  size: number;
  label: string;
  isDark: boolean;
}) {
  const c = colors(isDark);
  const height = size * 2.5;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{ width: size, height }}
    >
      <Svg width={size} height={height} viewBox="0 0 200 500">
        <Path
          d={outline}
          fill="none"
          stroke={c.outline}
          strokeWidth={1.5}
          fillRule="evenodd"
        />
        {(Object.entries(paths) as [MuscleGroup, string[]][]).map(([group, ds]) => {
          const r = role(group, primary, secondary);
          const s = stroke(r, c);
          return ds.map((d, i) => (
            <Path
              key={`${group}-${i}`}
              d={d}
              fill={fill(r, c)}
              fillOpacity={opacity(r)}
              stroke={fill(r, c)}
              strokeWidth={s.width}
              strokeDasharray={s.dash || undefined}
              accessibilityLabel={
                r !== "inactive"
                  ? `${r === "primary" ? "Primary" : "Secondary"} muscle: ${MUSCLE_LABELS[group]}`
                  : undefined
              }
            />
          ));
        })}
      </Svg>
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
  const c = colors(isDark);
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
          <View style={[styles.dot, { backgroundColor: c.secondary, borderStyle: "dashed", borderWidth: 1, borderColor: c.secondary }]} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurface }}>
            <Text style={{ fontWeight: "700" }}>Secondary: </Text>
            {names(secondary)}
          </Text>
        </View>
      )}
    </View>
  );
}

function MuscleMapInner({ primary, secondary, width: w }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;
  const total = w ?? 280;
  const narrow = total < 300;
  const size = narrow ? Math.min(total - 16, 160) : Math.floor((total - 24) / 2);

  const labels = (list: MuscleGroup[]) =>
    list.map((m) => MUSCLE_LABELS[m]).join(", ");

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
      <View style={narrow ? styles.vertical : styles.horizontal}>
        <BodyView
          paths={FRONT_PATHS}
          outline={BODY_OUTLINE_FRONT}
          primary={primary}
          secondary={secondary}
          size={size}
          label="Front view"
          isDark={isDark}
        />
        <BodyView
          paths={REAR_PATHS}
          outline={BODY_OUTLINE_REAR}
          primary={primary}
          secondary={secondary}
          size={size}
          label="Rear view"
          isDark={isDark}
        />
      </View>
      <Legend primary={primary} secondary={secondary} isDark={isDark} />
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
    gap: 12,
  },
  vertical: {
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
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
    borderRadius: 6,
  },
});
