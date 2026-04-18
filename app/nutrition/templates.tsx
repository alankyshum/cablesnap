import { useCallback, useRef, useState } from "react";
import { SectionList, StyleSheet, TouchableOpacity, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { SearchBar } from "@/components/ui/searchbar";
import { useToast } from "@/components/ui/bna-toast";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  getMealTemplates,
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
        info(`${template.name} logged`, {
          action: {
            label: "Undo",
            onPress: async () => {
              await undoLogFromTemplate(result.logIds);
              load();
            },
          },
        });
        load();
      } catch {
        info("Failed to log template");
      }
    },
    [info, load]
  );

  const handleDelete = useCallback(
    async (template: MealTemplate) => {
      if (deleted.current) clearTimeout(deleted.current.timer);
      await deleteMealTemplate(template.id);
      deleted.current = {
        template,
        timer: setTimeout(() => {
          deleted.current = null;
        }, 4000),
      };
      info(`${template.name} deleted`, {
        action: {
          label: "Undo",
          onPress: async () => {
            if (!deleted.current) return;
            clearTimeout(deleted.current.timer);
            const t = deleted.current.template;
            await createMealTemplate({
              name: t.name,
              meal: t.meal,
              items: [], // Items are lost on undo — acceptable tradeoff
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
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          style={{ padding: 8 }}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.onSurface} />
        </TouchableOpacity>
        <Text variant="title" style={{ color: colors.onBackground, flex: 1, textAlign: "center" }}>
          Meal Templates
        </Text>
        <View style={{ width: 40 }} />
      </View>

      {templates.length >= 5 && (
        <View style={styles.searchContainer}>
          <SearchBar
            placeholder="Search templates…"
            value={search}
            onChangeText={setSearch}
            accessibilityLabel="Search meal templates"
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
                ? "No templates match your search"
                : "Save your first meal template from the nutrition log"}
            </Text>
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
  searchContainer: { paddingHorizontal: 16, marginBottom: 8 },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 80 },
  card: { marginBottom: 6, borderRadius: 8 },
  cardContent: { flexDirection: "row", alignItems: "center" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
});
