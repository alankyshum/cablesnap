import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { Chip, Searchbar, Text, TouchableRipple, useTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import { getAllExercises } from "../../lib/db";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Exercise,
} from "../../lib/types";

const ITEM_HEIGHT = 84;

export default function Exercises() {
  const theme = useTheme();
  const router = useRouter();
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

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Exercise>) => (
      <TouchableRipple
        onPress={() => router.push(`/exercise/${item.id}`)}
        style={[styles.item, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outlineVariant }]}
      >
        <View>
          <Text variant="titleSmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
            {item.name}
          </Text>
          <View style={styles.row}>
            <Chip
              compact
              textStyle={styles.chipText}
              style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}
            >
              {CATEGORY_LABELS[item.category]}
            </Chip>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
              {item.equipment}
            </Text>
          </View>
          <View style={styles.row}>
            {item.primary_muscles.slice(0, 3).map((m) => (
              <Chip
                key={m}
                compact
                textStyle={styles.muscleText}
                style={[styles.muscle, { backgroundColor: theme.colors.secondaryContainer }]}
              >
                {m}
              </Chip>
            ))}
            {item.primary_muscles.length > 3 && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                +{item.primary_muscles.length - 3}
              </Text>
            )}
          </View>
        </View>
      </TouchableRipple>
    ),
    [router, theme]
  );

  const getLayout = useCallback(
    (_data: ArrayLike<Exercise> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const keyExtractor = useCallback((item: Exercise) => item.id, []);

  const empty = useCallback(
    () =>
      loading ? null : (
        <View style={styles.empty}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            No exercises found
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            Try adjusting your search or filters
          </Text>
        </View>
      ),
    [loading, theme]
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Searchbar
        placeholder="Search exercises..."
        value={query}
        onChangeText={setQuery}
        style={[styles.search, { backgroundColor: theme.colors.surface }]}
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
            >
              {CATEGORY_LABELS[cat]}
            </Chip>
          )}
        />
      </View>
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getLayout}
        ListEmptyComponent={empty}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
      />
    </View>
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: ITEM_HEIGHT,
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
  },
  badge: {
    height: 24,
  },
  chipText: {
    fontSize: 11,
  },
  muscle: {
    marginRight: 4,
    height: 22,
  },
  muscleText: {
    fontSize: 10,
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
  },
  emptyList: {
    flexGrow: 1,
  },
});
