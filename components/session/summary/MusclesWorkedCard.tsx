import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { MuscleMap } from "@/components/MuscleMap";
import { MUSCLE_LABELS } from "@/lib/types";
import type { MuscleGroup } from "@/lib/types";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { useProfileGender } from "@/lib/useProfileGender";
import ErrorBoundary from "@/components/ErrorBoundary";

type Props = {
  primaryMuscles: MuscleGroup[];
  secondaryMuscles: MuscleGroup[];
  colors: ThemeColors;
};

function MusclesWorkedCardInner({ primaryMuscles, secondaryMuscles, colors }: Props) {
  const gender = useProfileGender();

  const allMuscles = [...primaryMuscles, ...secondaryMuscles];
  const muscleNames = allMuscles
    .filter((m) => m !== "full_body")
    .map((m) => MUSCLE_LABELS[m])
    .join(", ");

  return (
    <Card
      style={StyleSheet.flatten([styles.section, { backgroundColor: colors.surface }])}
      accessibilityLabel={`Muscles worked: ${muscleNames}`}
    >
      <CardContent>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name="human-handsup" size={20} color={colors.primary} />
          <Text
            variant="title"
            style={{ color: colors.onSurface, marginLeft: 8, fontWeight: "700" }}
          >
            Muscles Worked
          </Text>
        </View>
        <View style={styles.mapContainer}>
          <MuscleMap
            primary={primaryMuscles}
            secondary={secondaryMuscles}
            gender={gender}
          />
        </View>
      </CardContent>
    </Card>
  );
}

export default function MusclesWorkedCard(props: Props) {
  return (
    <ErrorBoundary>
      <MusclesWorkedCardInner {...props} />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 16 },
  sectionHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  mapContainer: { maxHeight: 200 },
});
