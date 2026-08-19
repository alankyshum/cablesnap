import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

type Props = {
  value: string;
  onChange: (text: string) => void;
};

export function SearchAllInput({ value, onChange }: Props) {
  const colors = useThemeColors();
  return (
    <View style={styles.wrap}>
      <Input
        type="input"
        placeholder={t({ id: "components.substitution.search-all-input.placeholder", message: "Search all exercises…" })}
        placeholderTextColor={colors.onSurfaceVariant}
        value={value}
        onChangeText={onChange}
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={t({ id: "components.substitution.search-all-input.search-a11y", message: "Search all exercises" })}
        rightComponent={
          value.length > 0 ? (
            <Pressable
              onPress={() => onChange("")}
              accessibilityRole="button"
              accessibilityLabel={t({ id: "components.substitution.search-all-input.clear-a11y", message: "Clear search" })}
              hitSlop={8}
            >
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                ✕
              </Text>
            </Pressable>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
});
