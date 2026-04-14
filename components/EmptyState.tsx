import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

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
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons
        name={icon as never}
        size={48}
        color={theme.colors.onSurfaceVariant}
      />
      <Text
        variant="titleMedium"
        style={[styles.title, { color: theme.colors.onSurface }]}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          {subtitle}
        </Text>
      ) : null}
      {action ? (
        <Button mode="contained" onPress={action.onPress} style={styles.button}>
          {action.label}
        </Button>
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
