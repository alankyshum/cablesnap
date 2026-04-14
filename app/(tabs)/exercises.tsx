import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import { Chip, FAB, Searchbar, Text, TouchableRipple, useTheme } from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import { getAllExercises, getExerciseById } from "../../lib/db";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  ATTACHMENT_LABELS,
  type Category,
  type Exercise,
} from "../../lib/types";
import { semantic, difficultyText } from "../../constants/theme";
import { useLayout } from "../../lib/layout";

const ITEM_HEIGHT = 84;

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: semantic.beginner,
  intermediate: semantic.intermediate,
  advanced: semantic.advanced,
};

type FilterType = Category | "custom";
const FILTER_ALL: FilterType[] = [...CATEGORIES, "custom"];

export default function Exercises() {
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<FilterType>>(new Set());
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Exercise | null>(null);

  useFocusEffect(
    useCallback(() => {
      getAllExercises()
        .then(setExercises)
        .finally(() => setLoading(false));
    }, [])
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const customFilter = selected.has("custom");
    const cats = new Set([...selected].filter((s): s is Category => s !== "custom"));
    return exercises.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      if (customFilter && !ex.is_custom) return false;
      if (cats.size > 0 && !cats.has(ex.category)) return false;
      return true;
    });
  }, [exercises, query, selected]);

  const toggle = useCallback((f: FilterType) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
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
        accessibilityLabel={`${item.name}${item.is_custom ? ", Custom" : ""}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}`}
        accessibilityRole="button"
      >
        <View>
          <View style={styles.titleRow}>
            <Text variant="titleSmall" numberOfLines={1} style={[{ color: theme.colors.onSurface }, styles.titleText]}>
              {item.name}
            </Text>
            {item.is_custom && (
              <Chip
                compact
                textStyle={styles.customText}
                style={[styles.customChip, { backgroundColor: theme.colors.tertiaryContainer }]}
              >
                Custom
              </Chip>
            )}
          </View>
          <View style={styles.row}>
            <Chip
              compact
              textStyle={styles.chipText}
              style={[styles.badge, { backgroundColor: theme.colors.primaryContainer }]}
            >
              {CATEGORY_LABELS[item.category]}
            </Chip>
            {item.attachment && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
                {ATTACHMENT_LABELS[item.attachment]}
              </Text>
            )}
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

  const filterLabel = (f: FilterType) => (f === "custom" ? "Custom" : CATEGORY_LABELS[f]);

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
          data={FILTER_ALL}
          keyExtractor={(c) => c}
          renderItem={({ item: f }) => (
            <Chip
              selected={selected.has(f)}
              onPress={() => toggle(f)}
              style={styles.filterChip}
              compact
              accessibilityLabel={`Filter by ${filterLabel(f)}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selected.has(f) }}
            >
              {filterLabel(f)}
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
      <FAB
        icon="plus"
        onPress={() => router.push("/exercise/create")}
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        accessibilityLabel="Add custom exercise"
        accessibilityRole="button"
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
          <FlatList
            data={[]}
            renderItem={null}
            contentContainerStyle={styles.detailContent}
            ListHeaderComponent={
              <>
                <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
                  {detail.name}
                </Text>
                {detail.is_custom && (
                  <Chip
                    compact
                    style={{ backgroundColor: theme.colors.tertiaryContainer, alignSelf: "flex-start", marginBottom: 8 }}
                    textStyle={{ fontSize: 12 }}
                  >
                    Custom
                  </Chip>
                )}
                <View style={styles.row}>
                  <Chip compact style={{ backgroundColor: theme.colors.primaryContainer }}>
                    {CATEGORY_LABELS[detail.category]}
                  </Chip>
                  <Chip
                    compact
                    style={{ backgroundColor: DIFFICULTY_COLORS[detail.difficulty], marginLeft: 8 }}
                    textStyle={{ color: difficultyText(detail.difficulty), fontWeight: "600" }}
                  >
                    {detail.difficulty}
                  </Chip>
                </View>
                {detail.mount_position && (
                  <>
                    <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16, fontSize: 12 }}>
                      Mount Position
                    </Text>
                    <Text
                      variant="bodyLarge"
                      style={{ color: theme.colors.onSurface, marginTop: 4 }}
                      accessibilityLabel={`Mount position: ${detail.mount_position} on rack`}
                    >
                      {detail.mount_position}
                    </Text>
                  </>
                )}
                {detail.attachment && (
                  <>
                    <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16, fontSize: 12 }}>
                      Attachment
                    </Text>
                    <Text
                      variant="bodyLarge"
                      style={{ color: theme.colors.onSurface, marginTop: 4 }}
                      accessibilityLabel={`Attachment: ${detail.attachment}`}
                    >
                      {detail.attachment}
                    </Text>
                  </>
                )}
                {detail.training_modes && detail.training_modes.length > 0 && (
                  <View accessibilityLabel={`Compatible training modes: ${detail.training_modes.join(", ")}`}>
                    <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16, fontSize: 12 }}>
                      Training Modes
                    </Text>
                    <View style={[styles.row, { marginTop: 6, flexWrap: "wrap", gap: 6 }]}>
                      {detail.training_modes.map((m) => (
                        <Chip key={m} compact style={{ backgroundColor: theme.colors.secondaryContainer }}>
                          {m.replace(/_/g, " ")}
                        </Chip>
                      ))}
                    </View>
                  </View>
                )}
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
              </>
            }
          />
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  titleText: {
    flexShrink: 1,
  },
  customChip: {
    height: 24,
  },
  customText: {
    fontSize: 12,
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
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
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
