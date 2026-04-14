import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, Text, useTheme } from "react-native-paper";

type Props = {
  title: string;
  action?: string;
  onAction?: () => void;
};

export default function SectionHeader({ title, action, onAction }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
        {title}
      </Text>
      {action && onAction ? (
        <Button compact mode="text" onPress={onAction}>
          {action}
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
});
