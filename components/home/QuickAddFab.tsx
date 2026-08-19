import { t } from "@lingui/core/macro";
/**
 * BLD-1089: Floating Action Button for Quick Add (home screen).
 * AC1 — bottom-right, anchored above tab bar, 56dp tap target.
 */
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  bottomOffset: number;
  onPress: () => void;
};

export default function QuickAddFab({ bottomOffset, onPress }: Props) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: colors.primary,
          bottom: bottomOffset + 16,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      accessible
      accessibilityRole="button"
      accessibilityLabel={t({ id: "home.quickAdd.a11y", message: "Quick add a set, opens dialog" })}
      accessibilityHint={t({ id: "home.quickAdd.hint", message: "Opens a sheet to quickly log a set without starting a workout" })}
    >
      <View style={styles.fabInner}>
        <MaterialCommunityIcons name="plus" size={24} color={colors.onPrimary} />
        <Text style={[styles.fabLabel, { color: colors.onPrimary }]}>{t({ id: "home.quickAdd.label", message: "Quick Add" })}</Text>
      </View>
    </Pressable>
  );
}

const FAB_HEIGHT = 56;

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 16,
    height: FAB_HEIGHT,
    borderRadius: FAB_HEIGHT / 2,
    paddingHorizontal: 20,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  fabInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fabLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
});
