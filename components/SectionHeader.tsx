import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  title: string;
  action?: string;
  onAction?: () => void;
};

export default function SectionHeader({ title, action, onAction }: Props) {
  const colors = useThemeColors();
  return (
    <View style={styles.container}>
      <Text variant="subtitle" style={{ color: colors.onSurface, fontSize: 17, fontWeight: "600" }}>
        {title}
      </Text>
      {action && onAction ? (
        <Button variant="ghost" size="sm" onPress={onAction}>{action}</Button>
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
