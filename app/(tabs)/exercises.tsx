import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { SearchBar } from "@/components/ui/searchbar";
import { FAB } from "@/components/ui/fab";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getAllExercises, getExerciseById } from "../../lib/db";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Exercise,
} from "../../lib/types";
import { CATEGORY_ICONS, muscle } from "../../constants/theme";
import { useLayout } from "../../lib/layout";
import { useFocusRefetch } from "../../lib/query";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import { useProfileGender } from "../../lib/useProfileGender";
import { radii } from "../../constants/design-tokens";
import { ExerciseCard } from "../../components/exercises/ExerciseCard";
import { ExerciseDetailPane } from "../../components/exercises/ExerciseDetailPane";

type FilterType = Category | "custom";
const FILTER_ALL: FilterType[] = [...CATEGORIES, "custom"];

export default function Exercises() {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";
  const router = useRouter();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const profileGender = useProfileGender();
  const mc = isDark ? muscle.dark : muscle.light;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<FilterType>>(new Set());
  const [detail, setDetail] = useState<Exercise | null>(null);

  const { data: exercises = [], isLoading: loading } = useQuery({
    queryKey: ["exercises"],
    queryFn: getAllExercises,
  });
  useFocusRefetch(["exercises"]);

  const filtered = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const q = normalize(query);
    const customFilter = selected.has("custom");
    const cats = new Set([...selected].filter((s): s is Category => s !== "custom"));
    return exercises.filter((ex) => {
      if (q) {
        if (!normalize(ex.name).includes(q)) return false;
      }
      if (customFilter && !ex.is_custom) return false;
      if (cats.size > 0 && !cats.has(ex.category)) return false;
      return true;
    });
  }, [exercises, query, selected]);

  useEffect(() => {
    if (layout.atLeastMedium && !detail && filtered.length > 0) {
      getExerciseById(filtered[0].id).then(setDetail);
    }
  }, [layout.atLeastMedium, detail, filtered]);

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
    ({ item }: { item: Exercise }) => (
      <ExerciseCard
        item={item}
        selected={layout.atLeastMedium && detail?.id === item.id}
        onPress={() => onPress(item)}
        colors={colors}
        mc={mc}
      />
    ),
    [onPress, colors, layout.atLeastMedium, detail, mc]
  );

  const keyExtractor = useCallback((item: Exercise) => item.id, []);

  const empty = useCallback(
    () =>
      loading ? null : (
        <View style={styles.empty}>
          <Text variant="title" style={{ color: colors.onSurfaceVariant }}>
            No exercises found
          </Text>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
            Try adjusting your search or filters
          </Text>
        </View>
      ),
    [loading, colors]
  );

  const filterLabel = (f: FilterType) => (f === "custom" ? "Custom" : CATEGORY_LABELS[f]);

  const list = (
    <View style={layout.atLeastMedium ? { flex: 2 } : { flex: 1 }}>
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
          data={FILTER_ALL}
          keyExtractor={(c) => c}
          renderItem={({ item: f }) => {
            const active = selected.has(f);
            return (
            <Chip
              selected={active}
              onPress={() => toggle(f)}
              style={StyleSheet.flatten([
                styles.filterChip,
                active && { backgroundColor: colors.primaryContainer },
              ])}
              textStyle={{
                flexShrink: 0,
                ...(active ? { color: colors.onPrimaryContainer, fontWeight: "600" } : {}),
              }}
              compact
              icon={f !== "custom" && CATEGORY_ICONS[f] ? (
                <MaterialCommunityIcons
                  name={CATEGORY_ICONS[f] as keyof typeof MaterialCommunityIcons.glyphMap}
                  size={16}
                  color={active ? colors.onPrimaryContainer : colors.onSurface}
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
        numColumns={1}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
      />
      <FAB
        icon="plus"
        onPress={() => router.push("/exercise/create")}
        style={[styles.fab, { backgroundColor: colors.primary }]}
        color={colors.onPrimary}
        accessibilityLabel="Add custom exercise"
      />
    </View>
  );

  if (!layout.atLeastMedium) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {list}
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.wideRow, { backgroundColor: colors.background }]}>
      {list}
      <ExerciseDetailPane detail={detail} colors={colors} profileGender={profileGender} />
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
    borderRadius: radii.pill,
    justifyContent: "center",
    alignItems: "center",
  },

});
