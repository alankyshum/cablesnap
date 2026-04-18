import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { radii } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { BuiltinFood } from "../lib/types";
import type { ParsedFood } from "../lib/openfoodfacts";
import type { SearchResult } from "@/hooks/useFoodSearch";

type Props = {
  item: SearchResult;
  index: number;
  expandedKey: string | null;
  multiplier: string;
  mult: number;
  validMult: boolean;
  saveFav: boolean;
  saving: boolean;
  onExpand: (key: string) => void;
  onSetMultiplier: (v: string) => void;
  onToggleFav: () => void;
  onLogLocal: (food: BuiltinFood) => void;
  onLogOnline: (food: ParsedFood) => void;
};

export default function FoodResultItem({
  item, index, expandedKey, multiplier, mult, validMult,
  saveFav, saving, onExpand, onSetMultiplier, onToggleFav, onLogLocal, onLogOnline,
}: Props) {
  const colors = useThemeColors();
  const isLocal = item.type === "local";
  const food = item.food;
  const key = isLocal ? `local-${(food as BuiltinFood).id}` : `online-${food.name}-${food.calories}-${index}`;
  const isOpen = expandedKey === key;
  const serving = isLocal ? (food as BuiltinFood).serving : (food as ParsedFood).servingLabel;
  const scaled = {
    calories: (food.calories * mult).toFixed(0),
    protein: (food.protein * mult).toFixed(1),
    carbs: (food.carbs * mult).toFixed(1),
    fat: (food.fat * mult).toFixed(1),
  };

  return (
    <Pressable
      style={[styles.resultItem, { backgroundColor: colors.surfaceVariant }]}
      onPress={() => onExpand(key)}
      disabled={saving}
      accessibilityLabel={`${food.name}, ${food.calories} calories per ${serving}`}
      accessibilityState={{ expanded: isOpen }}
      role="button"
    >
      <Text variant="body" numberOfLines={isLocal ? 1 : 2} style={{ color: colors.onSurface }}>
        {food.name}
      </Text>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
        {food.calories} cal · {food.protein}p · {food.carbs}c · {food.fat}f{!isLocal ? ` · per ${serving}` : ""}
      </Text>
      {isOpen && (
        <View style={[styles.detailView, { borderTopColor: colors.outlineVariant }]}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
            Serving multiplier
          </Text>
          <View style={styles.multChips}>
            {[0.5, 1, 1.5, 2].map((v) => (
              <Chip
                key={v}
                selected={multiplier === String(v)}
                onPress={() => onSetMultiplier(String(v))}
                style={styles.multChip}
                accessibilityLabel={`${v}x serving`}
                role="button"
                accessibilityState={{ selected: multiplier === String(v) }}
              >
                {`${v}x`}
              </Chip>
            ))}
          </View>
          <Input
            variant="outline"
            value={multiplier}
            onChangeText={onSetMultiplier}
            keyboardType="numeric"
            containerStyle={styles.multInput}
            accessibilityLabel="Serving multiplier"
          />
          {validMult && (
            <Text variant="caption" style={[styles.scaledMacros, { color: colors.onSurfaceVariant }]}>
              {scaled.calories} cal · {scaled.protein}p · {scaled.carbs}c · {scaled.fat}f
            </Text>
          )}
          <Chip
            selected={saveFav}
            onPress={onToggleFav}
            style={styles.favToggleChip}
            accessibilityLabel={saveFav ? "Remove from favorites" : "Save as favorite"}
            role="button"
            accessibilityState={{ selected: saveFav }}
          >
            ★ Save as favorite
          </Chip>
          <Button
            variant="default"
            onPress={() => isLocal ? onLogLocal(food as BuiltinFood) : onLogOnline(food as ParsedFood)}
            loading={saving}
            disabled={saving || !validMult}
            accessibilityLabel="Log food"
          >
            Log Food
          </Button>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  resultItem: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: radii.sm, marginBottom: 4 },
  detailView: { marginTop: 8, paddingTop: 8, borderTopWidth: 1 },
  multChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  multChip: { marginRight: 0 },
  multInput: { marginBottom: 8 },
  scaledMacros: { marginBottom: 8 },
  favToggleChip: { marginBottom: 12, alignSelf: "flex-start" },
});
