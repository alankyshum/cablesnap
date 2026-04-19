import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { SET_TYPE_CYCLE, SET_TYPE_LABELS } from "../../lib/types";
import type { SetType } from "../../lib/types";
import type { ExerciseGroup } from "./types";
import { fontSizes } from "@/constants/design-tokens";

type SetTypeSheetProps = {
  setId: string;
  groups: ExerciseGroup[];
  onSelect: (type: SetType) => void;
  onDismiss: () => void;
};

export function SetTypeSheet({ setId, groups, onSelect, onDismiss }: SetTypeSheetProps) {
  const colors = useThemeColors();

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.setTypeOverlay]}
      onPress={onDismiss}
    >
      <View style={[styles.setTypeSheet, { backgroundColor: colors.surface }]}>
        <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>
          Set Type
        </Text>
        {SET_TYPE_CYCLE.map((type) => {
          const label = SET_TYPE_LABELS[type];
          const isSelected = (() => {
            for (const g of groups) {
              for (const s of g.sets) {
                if (s.id === setId) return s.set_type === type;
              }
            }
            return false;
          })();
          return (
            <Pressable
              key={type}
              style={[
                styles.setTypeOption,
                { backgroundColor: isSelected ? colors.primaryContainer : "transparent" },
              ]}
              onPress={() => onSelect(type)}
              accessibilityRole="button"
              accessibilityLabel={`${label.label} set`}
              accessibilityState={{ selected: isSelected }}
            >
              {label.short ? (
                <View style={[styles.setTypeChipPreview, {
                  backgroundColor: type === "warmup" ? colors.surfaceVariant
                    : type === "dropset" ? colors.tertiaryContainer
                    : type === "failure" ? colors.errorContainer
                    : colors.surfaceDisabled,
                }]}>
                  <Text style={{
                    fontSize: fontSizes.sm, fontWeight: "700",
                    color: type === "warmup" ? colors.onSurfaceVariant
                      : type === "dropset" ? colors.onTertiaryContainer
                      : colors.onErrorContainer,
                  }}>{label.short}</Text>
                </View>
              ) : (
                <View style={[styles.setTypeChipPreview, { backgroundColor: colors.surfaceDisabled }]}>
                  <Text style={{ fontSize: fontSizes.sm, fontWeight: "700", color: colors.onSurface }}>—</Text>
                </View>
              )}
              <Text variant="body" style={{ color: colors.onSurface, marginLeft: 12 }}>
                {label.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  setTypeOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  setTypeSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 32,
  },
  setTypeOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  setTypeChipPreview: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
