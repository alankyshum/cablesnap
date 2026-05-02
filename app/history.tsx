import { StyleSheet, View, FlatList, Pressable } from "react-native";
import React, { useState } from "react";
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

const MIN_TOUCH_TARGET = 48;

function HistoryScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const h = useHistoryData();
  const renderSession = useSessionRenderer({ colors });

  const [templateSheetOpen, setTemplateSheetOpen] = useState(false);
  const [muscleSheetOpen, setMuscleSheetOpen] = useState(false);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);

  const cellSize = Math.max(MIN_TOUCH_TARGET, Math.floor((layout.width - layout.horizontalPadding * 2) / 7));

  return (
    <>
      <FlatList
        testID="history-list"
        data={h.filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderSession}
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
              placeholder="Search workouts"
              value={h.query}
              onChangeText={h.onSearch}
              containerStyle={[styles.search, { backgroundColor: colors.surface }]}
              accessibilityLabel="Search workout history"
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
                accessibilityLabel="Calendar disabled while filters are active"
              >
                Filters active — tap &quot;Clear all&quot; to use calendar
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
              <Chip icon={<Icon name={X} size={16} />} onPress={h.clearFilter} style={styles.chip} accessibilityLabel="Clear filter">
                {h.query.trim()
                  ? `Search: ${h.query}`
                  : `${new Date(h.year, h.month, Number(h.selected!.split("-")[2])).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
              </Chip>
            )}

            {h.useFilterMode && (
              <Text
                variant="caption"
                style={[styles.resultCount, { color: colors.onSurfaceVariant }]}
                accessibilityLabel={`${h.filteredTotal} sessions match these filters`}
              >
                {h.filteredTotal} {h.filteredTotal === 1 ? "session" : "sessions"}
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
                accessibilityLabel="Clear filters"
                accessibilityRole="button"
              >
                <Text variant="body" style={{ color: colors.onPrimary, fontWeight: "600" }}>
                  Clear filters
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
