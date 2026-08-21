import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import { StyleSheet, View, FlatList, Pressable } from "react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { SearchBar } from "@/components/ui/searchbar";
import { X } from "lucide-react-native";
import ErrorBoundary from "../components/ErrorBoundary";
import { useLayout } from "../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";
import { useHistoryData } from "@/hooks/useHistoryData";
import StreakAndHeatmap from "@/components/history/StreakAndHeatmap";
import CalendarGrid from "@/components/history/CalendarGrid";
import DayDetailPanel from "@/components/history/DayDetailPanel";
import { useSessionRenderer } from "@/components/history/SessionRenderer";
import { FilterBar } from "@/components/history/FilterBar";
import { TemplateFilterSheet } from "@/components/history/TemplateFilterSheet";
import { MuscleGroupFilterSheet } from "@/components/history/MuscleGroupFilterSheet";
import { DateRangeFilterSheet } from "@/components/history/DateRangeFilterSheet";
import { GtgDayGroup } from "@/components/history/GtgDayGroup";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useFocusRefetch } from "@/lib/query";
import { listRecentDaySessions } from "@/lib/db/day-session";
import type { DaySessionEntry } from "@/lib/db/day-session";
import type { SessionRow } from "@/hooks/useHistoryData";

const MIN_TOUCH_TARGET = 48;

type WorkoutItem = { type: "workout" } & SessionRow;
type GtgItem = { type: "gtg"; dateKey: string; dateLabel: string; entries: DaySessionEntry[] };
type HistoryItem = WorkoutItem | GtgItem;

function HistoryScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const router = useRouter();
  const h = useHistoryData();
  const renderSession = useSessionRenderer({ colors });

  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [muscleSheetOpen, setMuscleSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const { data: recentGtg } = useQuery({
    queryKey: ["gtg-history"],
    queryFn: () => listRecentDaySessions(30),
  });
  useFocusRefetch(["gtg-history"]);

  // Group GTG entries by date_key
  const gtgByDate = useMemo(() => {
    const map = new Map<string, DaySessionEntry[]>();
    for (const entry of recentGtg ?? []) {
      const arr = map.get(entry.date_key) ?? [];
      arr.push(entry);
      map.set(entry.date_key, arr);
    }
    return map;
  }, [recentGtg]);

  // Build merged list: workout sessions + GTG day groups, sorted by date descending.
  // Only shown when not in filter mode (filters apply to workouts, not GTG).
  const mergedData = useMemo((): HistoryItem[] => {
    if (h.useFilterMode) {
      return (h.filtered as SessionRow[]).map((s) => ({ type: "workout" as const, ...s }));
    }

    const workoutItems: WorkoutItem[] = (h.filtered as SessionRow[]).map((s) => ({ type: "workout" as const, ...s }));

    // Build date label from YYYY-MM-DD
    const gtgItems: GtgItem[] = Array.from(gtgByDate.entries()).map(([dateKey, entries]) => {
      const [y, m, d] = dateKey.split("-").map(Number);
      const date = new Date(y, m - 1, d);
      const dateLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      return { type: "gtg" as const, dateKey, dateLabel, entries };
    });

    // Merge: interleave by date. Workout items use started_at; GTG use midnight of date_key.
    const allItems: HistoryItem[] = [...workoutItems, ...gtgItems];
    allItems.sort((a, b) => {
      const aTime = a.type === "workout" ? a.started_at : new Date(a.dateKey).getTime();
      const bTime = b.type === "workout" ? b.started_at : new Date(b.dateKey).getTime();
      return bTime - aTime;
    });
    return allItems;
  }, [h.filtered, h.useFilterMode, gtgByDate]);

  const renderItem = useCallback(({ item }: { item: HistoryItem }) => {
    if (item.type === "gtg") {
      return (
        <GtgDayGroup
          dateLabel={item.dateLabel}
          entries={item.entries}
          colors={colors}
          onEntryPress={(sessionId) => router.push(`/day-session/${sessionId}`)}
        />
      );
    }
    return renderSession({ item: item as unknown as SessionRow });
  }, [colors, renderSession, router]);

  const cellSize = Math.max(MIN_TOUCH_TARGET, Math.floor((layout.width - layout.horizontalPadding * 2) / 7));

  return (
    <>
      <FlatList
        testID="history-list"
        data={mergedData}
        keyExtractor={(item) => item.type === "gtg" ? `gtg-${item.dateKey}` : item.id}
        renderItem={renderItem}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: tabBarHeight }}
        onEndReached={h.useFilteredQueryPath ? h.loadMoreFiltered : undefined}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            <StreakAndHeatmap
              colors={colors}
              currentStreak={h.currentStreak}
              longestStreak={h.longestStreak}
              totalWorkouts={h.totalWorkouts}
              heatmapData={h.heatmapData}
              heatmapLoading={h.heatmapLoading}
              heatmapError={h.heatmapError}
              heatmapExpanded={h.heatmapExpanded}
              setHeatmapExpanded={h.setHeatmapExpanded}
              onDayPress={h.onHeatmapDayPress}
            />

            <SearchBar
              placeholder={t({ id: "history.search.placeholder", message: "Search workouts" })}
              value={h.query}
              onChangeText={h.onSearch}
              containerStyle={[styles.search, { backgroundColor: colors.surface }]}
              accessibilityLabel={t({ id: "history.search.a11y", message: "Search workout history" })}
            />

            <FilterBar
              filters={h.filters}
              templateOptions={h.templateOptions}
              onOpenTemplateSheet={() => setTemplateSheetOpen(true)}
              onOpenMuscleGroupSheet={() => setMuscleSheetOpen(true)}
              onOpenDateRangeSheet={() => setDateSheetOpen(true)}
              onClearOne={h.clearOneFilter}
              onClearAll={h.clearAllFilters}
            />

            {h.useFilterMode && (
              <Text
                variant="caption"
                style={[styles.filterCaption, { color: colors.onSurfaceVariant }]}
                accessibilityLabel={t({ id: "history.calendar.disabledA11y", message: "Calendar disabled while filters are active" })}
              >
                {t({ id: "history.filters.active", message: 'Filters active — tap "Clear all" to use calendar' })}
              </Text>
            )}

            <View
              style={[
                styles.calendarWrap,
                h.useFilterMode && styles.calendarDisabled,
              ]}
              pointerEvents={h.useFilterMode ? "none" : "auto"}
              accessibilityElementsHidden={h.useFilterMode}
              importantForAccessibility={h.useFilterMode ? "no-hide-descendants" : "auto"}
            >
              <CalendarGrid
                colors={colors}
                year={h.year}
                month={h.month}
                dotMap={h.dotMap}
                scheduleMap={h.scheduleMap}
                selected={h.selected}
                animatedCalendarStyle={h.animatedCalendarStyle}
                swipeGesture={h.swipeGesture}
                cellSize={cellSize}
                scale={layout.scale}
                onPrevMonth={() => h.changeMonth(-1)}
                onNextMonth={() => h.changeMonth(1)}
                onTapDay={h.tapDay}
                selectedCellRef={h.selectedCellRef}
                monthSummary={h.monthSummary}
              />
            </View>

            {!h.useFilterMode && (
              <DayDetailPanel
                colors={colors}
                selected={h.selected}
                year={h.year}
                month={h.month}
                dayDetailSessions={h.dayDetailSessions}
                selectedDayScheduleEntry={h.selectedDayScheduleEntry}
                isSelectedDayFuture={h.isSelectedDayFuture}
                dayDetailRef={h.dayDetailRef}
              />
            )}

            {(!h.useFilterMode && (h.selected || h.query.trim())) && (
               <Chip icon={<Icon name={X} size={16} />} onPress={h.clearFilter} style={styles.chip} accessibilityLabel={t({ id: "history.filters.clearA11y", message: "Clear filter" })}>
                {h.query.trim()
                  ? `Search: ${h.query}`
                  : `${new Date(h.year, h.month, Number(h.selected!.split("-")[2])).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              </Chip>
            )}

            {h.useFilterMode && (
              <Text
                variant="caption"
                style={[styles.resultCount, { color: colors.onSurfaceVariant }]}
                 accessibilityLabel={t({ id: "history.filters.resultCountA11y", message: `${h.filteredTotal} sessions match these filters` })}
              >
                {i18n._({ id: "history.filters.resultCount", message: "{count, plural, one {# session} other {# sessions}}", values: { count: h.filteredTotal } })}
              </Text>
            )}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>{h.emptyMessage()}</Text>
            {h.useFilterMode && (
              <Pressable
                onPress={h.clearAllFilters}
                style={[styles.clearFiltersButton, { backgroundColor: colors.primary }]}
                 accessibilityLabel={t({ id: "history.empty.clearFiltersA11y", message: "Clear filters" })}
                accessibilityRole="button"
              >
                <Text variant="body" style={{ color: colors.onPrimary, fontWeight: "600" }}>
                   {t({ id: "history.empty.clearFilters", message: "Clear filters" })}
                </Text>
              </Pressable>
            )}
          </View>
        }
      />

      <TemplateFilterSheet
        isVisible={templateSheetOpen}
        onClose={() => setTemplateSheetOpen(false)}
        options={h.templateOptions}
        selectedTemplateId={h.filters.templateId}
        onSelect={h.setTemplateFilter}
      />
      <MuscleGroupFilterSheet
        isVisible={muscleSheetOpen}
        onClose={() => setMuscleSheetOpen(false)}
        availableMuscleGroups={h.muscleGroupOptions}
        selectedMuscleGroup={h.filters.muscleGroup}
        onSelect={h.setMuscleGroupFilter}
      />
      <DateRangeFilterSheet
        isVisible={dateSheetOpen}
        onClose={() => setDateSheetOpen(false)}
        selectedPreset={h.filters.datePreset}
        onSelect={h.setDatePresetFilter}
      />
    </>
  );
}

export default function History() {
  return (
    <ErrorBoundary>
      <HistoryScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  search: { marginBottom: 12 },
  chip: { alignSelf: "flex-start", marginBottom: 12, marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 24, gap: 12 },
  filterCaption: {
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 8,
  },
  calendarWrap: {
    // Wrapper is needed so we can dim/disable the calendar block in filter mode.
  },
  calendarDisabled: {
    opacity: 0.5,
  },
  resultCount: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
  },
  clearFiltersButton: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
    minHeight: 44,
    justifyContent: "center",
  },
});
