import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Chip } from "@/components/ui/chip";
import { SearchBar } from "@/components/ui/searchbar";
import { Text } from "@/components/ui/text";
// Note: Chip is still used for filter chips at the top (they ARE interactive).
// The category badge inside each list item uses View+Text to avoid nested
// <button> elements on web (Chip renders as <button> even without onPress).
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../lib/layout";
import { addExerciseToTemplate, addSet, getAllExercises, getTemplateExerciseCount } from "../../lib/db";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Exercise,
} from "../../lib/types";

const ITEM_HEIGHT = 72;

export default function PickExercise() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const { templateId, sessionId } = useLocalSearchParams<{
    templateId?: string;
    sessionId?: string;
  }>();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<Category>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllExercises()
      .then(setExercises)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = normalize(query);
    return exercises.filter((ex) => {
      if (q) {
        if (!normalize(ex.name).includes(q)) return false;
      }
      if (selected.size > 0 && !selected.has(ex.category)) return false;
      return true;
    });
  }, [exercises, query, selected]);

  const toggle = useCallback((cat: Category) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const pick = useCallback(
    async (exercise: Exercise) => {
      if (sessionId) {
        for (let i = 1; i <= 3; i++) {
          await addSet(sessionId, exercise.id, i);
        }
        router.back();
      } else if (templateId) {
        const count = await getTemplateExerciseCount(templateId);
        await addExerciseToTemplate(templateId, exercise.id, count);
        router.back();
      } else {
        router.back();
      }
    },
    [templateId, sessionId, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Exercise }) => (
      <Pressable
        onPress={() => pick(item)}
        style={({ pressed }) => [
          styles.item,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.outlineVariant,
          },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityLabel={`Select ${item.name}${item.is_custom ? " (Custom)" : ""}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}`}
        accessibilityRole="button"
      >
        <View>
          <Text
            variant="subtitle"
            numberOfLines={1}
            style={{ color: colors.onSurface }}
          >
            {item.name}{item.is_custom ? " (Custom)" : ""}
          </Text>
          <View style={styles.row}>
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.primaryContainer },
              ]}
            >
              <Text style={[styles.chipText, { color: colors.onPrimaryContainer }]}>
                {CATEGORY_LABELS[item.category]}
              </Text>
            </View>
            <Text
              variant="caption"
              style={{
                color: colors.onSurfaceVariant,
                marginLeft: 8,
              }}
            >
              {item.equipment}
            </Text>
          </View>
        </View>
      </Pressable>
    ),
    [colors, pick]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Pick Exercise" }} />
      <View
        style={[styles.container, { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding }]}
      >
        <SearchBar
          placeholder="Search exercises..."
          value={query}
          onChangeText={setQuery}
          style={[styles.search, { backgroundColor: colors.surface }]}
          accessibilityLabel="Search exercises"
        />
        <View style={styles.chips}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={CATEGORIES}
            keyExtractor={(c) => c}
            renderItem={({ item: cat }) => (
              <Chip
                selected={selected.has(cat)}
                onPress={() => toggle(cat)}
                style={styles.filterChip}
                compact
                accessibilityLabel={`Filter by ${CATEGORY_LABELS[cat]}`}
                accessibilityRole="button"
                accessibilityState={{ selected: selected.has(cat) }}
              >
                {CATEGORY_LABELS[cat]}
              </Chip>
            )}
          />
        </View>
        <FlashList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.empty}>
                <Text
                  variant="title"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  No exercises found
                </Text>
              </View>
            )
          }
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  search: {
    margin: 12,
    marginBottom: 4,
  },
  chips: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  filterChip: {
    marginRight: 6,
  },
  item: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: ITEM_HEIGHT,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "500",
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
  },
  emptyList: {
    flexGrow: 1,
  },
});
