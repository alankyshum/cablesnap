import { Trans } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { useCallback, useState } from "react";
import { StyleSheet, TouchableOpacity, View, FlatList } from "react-native";
import { router, useLocalSearchParams, useFocusEffect, Stack } from "expo-router";
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
             {item.food?.name ?? <Trans id="nutrition.template.unknownDeleted">Unknown (deleted)</Trans>}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {Math.round((item.food?.calories ?? 0) * item.servings)} cal · {Math.round((item.food?.protein ?? 0) * item.servings)}p
          </Text>
        </View>
        <View style={styles.servingsControl}>
          <TouchableOpacity
            onPress={() => onUpdateServings(item.id, Math.round((item.servings - 0.5) * 10) / 10)}
             accessibilityLabel={t({ id: "nutrition.template.decrease.a11y", message: `Decrease servings for ${item.food?.name ?? "item"}` })}
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
             accessibilityLabel={t({ id: "nutrition.template.increase.a11y", message: `Increase servings for ${item.food?.name ?? "item"}` })}
            accessibilityRole="button"
            hitSlop={8}
            style={{ padding: 6, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
          >
            <MaterialCommunityIcons name="plus" size={18} color={colors.onSurfaceVariant} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => onRemove(item.id)}
           accessibilityLabel={t({ id: "nutrition.template.remove.a11y", message: `Remove ${item.food?.name ?? "item"}` })}
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
       success(t({ id: "nutrition.template.updated", message: "Template updated" }));
      router.back();
    } catch {
       showError(t({ id: "nutrition.template.updateError", message: "Failed to update template" }));
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
       info(t({ id: "nutrition.template.deleted", message: "Template deleted" }));
      router.back();
    } catch {
       showError(t({ id: "nutrition.template.deleteError", message: "Failed to delete template" }));
    }
  }, [id, info, showError]);

  if (!template) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
         <Stack.Screen options={{ title: t({ id: "nutrition.template.editTitle", message: "Edit Template" }) }} />
        <View style={styles.empty}>
           <Text variant="body" style={{ color: colors.onSurfaceVariant }}><Trans id="nutrition.template.notFound">Template not found</Trans></Text>
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
      <Stack.Screen
        options={{
           title: t({ id: "nutrition.template.editTitle", message: "Edit Template" }),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleDelete}
               accessibilityLabel={t({ id: "nutrition.template.delete.a11y", message: "Delete template" })}
              accessibilityRole="button"
              hitSlop={8}
              style={{ padding: 8, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <MaterialCommunityIcons name="delete-outline" size={24} color={colors.error} />
            </TouchableOpacity>
          ),
        }}
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={
          <View>
            <Input
               label={t({ id: "nutrition.template.name.label", message: "Template Name" })}
              value={name}
              onChangeText={setName}
               placeholder={t({ id: "nutrition.template.name.placeholder", message: "e.g. My Breakfast" })}
               accessibilityLabel={t({ id: "nutrition.template.name.a11y", message: "Template name" })}
               error={name.trim().length === 0 ? t({ id: "nutrition.template.name.required", message: "Name is required" }) : undefined}
            />

            <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginTop: 16, marginBottom: 8 }}>
               <Trans id="nutrition.template.mealCategory">Meal Category</Trans>
            </Text>
            <View style={styles.chipRow}>
              {MEALS.map((m) => (
                <Chip
                  key={m}
                  selected={meal === m}
                  onPress={() => setMeal(m)}
                   accessibilityLabel={t({ id: "nutrition.template.category.a11y", message: `${MEAL_LABELS[m]} category` })}
                  accessibilityRole="button"
                >
                  {MEAL_LABELS[m]}
                </Chip>
              ))}
            </View>

            <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginTop: 16, marginBottom: 8 }}>
               <Trans id="nutrition.template.items">Items ({items.length})</Trans>
            </Text>
            {items.length === 0 && (
              <View style={[styles.emptyItems, { backgroundColor: colors.surfaceVariant }]}>
                <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
                   <Trans id="nutrition.template.noItems">No items — tap to add</Trans>
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
                 <Trans id="nutrition.template.totalMacros">Total: {Math.round(macros.cal)} cal · {Math.round(macros.p)}p · {Math.round(macros.c)}c · {Math.round(macros.f)}f</Trans>
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.saveButton,
                { backgroundColor: isValid ? colors.primary : colors.surfaceVariant },
              ]}
              onPress={handleSave}
              disabled={!isValid || saving}
               accessibilityLabel={t({ id: "nutrition.template.save.a11y", message: "Save changes" })}
              accessibilityRole="button"
            >
              <Text
                variant="body"
                style={{ color: isValid ? colors.onPrimary : colors.onSurfaceVariant, fontWeight: "600" }}
              >
                 {saving ? <Trans id="nutrition.template.saving">Saving…</Trans> : <Trans id="nutrition.template.save">Save Changes</Trans>}
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
