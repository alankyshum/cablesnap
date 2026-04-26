import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useFocusEffect } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useSegmentStyles } from "./useSegmentStyles";
import {
  getMonthlyWorkoutDates,
  getWorkoutDatesForStreak,
  calculateStreaks,
  formatMonthYear,
  dateToISO,
  type WorkoutDay,
} from "@/lib/db/calendar";
import CalendarGrid from "./CalendarGrid";
import CalendarDayDetail from "./CalendarDayDetail";
import CalendarStreaks from "./CalendarStreaks";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  weekStartDay: number;
};

export default function CalendarView({ weekStartDay }: Props) {
  const colors = useThemeColors();
  const { scrollContainer, contentContainer } = useSegmentStyles();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [workoutDays, setWorkoutDays] = useState<WorkoutDay[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const todayDate = new Date();
  const todayStr = dateToISO(
    todayDate.getFullYear(),
    todayDate.getMonth(),
    todayDate.getDate()
  );

  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth();

  const workoutDateSet = new Set(workoutDays.map((d) => d.workout_date));

  const loadData = async (y: number, m: number) => {
    setLoading(true);
    setError(false);
    try {
      const [days, streakDates] = await Promise.all([
        getMonthlyWorkoutDates(y, m),
        getWorkoutDatesForStreak(),
      ]);
      setWorkoutDays(days);
      const { currentStreak: cs, longestStreak: ls } =
        calculateStreaks(streakDates);
      setCurrentStreak(cs);
      setLongestStreak(ls);
      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  useFocusEffect(
    // eslint-disable-next-line react-hooks/preserve-manual-memoization
    useCallback(() => {
      loadData(year, month);
    }, [year, month])
  );

  const goToPrevMonth = () => {
    setSelectedDate(null);
    if (month === 0) {
      setYear(year - 1);
      setMonth(11);
    } else {
      setMonth(month - 1);
    }
  };

  const goToNextMonth = () => {
    if (isCurrentMonth) return;
    setSelectedDate(null);
    if (month === 11) {
      setYear(year + 1);
      setMonth(0);
    } else {
      setMonth(month + 1);
    }
  };

  const goToToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelectedDate(null);
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(selectedDate === dateStr ? null : dateStr);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { flex: 1 }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { flex: 1 }]}>
        <Text style={{ color: colors.error, textAlign: "center", marginBottom: 12 }}>
          Could not load calendar data
        </Text>
        <Pressable
          onPress={() => loadData(year, month)}
          style={[styles.retryButton, { borderColor: colors.primary }]}
          accessibilityRole="button"
          accessibilityLabel="Retry loading calendar"
        >
          <Text style={{ color: colors.primary, fontWeight: "600" }}>
            Retry
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    // bounded list — ScrollView is intentional: renders fixed calendar grid + streak stats, not unbounded .map()
    <ScrollView
      style={scrollContainer}
      contentContainerStyle={contentContainer}
    >
      {/* Month navigation header */}
      <View style={styles.header}>
        <View style={styles.navRow}>
          <Pressable
            onPress={goToPrevMonth}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            hitSlop={12}
            style={styles.navButton}
          >
            <Text style={[styles.navArrow, { color: colors.onSurface }]}>
              {"<"}
            </Text>
          </Pressable>

          <Text
            variant="subtitle"
            style={[styles.monthTitle, { color: colors.onSurface }]}
          >
            {formatMonthYear(year, month)}
          </Text>

          <Pressable
            onPress={goToNextMonth}
            disabled={isCurrentMonth}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            hitSlop={12}
            style={styles.navButton}
          >
            <Text
              style={[
                styles.navArrow,
                { color: isCurrentMonth ? colors.disabled : colors.onSurface },
              ]}
            >
              {">"}
            </Text>
          </Pressable>
        </View>

        {!isCurrentMonth && (
          <Pressable
            onPress={goToToday}
            accessibilityRole="button"
            accessibilityLabel="Go to current month"
            style={[styles.todayButton, { borderColor: colors.primary }]}
          >
            <Text
              variant="caption"
              style={{ color: colors.primary, fontWeight: "600" }}
            >
              Today
            </Text>
          </Pressable>
        )}
      </View>

      {/* Calendar grid */}
      <CalendarGrid
        year={year}
        month={month}
        weekStartDay={weekStartDay}
        workoutDates={workoutDateSet}
        selectedDate={selectedDate}
        todayStr={todayStr}
        onSelectDate={handleSelectDate}
      />

      {/* Streaks */}
      <View style={styles.streaksWrap}>
        <CalendarStreaks
          currentStreak={currentStreak}
          longestStreak={longestStreak}
        />
      </View>

      {/* Day detail */}
      {selectedDate && <CalendarDayDetail dateStr={selectedDate} />}

      {/* Empty state */}
      {workoutDays.length === 0 && !selectedDate && (
        <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
          <Text
            style={{
              color: colors.onSurfaceVariant,
              textAlign: "center",
            }}
          >
            No workouts this month. Start your first workout to see your
            calendar fill up!
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  navButton: {
    padding: 8,
  },
  navArrow: {
    fontSize: fontSizes.xl,
    fontWeight: "700",
  },
  monthTitle: {
    fontSize: fontSizes.lg,
    fontWeight: "700",
    marginHorizontal: 12,
  },
  todayButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  streaksWrap: {
    marginTop: 12,
  },
  emptyState: {
    borderRadius: 12,
    padding: 24,
    marginTop: 12,
  },
});
