import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { WorkoutSet } from "@/lib/types";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { formatIntensity } from "@/lib/intensity";
import { useIntensityMode } from "@/hooks/useIntensityMode";

type SetGroup = {
  name: string;
  sets: (WorkoutSet & { exercise_name?: string })[];
};

type Props = {
  grouped: SetGroup[];
  colors: ThemeColors;
};

export default function SetsCard({ grouped, colors }: Props) {
  // BLD-2701: Read intensity mode so set badges render in user's chosen unit.
  const intensityMode = useIntensityMode();
  return (
    <Card style={StyleSheet.flatten([styles.section, { backgroundColor: colors.surface }])}>
      <CardContent>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="dumbbell" size={20} color={colors.primary} />
          <Text
            variant="title"
            style={{ color: colors.onSurface, marginLeft: 8, fontWeight: "700" }}
          >
            Sets
          </Text>
        </View>
        <View style={styles.exerciseGroups}>
        {grouped.map((group) => (
          <View key={group.name}>
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}
            >
              {group.name}
            </Text>
            {group.sets.map((set) => (
              <View key={set.id} style={styles.setRow}>
                <Text variant="body" style={{ color: colors.onSurface }}>
                  {set.weight ?? 0} × {set.reps ?? 0}
                </Text>
                {set.tempo && (
                  <Text
                    variant="caption"
                    style={{ color: colors.onSurfaceVariant, marginLeft: 4 }}
                  >
                    ♩ {set.tempo}
                  </Text>
                )}
                {set.rpe != null && (
                  <Text
                    variant="caption"
                    style={{ color: colors.onSurfaceVariant, marginLeft: 4 }}
                  >
                    {formatIntensity(set.rpe, intensityMode)}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  // BLD-3660: Use `gap` on the wrapping container so spacing between exercise groups
  // is consistent and no trailing margin leaks past the last group.
  exerciseGroups: { gap: 8 },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingLeft: 8,
  },
});
