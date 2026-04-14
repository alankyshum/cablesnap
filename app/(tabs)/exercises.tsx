import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Card, Chip, FAB, Searchbar, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated, { FadeIn } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getAllExercises, getExerciseById } from "../../lib/db";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  ATTACHMENT_LABELS,
  type Category,
  type Exercise,
} from "../../lib/types";
import { semantic, difficultyText, CATEGORY_ICONS, DIFFICULTY_COLORS } from "../../constants/theme";
import { useLayout } from "../../lib/layout";
import { useFocusRefetch } from "../../lib/query";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const ITEM_HEIGHT = 84;

type FilterType = Category | "custom" | "volta";
const FILTER_ALL: FilterType[] = [...CATEGORIES, "volta", "custom"];

export default function Exercises() {
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<FilterType>>(new Set());
  const [detail, setDetail] = useState<Exercise | null>(null);

  const { data: exercises = [], isLoading: loading } = useQuery({
    queryKey: ["exercises"],
    queryFn: getAllExercises,
  });
  useFocusRefetch(["exercises"]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    const customFilter = selected.has("custom");
    const voltaFilter = selected.has("volta");
    const cats = new Set([...selected].filter((s): s is Category => s !== "custom" && s !== "volta"));
    return exercises.filter((ex) => {
      if (q && !ex.name.toLowerCase().includes(q)) return false;
      if (customFilter && !ex.is_custom) return false;
      if (voltaFilter && ex.is_voltra !== true) return false;
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
      if (layout.atLeastMedium) {
        getExerciseById(item.id).then(setDetail);
      } else {
        router.push(`/exercise/${item.id}`);
      }
    },
    [layout.atLeastMedium, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: Exercise }) => {
      const diff = item.difficulty || "intermediate";
      const color = DIFFICULTY_COLORS[diff] || semantic.intermediate;
      const label = diff === "beginner" ? "B" : diff === "advanced" ? "A" : "I";
      return (
      <Animated.View entering={FadeIn.duration(200)}>
      <AnimatedPressable
        onPress={() => onPress(item)}
        style={({ pressed }) => [
          styles.item,
          { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outlineVariant },
          layout.atLeastMedium && detail?.id === item.id && { backgroundColor: theme.colors.primaryContainer },
          pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
        ]}
        accessibilityLabel={`${item.name}${item.is_voltra === true ? ", Volta 1 compatible" : ""}${item.is_custom ? ", Custom" : ""}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}, Difficulty: ${diff}`}
        accessibilityRole="button"
      >
        <View style={styles.itemInner}>
          <View
            style={[styles.diffBar, { backgroundColor: color }]}
            accessibilityLabel={`Difficulty: ${diff}`}
          >
            <Text style={[styles.diffLabel, { color: theme.colors.onPrimary }]}>{label}</Text>
          </View>
          <View style={styles.itemContent}>
            <View style={styles.titleRow}>
              <Text variant="titleSmall" numberOfLines={1} style={[{ color: theme.colors.onSurface }, styles.titleText]}>
                {item.name}
              </Text>
              {item.is_voltra === true && (
                <View
                  style={[styles.v1Badge, { backgroundColor: theme.colors.tertiary }]}
                  accessibilityLabel="Volta 1 compatible"
                >
                  <Text style={[styles.v1Text, { color: theme.colors.onTertiary }]}>V1</Text>
                </View>
              )}
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
                icon={() => CATEGORY_ICONS[item.category] ? (
                  <MaterialCommunityIcons
                    name={CATEGORY_ICONS[item.category] as keyof typeof MaterialCommunityIcons.glyphMap}
                    size={16}
                    color={theme.colors.onPrimaryContainer}
                  />
                ) : null}
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
        </View>
      </AnimatedPressable>
      </Animated.View>
      );
    },
    [onPress, theme, layout.atLeastMedium, detail]
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

  const filterLabel = (f: FilterType) => (f === "custom" ? "Custom" : f === "volta" ? "Volta 1" : CATEGORY_LABELS[f]);

  const list = (
    <View style={layout.atLeastMedium ? { flex: 6 } : { flex: 1 }}>
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
              icon={f !== "custom" && f !== "volta" && CATEGORY_ICONS[f] ? () => (
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[f] as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={16}
                  color={theme.colors.onSurface}
                />
              ) : undefined}
              accessibilityLabel={`Filter by ${filterLabel(f)}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selected.has(f) }}
            >
              {filterLabel(f)}
            </Chip>
          )}
        />
      </View>
      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListEmptyComponent={empty}
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

  if (!layout.atLeastMedium) {
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
                <View style={styles.muscleColumns}>
                  <View style={{ flex: 1 }}>
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
                  </View>
                  {detail.secondary_muscles.length > 0 && (
                    <View style={{ flex: 1 }}>
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
                    </View>
                  )}
                </View>
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
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: ITEM_HEIGHT,
    justifyContent: "center",
  },
  itemInner: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  diffBar: {
    width: 3,
    borderRadius: 2,
    marginRight: 12,
    marginLeft: 16,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 2,
  },
  diffLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
  itemContent: {
    flex: 1,
    paddingRight: 16,
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
    paddingVertical: 0,
  },
  customText: {
    fontSize: 12,
  },
  v1Badge: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  v1Text: {
    fontSize: 12,
    fontWeight: "700",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
  },
  badge: {
    paddingVertical: 0,
  },
  chipText: {
    fontSize: 12,
  },
  muscle: {
    marginRight: 4,
    paddingVertical: 0,
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
  muscleColumns: {
    flexDirection: "row",
    gap: 16,
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
