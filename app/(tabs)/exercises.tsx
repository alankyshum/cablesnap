import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { Chip, Searchbar, Text, TouchableRipple, useTheme } from "react-native-paper";
import { useRouter } from "expo-router";
import { getAllExercises, getExerciseById } from "../../lib/db";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Exercise,
} from "../../lib/types";
import { semantic } from "../../constants/theme";
import { useLayout } from "../../lib/layout";

const ITEM_HEIGHT = 84;

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: semantic.beginner,
  intermediate: semantic.intermediate,
  advanced: semantic.advanced,
};

export default function Exercises() {
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<Category>>(new Set());
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Exercise | null>(null);

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

  const onPress = useCallback(
    (item: Exercise) => {
      if (layout.wide) {
        getExerciseById(item.id).then(setDetail);
      } else {
        router.push(`/exercise/${item.id}`);
      }
    },
    [layout.wide, router]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Exercise>) => (
      <TouchableRipple
        onPress={() => onPress(item)}
        style={[
          styles.item,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outlineVariant },
          layout.wide && detail?.id === item.id && { backgroundColor: theme.colors.primaryContainer },
        ]}
        accessibilityLabel={`${item.name}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}`}
        accessibilityRole="button"
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
    [onPress, theme, layout.wide, detail]
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

  const list = (
    <View style={layout.wide ? { flex: 6 } : { flex: 1 }}>
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
        keyExtractor={keyExtractor}
        getItemLayout={getLayout}
        ListEmptyComponent={empty}
        contentContainerStyle={filtered.length === 0 ? styles.emptyList : undefined}
      />
    </View>
  );

  if (!layout.wide) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {list}
      </View>
    );
  }

  const steps = detail?.instructions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <View style={[styles.container, styles.wideRow, { backgroundColor: theme.colors.background }]}>
      {list}
      <View style={[styles.detailPane, { borderLeftColor: theme.colors.outlineVariant }]}>
        {detail ? (
          <ScrollView contentContainerStyle={styles.detailContent}>
            <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
              {detail.name}
            </Text>
            <View style={styles.row}>
              <Chip compact style={{ backgroundColor: theme.colors.primaryContainer }}>
                {CATEGORY_LABELS[detail.category]}
              </Chip>
              <Chip
                compact
                style={{ backgroundColor: DIFFICULTY_COLORS[detail.difficulty], marginLeft: 8 }}
                textStyle={{ color: semantic.onSemantic, fontWeight: "600" }}
              >
                {detail.difficulty}
              </Chip>
            </View>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
              Equipment
            </Text>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginTop: 4 }}>
              {detail.equipment}
            </Text>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
              Primary Muscles
            </Text>
            <View style={[styles.row, { marginTop: 6, flexWrap: "wrap", gap: 6 }]}>
              {detail.primary_muscles.map((m) => (
                <Chip key={m} compact style={{ backgroundColor: theme.colors.secondaryContainer }}>
                  {m}
                </Chip>
              ))}
            </View>
            {detail.secondary_muscles.length > 0 && (
              <>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
                  Secondary Muscles
                </Text>
                <View style={[styles.row, { marginTop: 6, flexWrap: "wrap", gap: 6 }]}>
                  {detail.secondary_muscles.map((m) => (
                    <Chip key={m} compact style={{ backgroundColor: theme.colors.tertiaryContainer }}>
                      {m}
                    </Chip>
                  ))}
                </View>
              </>
            )}
            {steps && steps.length > 0 && (
              <>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
                  Instructions
                </Text>
                {steps.map((step, i) => (
                  <Text key={i} variant="bodyMedium" style={{ color: theme.colors.onSurface, marginTop: 6, lineHeight: 22 }}>
                    {step}
                  </Text>
                ))}
              </>
            )}
          </ScrollView>
        ) : (
          <View style={styles.detailEmpty}>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
              Select an exercise to view details
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  wideRow: {
    flexDirection: "row",
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
    fontSize: 12,
  },
  muscle: {
    marginRight: 4,
    height: 22,
  },
  muscleText: {
    fontSize: 12,
  },
  empty: {
    alignItems: "center",
    paddingTop: 48,
  },
  emptyList: {
    flexGrow: 1,
  },
  detailPane: {
    flex: 4,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  detailContent: {
    padding: 24,
    paddingBottom: 32,
  },
  detailEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
