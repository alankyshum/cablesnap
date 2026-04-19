import React from "react";
import { FlatList, StyleSheet } from "react-native";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import type { Meal } from "@/lib/types";
import { MEALS, MEAL_LABELS } from "@/lib/types";
import type { FoodEntry } from "@/lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  meal: Meal;
  onMealChange: (m: Meal) => void;
  favorites: FoodEntry[];
  saving: boolean;
  onLogFavorite: (f: FoodEntry) => void;
};

export function MealFavoritesBar({ meal, onMealChange, favorites, saving, onLogFavorite }: Props) {
  const colors = useThemeColors();
  return (
    <>
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.mealRow}
        data={MEALS}
        keyExtractor={(m) => m}
        renderItem={({ item: m }) => (
          <Chip
            selected={meal === m}
            onPress={() => onMealChange(m)}
            style={styles.mealChip}
            accessibilityLabel={`Meal: ${MEAL_LABELS[m]}`}
            role="button"
            accessibilityState={{ selected: meal === m }}
          >
            {MEAL_LABELS[m]}
          </Chip>
        )}
      />
      {favorites.length > 0 ? (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.favRow}
          contentContainerStyle={styles.favRowContent}
          data={favorites}
          keyExtractor={(f) => f.id}
          renderItem={({ item: f }) => (
            <Chip
              onPress={() => onLogFavorite(f)}
              style={styles.favChip}
              disabled={saving}
              accessibilityLabel={`Quick log ${f.name}`}
              role="button"
            >
              {f.name}
            </Chip>
          )}
        />
      ) : (
        <Text variant="caption" style={[styles.favHint, { color: colors.onSurfaceVariant }]}>
          ★ Star foods to add them here
        </Text>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  mealRow: { marginBottom: 8 },
  mealChip: { marginRight: 6 },
  favRow: { marginBottom: 8 },
  favRowContent: { gap: 6 },
  favChip: { marginRight: 0 },
  favHint: { marginBottom: 8, fontStyle: "italic" },
});
