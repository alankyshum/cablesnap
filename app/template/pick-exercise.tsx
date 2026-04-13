import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  Chip,
  Searchbar,
  Text,
  TouchableRipple,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { addSet, getAllExercises } from "../../lib/db";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Exercise,
} from "../../lib/types";

const ITEM_HEIGHT = 72;

export default function PickExercise() {
  const theme = useTheme();
  const router = useRouter();
  const { templateId, sessionId, editId } = useLocalSearchParams<{
    templateId?: string;
    sessionId?: string;
    editId?: string;
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
    const q = query.toLowerCase();
    return exercises.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q)) return false;
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
        // Adding exercise mid-session: create 3 default sets and go back
        for (let i = 1; i <= 3; i++) {
          await addSet(sessionId, exercise.id, i);
        }
        router.back();
      } else if (templateId) {
        if (editId) {
          router.replace(
            `/template/${editId}?addExerciseId=${exercise.id}`
          );
        } else {
          router.replace(
            `/template/create?templateId=${templateId}&addExerciseId=${exercise.id}`
          );
        }
      } else {
        router.back();
      }
    },
    [templateId, sessionId, editId, router]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Exercise>) => (
      <TouchableRipple
        onPress={() => pick(item)}
        style={[
          styles.item,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
        accessibilityLabel={`Select ${item.name}${item.is_custom ? " (Custom)" : ""}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}`}
        accessibilityRole="button"
      >
        <View>
          <Text
            variant="titleSmall"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface }}
          >
            {item.name}{item.is_custom ? " (Custom)" : ""}
          </Text>
          <View style={styles.row}>
            <Chip
              compact
              textStyle={styles.chipText}
              style={[
                styles.badge,
                { backgroundColor: theme.colors.primaryContainer },
              ]}
            >
              {CATEGORY_LABELS[item.category]}
            </Chip>
            <Text
              variant="bodySmall"
              style={{
                color: theme.colors.onSurfaceVariant,
                marginLeft: 8,
              }}
            >
              {item.equipment}
            </Text>
          </View>
        </View>
      </TouchableRipple>
    ),
    [theme, pick]
  );

  return (
    <>
      <Stack.Screen options={{ title: "Pick Exercise" }} />
      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Searchbar
          placeholder="Search exercises..."
          value={query}
          onChangeText={setQuery}
          style={[styles.search, { backgroundColor: theme.colors.surface }]}
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
        <FlatList
          data={filtered}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.empty}>
                <Text
                  variant="titleMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  No exercises found
                </Text>
              </View>
            )
          }
          contentContainerStyle={
            filtered.length === 0 ? styles.emptyList : undefined
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
    height: 24,
  },
  chipText: {
    fontSize: 12,
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
  },
  emptyList: {
    flexGrow: 1,
  },
});
