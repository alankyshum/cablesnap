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
        style={[styles.description, { color: `${colors.onSurface}CC` }]}
      >
        Complete your first workout to see sessions, PRs, and weekly trends here.
      </Text>
      {/*
       * CVD a11y (BLD-2729): the `default` variant's background relies on
       * `primary` color which shifts to yellow-olive under protanopia /
       * deuteranopia, losing primary-action signal.  A visible border in
       * `onSurface` color at 35% opacity adds a non-hue-dependent affordance
       * cue (shape outline) that remains legible in any CVD mode and in
       * grayscale.  The border weight (1.5px) stays subtle enough not to
       * clash with the filled-button visual language.
       */}
      <View
        testID="progress-empty-cta"
        style={[
          styles.cta,
          {
            borderWidth: 1.5,
            borderColor: `${colors.onSurface}59`,
            borderRadius: 9999,
          },
        ]}
      >
        <Button
          variant="default"
          onPress={handleStart}
          accessibilityLabel="Start your first workout"
          label="Start a workout"
        />
      </View>
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
