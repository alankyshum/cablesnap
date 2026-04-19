import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  generateCalendarGrid,
  getWeekDayLabels,
  dateToISO,
} from "@/lib/db/calendar";

type Props = {
  year: number;
  month: number;
  weekStartDay: number;
  workoutDates: Set<string>;
  selectedDate: string | null;
  todayStr: string;
  onSelectDate: (dateStr: string, day: number) => void;
};

export default function CalendarGrid({
  year,
  month,
  weekStartDay,
  workoutDates,
  selectedDate,
  todayStr,
  onSelectDate,
}: Props) {
  const colors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const cellSize = Math.floor(screenWidth / 7);
  const effectiveCellSize = Math.max(cellSize, 48);

  const grid = generateCalendarGrid(year, month, weekStartDay);
  const weekDayLabels = getWeekDayLabels(weekStartDay);

  const today = new Date();
  const isFutureDay = (day: number) => {
    const d = new Date(year, month, day);
    d.setHours(23, 59, 59, 999);
    return d > today;
  };

  const handlePress = (day: number) => {
    if (isFutureDay(day)) return;
    const dateStr = dateToISO(year, month, day);
    onSelectDate(dateStr, day);
  };

  return (
    <View>
      {/* Week day headers */}
      <View style={styles.row}>
        {weekDayLabels.map((label) => (
          <View
            key={label}
            style={[styles.headerCell, { width: cellSize }]}
          >
            <Text
              variant="caption"
              style={[styles.headerText, { color: colors.onSurfaceVariant }]}
            >
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* Day cells */}
      <View style={styles.gridWrap}>
        {grid.map((day, index) => {
          if (day === null) {
            return (
              <View
                key={`empty-${index}`}
                style={[styles.cell, { width: cellSize, height: effectiveCellSize }]}
              />
            );
          }

          const dateStr = dateToISO(year, month, day);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          const hasWorkout = workoutDates.has(dateStr);
          const isFuture = isFutureDay(day);

          const accessLabel = isFuture
            ? `${monthName(month)} ${day}, future date`
            : hasWorkout
              ? `${monthName(month)} ${day}, workout completed`
              : `${monthName(month)} ${day}, no workout`;

          return (
            <Pressable
              key={day}
              style={[
                styles.cell,
                { width: cellSize, height: effectiveCellSize },
                isSelected && {
                  backgroundColor: colors.primaryContainer,
                  borderRadius: 8,
                },
                isToday && !isSelected && {
                  borderWidth: 2,
                  borderColor: colors.primary,
                  borderRadius: 8,
                },
              ]}
              onPress={() => handlePress(day)}
              disabled={isFuture}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityLabel={accessLabel}
              accessibilityState={{
                selected: isSelected,
                disabled: isFuture,
              }}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: colors.onSurface },
                  isFuture && { color: colors.disabled, opacity: 0.4 },
                  isToday && { fontWeight: "700" },
                  isSelected && { color: colors.onPrimaryContainer },
                ]}
              >
                {day}
              </Text>
              {hasWorkout && !isFuture && (
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: colors.primary },
                    isSelected && { backgroundColor: colors.onPrimaryContainer },
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function monthName(month: number): string {
  return new Date(2024, month, 1).toLocaleDateString(undefined, {
    month: "long",
  });
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
  },
  headerCell: {
    alignItems: "center",
    paddingVertical: 8,
  },
  headerText: {
    fontSize: 12,
    fontWeight: "600",
  },
  gridWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  dayText: {
    fontSize: 14,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 2,
  },
});
