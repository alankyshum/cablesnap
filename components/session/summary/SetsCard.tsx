import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import type { WorkoutSet } from "@/lib/types";
import type { ThemeColors } from "@/hooks/useThemeColors";

type SetGroup = {
  name: string;
  sets: (WorkoutSet & { exercise_name?: string })[];
};

type Props = {
  grouped: SetGroup[];
  colors: ThemeColors;
};

export default function SetsCard({ grouped, colors }: Props) {
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
        {grouped.map((group) => (
          <View key={group.name} style={styles.exerciseGroup}>
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
                    RPE {set.rpe}
                  </Text>
                )}
              </View>
            ))}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  exerciseGroup: { marginBottom: 8 },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
    paddingLeft: 8,
  },
});
