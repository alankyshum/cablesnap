import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { TrendingUp } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  onStart?: () => void;
};

export default function WorkoutEmptyState({ onStart }: Props) {
  const colors = useThemeColors();
  const router = useRouter();

  const handleStart = () => {
    if (onStart) {
      onStart();
      return;
    }
    router.push("/");
  };

  return (
    <View
      style={styles.container}
      accessibilityLabel="No workouts logged yet"
      testID="progress-workouts-empty"
    >
      <View
        style={[
          styles.iconCircle,
          { backgroundColor: colors.surfaceVariant ?? colors.surface },
        ]}
      >
        <TrendingUp size={40} color={colors.onSurfaceVariant} strokeWidth={1.5} />
      </View>
      <Text
        style={[
          styles.headline,
          { color: colors.onSurface, fontSize: fontSizes.lg },
        ]}
      >
        Track your progress
      </Text>
      <Text
        style={[styles.description, { color: colors.onSurfaceVariant }]}
      >
        Complete your first workout to see sessions, PRs, and weekly trends here.
      </Text>
      <Button
        variant="default"
        onPress={handleStart}
        accessibilityLabel="Start your first workout"
        label="Start a workout"
        style={styles.cta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 24,
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  headline: {
    fontWeight: "600",
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    maxWidth: 320,
  },
  cta: {
    marginTop: 8,
    minWidth: 180,
  },
});
