import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  icon: string;
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    onPress: () => void;
  };
};

export default function EmptyState({ icon, title, subtitle, action }: Props) {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={icon as never}
        size={48}
        color={colors.onSurfaceVariant}
      />
      <Text
        variant="subtitle"
        style={[styles.title, { color: colors.onSurface, fontSize: 17 }]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          variant="body"
          style={[styles.subtitle, { color: colors.onSurfaceVariant }]}
        >
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <Button variant="default" onPress={action.onPress} style={styles.button}>{action.label}</Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
  button: {
    marginTop: 16,
  },
});
