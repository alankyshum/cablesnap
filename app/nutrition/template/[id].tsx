import { useCallback, useState } from "react";
import { StyleSheet, TouchableOpacity, View, FlatList } from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/ui/bna-toast";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  getMealTemplateById,
  updateMealTemplate,
  deleteMealTemplate,
} from "@/lib/db";
import type { MealTemplate, MealTemplateItem, Meal } from "@/lib/types";
import { MEALS, MEAL_LABELS } from "@/lib/types";

type ItemCardColors = {
  surface: string;
  onSurface: string;
  onSurfaceVariant: string;
  error: string;
};

function TemplateItemCard({
  item,
  colors,
  onUpdateServings,
  onRemove,
}: {
  item: MealTemplateItem;
  colors: ItemCardColors;
  onUpdateServings: (id: string, servings: number) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <Card style={[styles.itemCard, { backgroundColor: colors.surface }]}>
      <CardContent style={styles.itemRow}>
        <View style={{ flex: 1 }}>
          <Text variant="body" style={{ color: colors.onSurface }} numberOfLines={1}>
            {item.food?.name ?? "Unknown (deleted)"}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {Math.round((item.food?.calories ?? 0) * item.servings)} cal · {Math.round((item.food?.protein ?? 0) * item.servings)}p
          </Text>
        </View>
        <View style={styles.servingsControl}>
          <TouchableOpacity
            onPress={() => onUpdateServings(item.id, Math.round((item.servings - 0.5) * 10) / 10)}
            accessibilityLabel={`Decrease servings for ${item.food?.name ?? "item"}`}
            accessibilityRole="button"
            hitSlop={8}
            style={{ padding: 6, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <MaterialCommunityIcons name="minus" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
          <Text variant="body" style={{ color: colors.onSurface, minWidth: 30, textAlign: "center" }}>
            {item.servings}
          </Text>
          <TouchableOpacity
            onPress={() => onUpdateServings(item.id, Math.round((item.servings + 0.5) * 10) / 10)}
            accessibilityLabel={`Increase servings for ${item.food?.name ?? "item"}`}
            accessibilityRole="button"
            hitSlop={8}
            style={{ padding: 6, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <MaterialCommunityIcons name="plus" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
          accessibilityLabel={`Remove ${item.food?.name ?? "item"}`}
          accessibilityRole="button"
          hitSlop={8}
          style={{ padding: 6, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
        >
          <MaterialCommunityIcons name="close" size={18} color={colors.error} />
        </TouchableOpacity>
      </CardContent>
    </Card>
  );
}

export default function EditMealTemplate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const { success, error: showError, info } = useToast();
  const [template, setTemplate] = useState<MealTemplate | null>(null);
  const [name, setName] = useState("");
  const [meal, setMeal] = useState<Meal>("snack");
  const [items, setItems] = useState<MealTemplateItem[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const t = await getMealTemplateById(id);
    if (!t) return;
    setTemplate(t);
    setName(t.name);
    setMeal(t.meal);
    setItems(t.items ?? []);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const isValid = name.trim().length > 0;

  const handleSave = useCallback(async () => {
    if (!id || !isValid || saving) return;
    setSaving(true);
    try {
      await updateMealTemplate(id, {
        name: name.trim(),
        meal,
        items: items.map((it) => ({
          food_entry_id: it.food_entry_id,
          servings: it.servings,
        })),
      });
      success("Template updated");
      router.back();
    } catch {
      showError("Failed to update template");
    } finally {
      setSaving(false);
    }
  }, [id, isValid, saving, name, meal, items, success, showError]);

  const handleRemoveItem = useCallback((itemId: string) => {
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  }, []);

  const handleUpdateServings = useCallback((itemId: string, servings: number) => {
    if (servings < 0.1) return;
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, servings } : it))
    );
  }, []);

  const handleDelete = useCallback(async () => {
    if (!id) return;
    try {
      await deleteMealTemplate(id);
      info("Template deleted");
      router.back();
    } catch {
      showError("Failed to delete template");
    }
  }, [id, info, showError]);

  if (!template) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} style={{ padding: 8 }}>
            <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
          </TouchableOpacity>
        </View>
        <View style={styles.empty}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>Template not found</Text>
        </View>
      </View>
    );
  }

  const macros = items.reduce(
    (acc, it) => {
      const s = it.servings;
      return {
        cal: acc.cal + (it.food?.calories ?? 0) * s,
        p: acc.p + (it.food?.protein ?? 0) * s,
        c: acc.c + (it.food?.carbs ?? 0) * s,
        f: acc.f + (it.food?.fat ?? 0) * s,
      };
    },
    { cal: 0, p: 0, c: 0, f: 0 }
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} style={{ padding: 8 }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text variant="title" style={{ color: colors.onBackground, flex: 1, textAlign: "center" }}>
          Edit Template
        </Text>
        <TouchableOpacity onPress={handleDelete} accessibilityLabel="Delete template" accessibilityRole="button" hitSlop={8} style={{ padding: 8, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <MaterialCommunityIcons name="delete-outline" size={24} color={colors.error} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <View>
            <Input
              label="Template Name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. My Breakfast"
              accessibilityLabel="Template name"
              error={name.trim().length === 0 ? "Name is required" : undefined}
            />

            <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginTop: 16, marginBottom: 8 }}>
              Meal Category
            </Text>
            <View style={styles.chipRow}>
              {MEALS.map((m) => (
                <Chip
                  key={m}
                  selected={meal === m}
                  onPress={() => setMeal(m)}
                  accessibilityLabel={`${MEAL_LABELS[m]} category`}
                  accessibilityRole="button"
                >
                  {MEAL_LABELS[m]}
                </Chip>
              ))}
            </View>

            <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginTop: 16, marginBottom: 8 }}>
              Items ({items.length})
            </Text>
            {items.length === 0 && (
              <View style={[styles.emptyItems, { backgroundColor: colors.surfaceVariant }]}>
                <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
                  No items — tap to add
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TemplateItemCard
            item={item}
            colors={colors}
            onUpdateServings={handleUpdateServings}
            onRemove={handleRemoveItem}
          />
        )}
        ListFooterComponent={
          <View>
            <View style={[styles.macroSummary, { backgroundColor: colors.surfaceVariant }]}>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                Total: {Math.round(macros.cal)} cal · {Math.round(macros.p)}p · {Math.round(macros.c)}c · {Math.round(macros.f)}f
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: isValid ? colors.primary : colors.surfaceVariant },
              ]}
              onPress={handleSave}
              disabled={!isValid || saving}
              accessibilityLabel="Save changes"
              accessibilityRole="button"
            >
              <Text
                variant="body"
                style={{ color: isValid ? colors.onPrimary : colors.onSurfaceVariant, fontWeight: "600" }}
              >
                {saving ? "Saving…" : "Save Changes"}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 80 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  itemCard: { marginBottom: 6, borderRadius: 8 },
  itemRow: { flexDirection: "row", alignItems: "center" },
  servingsControl: { flexDirection: "row", alignItems: "center" },
  emptyItems: { padding: 24, borderRadius: 8, alignItems: "center" },
  macroSummary: {
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  saveButton: {
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
    marginTop: 16,
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
});
