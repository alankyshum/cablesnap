import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector, type GestureType } from "react-native-gesture-handler";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { formatDateKey, DAYS, withOpacity } from "@/lib/format";
import { weekday, daysInMonth, monthLabel } from "@/hooks/useHistoryData";
import { spacing, radii } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { ScheduleEntry } from "@/lib/db/settings";
import type { AnimatedStyle } from "react-native-reanimated";
import type { ViewStyle } from "react-native";

const MIN_TOUCH_TARGET = 48;

type Props = {
  colors: ThemeColors;
  year: number;
  month: number;
  dotMap: Map<string, number>;
  scheduleMap: Map<number, ScheduleEntry>;
  selected: string | null;
  animatedCalendarStyle: AnimatedStyle<ViewStyle>;
  swipeGesture: GestureType;
  cellSize: number;
  scale: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onTapDay: (key: string) => void;
  selectedCellRef: React.RefObject<View | null>;
  monthSummary: { count: number; totalHours: number };
};

export default function CalendarGrid({
  colors, year, month, dotMap, scheduleMap, selected,
  animatedCalendarStyle, swipeGesture, cellSize, scale,
  onPrevMonth, onNextMonth, onTapDay, selectedCellRef, monthSummary,
}: Props) {
  const today = new Date();
  const todayKey = formatDateKey(today.getTime());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const total = daysInMonth(year, month);
  const offset = weekday(new Date(year, month, 1));

  const renderDay = (day: number) => {
    const d = new Date(year, month, day);
    const key = formatDateKey(d.getTime());
    const count = dotMap.get(key) ?? 0;
    const isToday = key === todayKey;
    const isSel = key === selected;
    const dayOfWeek = weekday(d);
    const scheduleEntry = scheduleMap.get(dayOfWeek);
    const isPast = d.getTime() < todayMidnight;
    const isFuture = d.getTime() > Date.now();
    const isScheduled = !!scheduleEntry;
    const isMissedScheduled = isScheduled && isPast && count === 0;

    let cellBg = "transparent";
    if (isSel) cellBg = colors.primary;
    else if (count > 0) cellBg = withOpacity(colors.primaryContainer, 0.4);
    else if (isScheduled) cellBg = withOpacity(colors.primaryContainer, 0.2);

    const label = count > 0
      ? `${day} ${monthLabel(year, month)}, ${count} workout${count > 1 ? "s" : ""}`
      : isMissedScheduled ? `${day} ${monthLabel(year, month)}, missed scheduled workout`
      : isScheduled && isFuture ? `${day} ${monthLabel(year, month)}, scheduled: ${scheduleEntry.template_name}`
      : `${day} ${monthLabel(year, month)}, rest day`;

    return (
      <Pressable key={key} ref={isSel ? selectedCellRef : undefined} onPress={() => onTapDay(key)}
        accessibilityLabel={label} accessibilityRole="button"
        style={[styles.cell, {
          width: cellSize, height: cellSize, borderRadius: cellSize / 2,
          borderWidth: isToday ? 2 : 0, borderColor: isToday ? colors.primary : "transparent",
          backgroundColor: cellBg,
        }]}>
        <Text variant="caption" style={{ color: isSel ? colors.onPrimary : colors.onBackground, fontSize: 14 * scale }}>{day}</Text>
        {count > 0 && (
          <View style={styles.dots}>
            {count >= 3 ? (
              <View style={[styles.countBadge, { backgroundColor: isSel ? colors.onPrimary : colors.primary }]}>
                <Text style={[styles.countBadgeText, { color: isSel ? colors.primary : colors.onPrimary }]}>{count}</Text>
              </View>
            ) : (
              <>
                <View style={[styles.dot, { backgroundColor: isSel ? colors.onPrimary : colors.primary }]} />
                {count > 1 && <View style={[styles.dot, { backgroundColor: isSel ? colors.onPrimary : colors.primary }]} />}
              </>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < offset; i++) cells.push(<View key={`pad-${i}`} style={{ width: cellSize, height: cellSize }} />);
  for (let d = 1; d <= total; d++) cells.push(renderDay(d));

  return (
    <>
      <View style={styles.monthNav}>
        <Pressable onPress={onPrevMonth} accessibilityLabel="Previous month" style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <Icon name={ChevronLeft} size={24} />
        </Pressable>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>{monthLabel(year, month)}</Text>
        <Pressable onPress={onNextMonth} accessibilityLabel="Next month" style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <Icon name={ChevronRight} size={24} />
        </Pressable>
      </View>

      <Text variant="caption" style={[styles.monthSummary, { color: colors.onSurfaceVariant }]}
        accessibilityLabel={monthSummary.count > 0 ? `${monthSummary.count} workouts, ${monthSummary.totalHours} hours this month` : "No workouts this month"}>
        {monthSummary.count > 0 ? `${monthSummary.count} workout${monthSummary.count !== 1 ? "s" : ""} · ${monthSummary.totalHours} hrs` : "No workouts this month"}
      </Text>

      <View style={styles.grid}>
        {DAYS.map((d) => (
          <View key={d} style={[styles.cell, { width: cellSize, height: 28 }]}>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: 12 * scale }}>{d}</Text>
          </View>
        ))}
      </View>

      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={[styles.grid, animatedCalendarStyle]}>{cells}</Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  monthNav: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginBottom: 8 },
  monthSummary: { textAlign: "center", marginBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", paddingHorizontal: 2 },
  cell: { alignItems: "center", justifyContent: "center", marginVertical: 2, marginHorizontal: 2, minHeight: MIN_TOUCH_TARGET },
  dots: { flexDirection: "row", gap: 3, position: "absolute", bottom: 4 },
  dot: { width: 5, height: 5, borderRadius: radii.sm },
  countBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  countBadgeText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
});
