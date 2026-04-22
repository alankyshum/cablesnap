import React from "react";
import { StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  error: string;
  onRetry: () => void;
};

export default function PRDashboardError({ error, onRetry }: Props) {
  const colors = useThemeColors();
  return (
    <View
      testID="pr-dashboard-error"
      style={styles.container}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <MaterialCommunityIcons
        name="alert-circle-outline"
        size={48}
        color={colors.error}
      />
      <Text
        variant="subtitle"
        style={[styles.title, { color: colors.onSurface }]}
      >
        Couldn&apos;t load your records
      </Text>
      <Text
        variant="body"
        style={[styles.subtitle, { color: colors.onSurfaceVariant }]}
      >
        Something went wrong while loading your personal records. Please try
        again.
      </Text>
      <Text
        variant="caption"
        style={[styles.detail, { color: colors.onSurfaceVariant }]}
        numberOfLines={2}
      >
        {error}
      </Text>
      <Button
        variant="default"
        onPress={onRetry}
        style={styles.button}
        accessibilityLabel="Retry loading records"
      >
        Retry
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 12,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 4,
    textAlign: "center",
  },
  detail: {
    marginTop: 8,
    textAlign: "center",
    opacity: 0.7,
  },
  button: {
    marginTop: 16,
  },
});
