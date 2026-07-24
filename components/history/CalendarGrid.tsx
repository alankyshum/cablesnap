/* eslint-disable complexity */
/**
 * CalendarGrid — month calendar for workout history.
 *
 * CVD accessibility (BLD-2721, protanopia / BLD-2707, deuteranopia):
 *   The original design used only colour (coral primary / opacity tinted bg)
 *   to distinguish workout days, scheduled days, and rest days. Under
 *   protanopia the orange/coral accent collapses to grey, making the states
 *   indistinguishable. This fix adds non-colour structural cues so states
 *   are distinguishable in pure greyscale:
 *
 *   • Workout dot (count 1-2)  → filled circle WITH an outline ring
 *                                (borderWidth: 1.5, borderColor) — BLD-3498: strengthened
 *   • Scheduled hollow dot     → hollow circle (transparent fill + border ring)
 *   • Rest / empty             → no dot (unchanged)
 *   • Count badge (≥ 3)        → numeric text glyph — already CVD-safe
 *
 *   Filled-vs-hollow is a shape encoding that survives any colour vision mode,
 *   including full achromatopsia (greyscale). The outline ring on the filled
 *   workout dot also separates it visually from the cell background.
 */
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import { GestureDetector, type GestureType } from "react-native-gesture-handler";
import { Text } from "@/components/ui/text";
import { Icon } from "@/components/ui/icon";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { formatDateKey, DAYS, withOpacity } from "@/lib/format";
import { weekday, daysInMonth, monthLabel } from "@/hooks/useHistoryData";
import { spacing, radii, fontSizes } from "@/constants/design-tokens";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { ScheduleEntry } from "@/lib/db/settings";
import type { AnimatedStyle } from "react-native-reanimated";
import type { ViewStyle } from "react-native";

const MIN_TOUCH_TARGET = 48;
const COLUMN_WIDTH_PCT = `${100 / 7}%` as `${number}%`;

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
  const now = today.getTime();
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
    const isFuture = d.getTime() > now;
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

    // CVD non-colour encoding (BLD-2721, BLD-2742):
    //   dotColor:      fill colour for workout dots (colour-only hint)
    //   dotBorderColor: outline ring colour — high-contrast luminance border (WCAG 1.4.1)
    //                   Applied ONLY for unselected dots (isSel=false).
    //                   Selected cells already have full-contrast bg (primary), no CVD border needed.
    const dotColor = isSel ? colors.onPrimary : colors.primary;
    const dotBorderColor = colors.onBackground;

    return (
      // BLD-3654: Separate touch target (full column width) from visual highlight
      // (cellSize × cellSize centered square). Previously the highlight was painted
      // directly on the Pressable, which made it wider than tall on narrow viewports
      // (column width > cellSize), so the pill/ring shifted right of the date glyph.
      <Pressable key={key} ref={isSel ? selectedCellRef : undefined} onPress={() => onTapDay(key)} accessibilityLabel={label} accessibilityRole="button"
        style={[styles.cell, { width: COLUMN_WIDTH_PCT, height: cellSize }]}>
        {/* Inner highlight: always a perfect circle (cellSize × cellSize) centered
            within the full-width touch target. Today ring + background live here. */}
        <View style={[styles.highlight, {
          width: cellSize, height: cellSize, borderRadius: cellSize / 2,
          borderWidth: isToday ? 2 : 0, borderColor: isToday ? colors.primary : "transparent",
          backgroundColor: cellBg,
        }]}>
          <Text variant="caption" style={{ color: isSel ? colors.onPrimary : colors.onBackground, fontSize: fontSizes.sm * scale }}>{day}</Text>

          {/* Workout markers — filled dot + outline ring (CVD-safe: shape encoding) */}
          {count > 0 && (
            <View style={styles.dots} testID={`cal-day-${key}-workout`}>
              {count >= 3 ? (
                /* Count badge: numeric glyph with CVD-safe luminance border (BLD-2742) */
                <View style={[
                  styles.countBadge,
                  { backgroundColor: isSel ? colors.onPrimary : colors.primary },
                  !isSel && styles.countBadgeBorder,
                  !isSel && { borderColor: colors.onBackground },
                ]}>
                  <Text style={[styles.countBadgeText, { color: isSel ? colors.primary : colors.onPrimary }]}>{count}</Text>
                </View>
              ) : (
                <>
                  {/* CVD fix: dot has both fill AND borderWidth ring so it reads as
                      a distinct shape (ringed circle) in grayscale. */}
                   <View
                     testID={`cal-dot-${key}-0`}
                     style={[
                       styles.dot,
                       { backgroundColor: dotColor },
                       !isSel && [styles.dotBorder, { borderColor: dotBorderColor }],
                     ]}
                   />
                   {count > 1 && (
                     <View
                       testID={`cal-dot-${key}-1`}
                       style={[
                         styles.dot,
                         { backgroundColor: dotColor },
                         !isSel && [styles.dotBorder, { borderColor: dotBorderColor }],
                       ]}
                     />
                  )}
                </>
              )}
            </View>
          )}

          {/* Scheduled hollow dot — hollow circle (transparent fill + border ring).
              Only rendered when no workouts logged. Distinguishable from workout dots
              (filled) and rest days (no dot) in pure grayscale. */}
          {count === 0 && isScheduled && (
            <View style={styles.dots} testID={`cal-day-${key}-scheduled`}>
              <View
                testID={`cal-dot-${key}-scheduled`}
                style={[styles.dot, {
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: isSel ? colors.onPrimary : colors.primary,
                }]}
              />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < offset; i++) cells.push(<View key={`pad-${i}`} style={{ width: COLUMN_WIDTH_PCT, height: cellSize }} />);
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
          <View key={d} style={[styles.cell, { width: COLUMN_WIDTH_PCT, height: 28 }]}>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs * scale }}>{d}</Text>
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
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start" },
  cell: { alignItems: "center", justifyContent: "center", marginVertical: 2, minHeight: MIN_TOUCH_TARGET },
  /** BLD-3654: Inner highlight surface. Always a square (cellSize×cellSize) so the
   *  circle/ring is centered over the date glyph regardless of column width. */
  highlight: { alignItems: "center", justifyContent: "center" },
  dots: { flexDirection: "row", gap: 3, position: "absolute", bottom: 4 },
  dot: { width: 8, height: 8, borderRadius: radii.pill },
  /** CVD-safe luminance affordance: dark outline makes unselected dots distinguishable
   *  without relying on the coral hue alone (WCAG 1.4.1). Applied only when !isSel.
   *  BLD-3498: strengthened from 1→1.5 for low-vision / automated CVD heuristic coverage. */
  dotBorder: { borderWidth: 1.5 },
  countBadge: { minWidth: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  /** CVD-safe luminance affordance: dark outline on the unselected count badge (WCAG 1.4.1). */
  countBadgeBorder: { borderWidth: 1.5 },
  countBadgeText: { fontSize: fontSizes.xs, fontWeight: "700", textAlign: "center" },
});
