import { Trans } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { useCallback, useRef, useState } from "react";
import { SectionList, StyleSheet, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect, Stack } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { SearchBar } from "@/components/ui/searchbar";
import { useToast } from "@/components/ui/bna-toast";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  getMealTemplates,
  getMealTemplateById,
  deleteMealTemplate,
  logFromTemplate,
  undoLogFromTemplate,
  createMealTemplate,
} from "@/lib/db";
import type { MealTemplate } from "@/lib/types";
import { MEALS, MEAL_LABELS } from "@/lib/types";
import { formatDateKey } from "@/lib/format";
import SwipeToDelete from "@/components/SwipeToDelete";

export default function MealTemplates() {
  const colors = useThemeColors();
  const { info } = useToast();
  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [search, setSearch] = useState("");
  const deleted = useRef<{ template: MealTemplate; timer: ReturnType<typeof setTimeout> } | null>(null);

  const load = useCallback(async () => {
    const all = await getMealTemplates();
    setTemplates(all);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = search.trim()
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : templates;

  const sections = MEALS
    .map((m) => ({
      title: MEAL_LABELS[m],
      meal: m,
      data: filtered.filter((t) => t.meal === m),
    }))
    .filter((s) => s.data.length > 0);

  const handleLog = useCallback(
    async (template: MealTemplate) => {
      try {
        const date = formatDateKey(Date.now());
        const result = await logFromTemplate(template.id, date);
         info(t({ id: "nutrition.templates.logged", message: `${template.name} logged` }), {
          action: {
             label: t({ id: "nutrition.templates.undo", message: "Undo" }),
            onPress: async () => {
              await undoLogFromTemplate(result.logIds);
              load();
            },
          },
        });
        load();
      } catch {
         info(t({ id: "nutrition.templates.logError", message: "Failed to log template" }));
      }
    },
    [info, load]
  );

  const handleDelete = useCallback(
    async (template: MealTemplate) => {
      if (deleted.current) clearTimeout(deleted.current.timer);
      // Fetch full template with items before deleting so undo can restore them
      const full = await getMealTemplateById(template.id);
      const savedItems = (full?.items ?? []).map((it) => ({
        food_entry_id: it.food_entry_id,
        servings: it.servings,
      }));
      await deleteMealTemplate(template.id);
      deleted.current = {
        template,
        timer: setTimeout(() => {
          deleted.current = null;
        }, 4000),
      };
       info(t({ id: "nutrition.templates.deleted", message: `${template.name} deleted` }), {
        action: {
           label: t({ id: "nutrition.templates.undo", message: "Undo" }),
          onPress: async () => {
            if (!deleted.current) return;
            clearTimeout(deleted.current.timer);
            const t = deleted.current.template;
            await createMealTemplate({
              name: t.name,
              meal: t.meal,
              items: savedItems,
            });
            deleted.current = null;
            load();
          },
        },
      });
      load();
    },
    [info, load]
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
       <Stack.Screen options={{ title: t({ id: "nutrition.templates.title", message: "Meal Templates" }) }} />

      {templates.length >= 5 && (
        <View style={styles.searchContainer}>
          <SearchBar
             placeholder={t({ id: "nutrition.templates.search.placeholder", message: "Search templates…" })}
            value={search}
            onChangeText={setSearch}
             accessibilityLabel={t({ id: "nutrition.templates.search.a11y", message: "Search meal templates" })}
          />
        </View>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text variant="subtitle" style={{ color: colors.onSurfaceVariant, marginBottom: 8, marginTop: 16 }}>
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <SwipeToDelete onDelete={() => handleDelete(item)}>
            <TouchableOpacity
              onPress={() => handleLog(item)}
              onLongPress={() => router.push(`/nutrition/template/${item.id}`)}
              accessibilityLabel={`${item.name}, ${Math.round(item.cached_calories)} calories. Tap to log, long press to edit`}
              accessibilityRole="button"
              style={{ minHeight: 48 }}
            >
              <Card style={[styles.card, { backgroundColor: colors.surface }]}>
                <CardContent style={styles.cardContent}>
                  <View style={{ flex: 1 }}>
                    <Text variant="body" style={{ color: colors.onSurface }} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                      {Math.round(item.cached_calories)} cal · {Math.round(item.cached_protein)}p · {Math.round(item.cached_carbs)}c · {Math.round(item.cached_fat)}f
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => router.push(`/nutrition/template/${item.id}`)}
                    accessibilityLabel={`Edit ${item.name}`}
                    accessibilityRole="button"
                    hitSlop={8}
                    style={{ padding: 8, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={20} color={colors.onSurfaceVariant} />
                  </TouchableOpacity>
                </CardContent>
              </Card>
            </TouchableOpacity>
          </SwipeToDelete>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <MaterialCommunityIcons name="food-variant" size={48} color={colors.onSurfaceVariant} />
            <Text variant="body" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 16 }}>
               {search.trim()
                 ? <Trans id="nutrition.templates.empty.search">No templates match your search</Trans>
                 : <Trans id="nutrition.templates.empty.default">Save your first meal template from the nutrition log</Trans>}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: 16, marginBottom: 8 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 80 },
  card: { marginBottom: 6, borderRadius: 8 },
  cardContent: { flexDirection: "row", alignItems: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
});
