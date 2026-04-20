import { StyleSheet, View, FlatList } from "react-native";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { SearchBar } from "@/components/ui/searchbar";
import { X } from "lucide-react-native";
import ErrorBoundary from "../components/ErrorBoundary";
import { useLayout } from "../lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useHistoryData } from "@/hooks/useHistoryData";
import StreakAndHeatmap from "@/components/history/StreakAndHeatmap";
import CalendarGrid from "@/components/history/CalendarGrid";
import DayDetailPanel from "@/components/history/DayDetailPanel";
import { useSessionRenderer } from "@/components/history/SessionRenderer";

const MIN_TOUCH_TARGET = 48;

function HistoryScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
  const h = useHistoryData();
  const renderSession = useSessionRenderer({ colors });

  const cellSize = Math.max(MIN_TOUCH_TARGET, Math.floor(layout.width / 7) - 4);

  return (
    <FlatList
      data={h.filtered}
      keyExtractor={(item) => item.id}
      renderItem={renderSession}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 40 }}
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

          {(h.selected || h.query.trim()) && (
            <Chip icon={<Icon name={X} size={16} />} onPress={h.clearFilter} style={styles.chip} accessibilityLabel="Clear filter">
              {h.query.trim()
                ? `Search: ${h.query}`
                : `${new Date(h.year, h.month, Number(h.selected!.split("-")[2])).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </Chip>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>{h.emptyMessage()}</Text>
        </View>
      }
    />
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
  empty: { alignItems: "center", paddingVertical: 24 },
});
