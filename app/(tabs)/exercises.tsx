import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { SearchBar } from "@/components/ui/searchbar";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { getAllExercises, getExerciseById } from "../../lib/db";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  type Category,
  type Equipment,
  type Exercise,
  type MuscleGroup,
} from "../../lib/types";
import { CATEGORY_ICONS, muscle } from "../../constants/theme";
import { useLayout } from "../../lib/layout";
import { useFocusRefetch } from "../../lib/query";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import { useProfileGender } from "../../lib/useProfileGender";
import { ExerciseCard } from "../../components/exercises/ExerciseCard";
import { ExerciseDetailPane } from "../../components/exercises/ExerciseDetailPane";
import { ExerciseFilterSheet, FilterButton } from "../../components/ExerciseFilterSheet";
import { useBottomSheet } from "../../components/ui/bottom-sheet";

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
  const [selectedEquipment, setSelectedEquipment] = useState<Set<Equipment>>(new Set());
  const [selectedMuscles, setSelectedMuscles] = useState<Set<MuscleGroup>>(new Set());
  const [detail, setDetail] = useState<Exercise | null>(null);
  const filterSheet = useBottomSheet();

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
      // Equipment filter (OR within dimension)
      if (selectedEquipment.size > 0 && !selectedEquipment.has(ex.equipment)) return false;
      // Muscle group filter (OR within dimension)
      if (
        selectedMuscles.size > 0 &&
        !ex.primary_muscles.some((m) => selectedMuscles.has(m))
      )
        return false;
      return true;
    });
  }, [exercises, query, selected, selectedEquipment, selectedMuscles]);

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

  const handleApplyFilters = useCallback(
    (equipment: Set<Equipment>, muscles: Set<MuscleGroup>) => {
      setSelectedEquipment(equipment);
      setSelectedMuscles(muscles);
    },
    []
  );

  const clearAllFilters = useCallback(() => {
    setSelected(new Set());
    setSelectedEquipment(new Set());
    setSelectedMuscles(new Set());
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

  const activeFilterCount = selectedEquipment.size + selectedMuscles.size;
  const totalActiveCount = activeFilterCount + selected.size;

  const empty = useCallback(
    () =>
      loading ? null : (
        <View style={styles.empty}>
          <Text variant="title" style={{ color: colors.onSurfaceVariant }}>
            No exercises found
          </Text>
          <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
            {totalActiveCount > 0
              ? `Try adjusting your filters. (${totalActiveCount} filter${totalActiveCount !== 1 ? "s" : ""} active)`
              : "Try adjusting your search or filters"}
          </Text>
          {totalActiveCount > 0 && (
            <Pressable
              onPress={clearAllFilters}
              style={styles.clearFiltersButton}
              accessibilityLabel="Clear all filters"
              accessibilityRole="button"
            >
              <Text variant="body" style={{ color: colors.primary, fontWeight: "600" }}>
                Clear filters
              </Text>
            </Pressable>
          )}
        </View>
      ),
    [loading, colors, totalActiveCount, clearAllFilters]
  );

  const filterLabel = (f: FilterType) => (f === "custom" ? "Custom" : CATEGORY_LABELS[f]);

  const list = (
    <View style={layout.atLeastMedium ? { flex: 2 } : { flex: 1 }}>
      <View style={styles.searchRow}>
        <SearchBar
          placeholder="Search exercises..."
          value={query}
          onChangeText={setQuery}
          style={[styles.search, { backgroundColor: colors.surface, flex: 1 }]}
          accessibilityLabel="Search exercises"
        />
        <FilterButton
          activeCount={activeFilterCount}
          onPress={filterSheet.open}
          backgroundColor={colors.surface}
          activeColor={colors.primary}
          inactiveColor={colors.onSurface}
          badgeTextColor={colors.onPrimary}
        />
      </View>
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
      <FlatList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={1}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: tabBarHeight }}
      />
      <ExerciseFilterSheet
        isVisible={filterSheet.isVisible}
        onClose={filterSheet.close}
        selectedEquipment={selectedEquipment}
        selectedMuscles={selectedMuscles}
        onApply={handleApplyFilters}
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
      <ExerciseDetailPane detail={detail} colors={colors} profileGender={profileGender} bottomInset={tabBarHeight} />
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
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  search: {
    flex: 1,
    margin: 0,
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
  clearFiltersButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
});
