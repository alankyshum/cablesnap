import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Card, Chip, FAB, Searchbar, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
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
import { semantic, difficultyText, CATEGORY_ICONS, DIFFICULTY_COLORS, muscle } from "../../constants/theme";
import { useLayout } from "../../lib/layout";
import { MuscleMap } from "../../components/MuscleMap";
import { useFocusRefetch } from "../../lib/query";

type FilterType = Category | "custom";
const FILTER_ALL: FilterType[] = [...CATEGORIES, "custom"];

export default function Exercises() {
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();
  const mc = theme.dark ? muscle.dark : muscle.light;
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
      const selected = layout.atLeastMedium && detail?.id === item.id;
      return (
      <Card
        onPress={() => onPress(item)}
        style={[
          styles.exerciseCard,
          { borderLeftColor: color, borderLeftWidth: 3, backgroundColor: theme.colors.surface },
          selected && { backgroundColor: theme.colors.primaryContainer },
        ]}
        accessibilityLabel={`${item.name}${item.is_custom ? ", Custom" : ""}, ${CATEGORY_LABELS[item.category]}, ${item.equipment}, Difficulty: ${diff}`}
        accessibilityRole="button"
      >
        <Card.Content style={styles.cardInner}>
          <View style={styles.titleRow}>
            <Text variant="titleSmall" numberOfLines={1} style={[{ color: theme.colors.onSurface }, styles.titleText]}>
              {item.name}
            </Text>
            {item.is_custom && (
              <View style={[styles.customBadge, { backgroundColor: theme.colors.tertiaryContainer }]}>
                <Text style={[styles.customBadgeText, { color: theme.colors.onSurface }]}>Custom</Text>
              </View>
            )}
          </View>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
            numberOfLines={1}
          >
            {CATEGORY_LABELS[item.category]} · {item.equipment}{item.attachment ? ` · ${ATTACHMENT_LABELS[item.attachment]}` : ""}
          </Text>
          <View style={styles.muscleRow}>
            {item.primary_muscles.map((m) => (
              <View key={m} style={styles.muscleBadge}>
                <View style={[styles.muscleDot, { backgroundColor: mc.primary }]} />
                <Text style={[styles.muscleLabel, { color: theme.colors.onSurfaceVariant }]}>{m}</Text>
              </View>
            ))}
            {item.secondary_muscles.map((m) => (
              <View key={`s-${m}`} style={styles.muscleBadge}>
                <View style={[styles.muscleDot, { backgroundColor: mc.secondary }]} />
                <Text style={[styles.muscleLabel, { color: theme.colors.onSurfaceVariant }]}>{m}</Text>
              </View>
            ))}
          </View>
        </Card.Content>
      </Card>
      );
    },
    [onPress, theme, layout.atLeastMedium, detail, mc]
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
    <View style={layout.atLeastMedium ? { flex: 5 } : { flex: 1 }}>
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
          renderItem={({ item: f }) => {
            const active = selected.has(f);
            return (
            <Chip
              selected={active}
              onPress={() => toggle(f)}
              style={[
                styles.filterChip,
                active && { backgroundColor: theme.colors.primaryContainer },
              ]}
              textStyle={active ? { color: theme.colors.onPrimaryContainer, fontWeight: "600" } : undefined}
              compact
              showSelectedOverlay
              icon={f !== "custom" && CATEGORY_ICONS[f] ? () => (
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[f] as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={16}
                  color={active ? theme.colors.onPrimaryContainer : theme.colors.onSurface}
                />
              ) : undefined}
              accessibilityLabel={`Filter by ${filterLabel(f)}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {filterLabel(f)}
            </Chip>
            );
          }}
        />
      </View>
      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={layout.atLeastMedium ? 2 : 1}
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
                <MuscleMap
                  primary={detail.primary_muscles}
                  secondary={detail.secondary_muscles}
                  width={360}
                />
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
  exerciseCard: {
    flex: 1,
    marginHorizontal: 6,
    marginVertical: 4,
    borderRadius: 10,
  },
  cardInner: {
    paddingVertical: 8,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  titleText: {
    flexShrink: 1,
  },
  customBadge: {
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    flexWrap: "wrap",
    gap: 6,
  },
  muscleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  muscleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  muscleDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  muscleLabel: {
    fontSize: 11,
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
    flex: 5,
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
