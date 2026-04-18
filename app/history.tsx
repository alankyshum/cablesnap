import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { FlashList } from "@shopify/flash-list";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/ui/icon";
import { SearchBar } from "@/components/ui/searchbar";
import { Flame, Trophy, Dumbbell, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, X } from "lucide-react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getAllCompletedSessionWeeks,
  getRecentSessions,
  getSessionCountsByDay,
  getSessionsByMonth,
  getTotalSessionCount,
  searchSessions,
} from "../lib/db";
import { getSchedule, type ScheduleEntry } from "../lib/db/settings";
import type { WorkoutSession } from "../lib/types";
import { useLayout } from "../lib/layout";
import ErrorBoundary from "../components/ErrorBoundary";
import RatingWidget from "../components/RatingWidget";
import WorkoutHeatmap from "../components/WorkoutHeatmap";
import {
  computeLongestStreak,
  computeStreak,
  DAYS,
  formatDateKey,
  formatDuration,
  withOpacity,
} from "../lib/format";
import { duration as animDuration, radii, spacing } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

type SessionRow = WorkoutSession & { set_count: number };

function weekday(d: Date): number {
  return (d.getDay() + 6) % 7; // Mon=0..Sun=6
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

const SWIPE_THRESHOLD = 20;
const MIN_TOUCH_TARGET = 48;

function HistoryScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const reducedMotion = useReducedMotion();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionRow[] | null>(null);
  const [hasAny, setHasAny] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
  const [screenReaderEnabled, setScreenReaderEnabled] = useState(false);
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(false);
  const dayDetailRef = useRef<View>(null);
  const selectedCellRef = useRef<View>(null);
  const prevSelected = useRef<string | null>(null);

  // Swipe animation
  const translateX = useSharedValue(0);
  const animatedCalendarStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Heatmap + streak state
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapError, setHeatmapError] = useState(false);
  const [heatmapExpanded, setHeatmapExpanded] = useState(true);

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReaderEnabled);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotionEnabled);
    const srSub = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setScreenReaderEnabled
    );
    const rmSub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotionEnabled
    );
    return () => {
      srSub.remove();
      rmSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Focus management for day detail panel
  useEffect(() => {
    if (selected && selected !== prevSelected.current) {
      // Panel expanding — focus the panel heading
      setTimeout(() => {
        dayDetailRef.current?.focus?.();
      }, 100);
    } else if (!selected && prevSelected.current) {
      // Panel collapsing — focus back to the calendar cell
      setTimeout(() => {
        selectedCellRef.current?.focus?.();
      }, 100);
    }
    prevSelected.current = selected;
  }, [selected]);

  const load = useCallback(async () => {
    const [data, any] = await Promise.all([
      getSessionsByMonth(year, month),
      getRecentSessions(1),
    ]);
    setSessions(data);
    setHasAny(any.length > 0);
  }, [year, month]);

  const loadHeatmap = useCallback(async () => {
    setHeatmapLoading(true);
    setHeatmapError(false);
    try {
      const today = new Date();
      const endTs = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime();
      const startTs = endTs - 16 * 7 * 24 * 60 * 60 * 1000;

      const [counts, allWeeks, total] = await Promise.all([
        getSessionCountsByDay(startTs, endTs),
        getAllCompletedSessionWeeks(),
        getTotalSessionCount(),
      ]);

      const map = new Map<string, number>();
      for (const row of counts) {
        map.set(row.date, row.count);
      }
      setHeatmapData(map);
      setCurrentStreak(computeStreak(allWeeks));
      setLongestStreak(computeLongestStreak(allWeeks));
      setTotalWorkouts(total);
    } catch {
      setHeatmapError(true);
    } finally {
      setHeatmapLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      loadHeatmap();
      getSchedule().then(setSchedule).catch(() => setSchedule([]));
    }, [load, loadHeatmap])
  );

  const dotMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const key = formatDateKey(s.started_at);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  // Schedule lookup: day_of_week → ScheduleEntry
  const scheduleMap = useMemo(() => {
    const map = new Map<number, ScheduleEntry>();
    for (const entry of schedule) {
      map.set(entry.day_of_week, entry);
    }
    return map;
  }, [schedule]);

  // Per-month summary stats
  const monthSummary = useMemo(() => {
    const count = sessions.length;
    const totalHours = sessions.reduce(
      (sum, s) => sum + (s.duration_seconds ?? 0),
      0
    ) / 3600;
    return { count, totalHours: Math.round(totalHours * 10) / 10 };
  }, [sessions]);

  const filtered = useMemo(() => {
    if (results) return results;
    if (!selected) return sessions;
    return sessions.filter((s) => formatDateKey(s.started_at) === selected);
  }, [sessions, selected, results]);

  const changeMonth = useCallback(
    (direction: -1 | 1) => {
      const animDurationMs = reducedMotion ? 0 : animDuration.normal;
      const slideDistance = layout.width * direction * -1;
      translateX.value = slideDistance;
      translateX.value = withTiming(0, { duration: animDurationMs });
      setSelected(null);
      setQuery("");
      setResults(null);
      if (direction === -1) {
        if (month === 0) {
          setMonth(11);
          setYear(year - 1);
        } else {
          setMonth(month - 1);
        }
      } else {
        if (month === 11) {
          setMonth(0);
          setYear(year + 1);
        } else {
          setMonth(month + 1);
        }
      }
    },
    [month, year, layout.width, reducedMotion, translateX]
  );

  const prevMonth = () => changeMonth(-1);
  const nextMonth = () => changeMonth(1);

  // Swipe gesture for month navigation (disabled when screen reader active)
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-SWIPE_THRESHOLD, SWIPE_THRESHOLD])
        .enabled(!screenReaderEnabled)
        .onEnd((e: { translationX: number }) => {
          if (e.translationX < -SWIPE_THRESHOLD) {
            changeMonth(1);
          } else if (e.translationX > SWIPE_THRESHOLD) {
            changeMonth(-1);
          }
        })
        .runOnJS(true),
    [screenReaderEnabled, changeMonth]
  );

  const onSearch = (text: string) => {
    setQuery(text);
    setSelected(null);
    if (timer.current) clearTimeout(timer.current);
    if (!text.trim()) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(async () => {
      const data = await searchSessions(text.trim());
      setResults(data);
    }, 300);
  };

  const clearFilter = () => {
    setSelected(null);
    setQuery("");
    setResults(null);
  };

  const tapDay = (key: string) => {
    setQuery("");
    setResults(null);
    if (!reduceMotionEnabled) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setSelected(selected === key ? null : key);
  };

  const onHeatmapDayPress = (dateKey: string) => {
    const [y, m] = dateKey.split("-").map(Number);
    if (y !== year || m - 1 !== month) {
      setYear(y);
      setMonth(m - 1);
    }
    setQuery("");
    setResults(null);
    setSelected(dateKey);
  };

  // Calendar grid
  const total = daysInMonth(year, month);
  const offset = weekday(new Date(year, month, 1));
  const today = new Date();
  const todayKey = formatDateKey(today.getTime());
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const cellSize = Math.max(MIN_TOUCH_TARGET, Math.floor(layout.width / 7) - 4);

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
    if (isSel) {
      cellBg = colors.primary;
    } else if (count > 0) {
      cellBg = withOpacity(colors.primaryContainer, 0.4);
    } else if (isScheduled) {
      cellBg = withOpacity(colors.primaryContainer, 0.2);
    }

    const label =
      count > 0
        ? `${day} ${monthLabel(year, month)}, ${count} workout${count > 1 ? "s" : ""}`
        : isMissedScheduled
          ? `${day} ${monthLabel(year, month)}, missed scheduled workout`
          : isScheduled && isFuture
            ? `${day} ${monthLabel(year, month)}, scheduled: ${scheduleEntry.template_name}`
            : `${day} ${monthLabel(year, month)}, rest day`;

    return (
      <Pressable
        key={key}
        ref={isSel ? selectedCellRef : undefined}
        onPress={() => tapDay(key)}
        accessibilityLabel={label}
        accessibilityRole="button"
        style={[
          styles.cell,
          {
            width: cellSize,
            height: cellSize,
            borderRadius: cellSize / 2,
            borderWidth: isToday ? 2 : 0,
            borderColor: isToday ? colors.primary : "transparent",
            backgroundColor: cellBg,
          },
        ]}
      >
        <Text
          variant="caption"
          style={{
            color: isSel
              ? colors.onPrimary
              : colors.onBackground,
            fontSize: 14 * layout.scale,
          }}
        >
          {day}
        </Text>
        {count > 0 && (
          <View style={styles.dots}>
            {count >= 3 ? (
              <View
                style={[
                  styles.countBadge,
                  {
                    backgroundColor: isSel
                      ? colors.onPrimary
                      : colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.countBadgeText,
                    {
                      color: isSel
                        ? colors.primary
                        : colors.onPrimary,
                    },
                  ]}
                >
                  {count}
                </Text>
              </View>
            ) : (
              <>
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: isSel
                        ? colors.onPrimary
                        : colors.primary,
                    },
                  ]}
                />
                {count > 1 && (
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: isSel
                          ? colors.onPrimary
                          : colors.primary,
                      },
                    ]}
                  />
                )}
              </>
            )}
          </View>
        )}
      </Pressable>
    );
  };

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < offset; i++) {
    cells.push(
      <View key={`pad-${i}`} style={{ width: cellSize, height: cellSize }} />
    );
  }
  for (let d = 1; d <= total; d++) {
    cells.push(renderDay(d));
  }

  // Inline day detail panel data
  const dayDetailSessions = useMemo(() => {
    if (!selected) return [];
    return sessions.filter((s) => formatDateKey(s.started_at) === selected);
  }, [sessions, selected]);

  const selectedDayScheduleEntry = useMemo(() => {
    if (!selected) return null;
    const parts = selected.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const dow = weekday(d);
    return scheduleMap.get(dow) ?? null;
  }, [selected, scheduleMap]);

  const isSelectedDayFuture = useMemo(() => {
    if (!selected) return false;
    const parts = selected.split("-").map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return d.getTime() > todayStart.getTime();
  }, [selected]);

  const renderDayDetailPanel = () => {
    if (!selected) return null;

    const selectedDay = Number(selected.split("-")[2]);
    const dayLabel = new Date(year, month, selectedDay).toLocaleDateString(
      undefined,
      { weekday: "long", month: "long", day: "numeric" }
    );

    return (
      <View
        ref={dayDetailRef}
        style={[styles.dayDetailPanel, { backgroundColor: colors.surfaceVariant }]}
        accessibilityLiveRegion="polite"
        accessibilityRole="summary"
        accessible
      >
        <Text
          variant="subtitle"
          style={{ color: colors.onSurface, marginBottom: spacing.xs }}
        >
          {dayLabel}
        </Text>
        {dayDetailSessions.length > 0 ? (
          dayDetailSessions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push(`/session/detail/${s.id}`)}
              style={[
                styles.dayDetailItem,
                { backgroundColor: colors.surface },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${s.name || "Untitled workout"}, ${formatDuration(s.duration_seconds)}, ${s.set_count} sets`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  variant="body"
                  numberOfLines={1}
                  style={{ color: colors.onSurface }}
                >
                  {s.name || "Untitled workout"}
                </Text>
                <Text
                  variant="caption"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {formatDuration(s.duration_seconds)} · {s.set_count} sets
                </Text>
              </View>
              {s.rating != null && s.rating > 0 && (
                <RatingWidget value={s.rating} readOnly size="small" />
              )}
              <Icon name={ChevronRight} size={20} color={colors.onSurfaceVariant} />
            </Pressable>
          ))
        ) : isSelectedDayFuture && selectedDayScheduleEntry ? (
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
            Scheduled: {selectedDayScheduleEntry.template_name}
          </Text>
        ) : (
          <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
            Rest day
          </Text>
        )}
      </View>
    );
  };

  const renderSession = useCallback(({ item }: { item: SessionRow }) => {
    const date = new Date(item.started_at).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <Pressable
          onPress={() => router.push(`/session/detail/${item.id}`)}
          accessibilityLabel={`${item.name || "Untitled workout"}, ${date}, ${formatDuration(item.duration_seconds)}, ${item.set_count} sets${item.rating ? `, rated ${item.rating} out of 5` : ""}`}
          accessibilityRole="button"
        >
          <Card style={{ ...styles.card, backgroundColor: colors.surface }}>
            <CardContent>
              <View style={styles.cardHeader}>
                <Text variant="subtitle" style={{ color: colors.onSurface, flex: 1, minWidth: 0 }} numberOfLines={1}>
                  {item.name || "Untitled workout"}
                </Text>
                {item.rating != null && item.rating > 0 && (
                  <RatingWidget value={item.rating} readOnly size="small" />
                )}
              </View>
              <Text
                variant="caption"
                style={{ color: colors.onSurfaceVariant }}
              >
                {date} · {formatDuration(item.duration_seconds)} · {item.set_count} sets
              </Text>
            </CardContent>
          </Card>
        </Pressable>
      </Animated.View>
    );
  }, [colors, router]);

  const emptyMessage = () => {
    if (query.trim()) return `No workouts matching "${query}"`;
    if (selected) return "Rest day!";
    if (!hasAny) return "No workouts yet. Start your first workout!";
    return `No workouts in ${monthLabel(year, month)}`;
  };

  return (
    <FlashList
      data={filtered}
      keyExtractor={(item) => item.id}
      renderItem={renderSession}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 40 }}
      ListHeaderComponent={
        <>
          {/* Streak Summary Bar */}
          <Card style={{ ...styles.streakCard, backgroundColor: colors.surface }}>
            <CardContent style={styles.streakRow}>
              <View style={styles.streakItem} accessibilityLabel={`Current streak: ${currentStreak} weeks`}>
                <Icon name={Flame} size={20} color={colors.primary} />
                <Text variant="subtitle" style={{ color: colors.onSurface }}>{currentStreak}</Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>weeks</Text>
              </View>
              <View style={styles.streakItem} accessibilityLabel={`Longest streak: ${longestStreak} weeks`}>
                <Icon name={Trophy} size={20} color={colors.primary} />
                <Text variant="subtitle" style={{ color: colors.onSurface }}>{longestStreak}</Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>weeks</Text>
              </View>
              <View style={styles.streakItem} accessibilityLabel={`Total workouts: ${totalWorkouts}`}>
                <Icon name={Dumbbell} size={20} color={colors.primary} />
                <Text variant="subtitle" style={{ color: colors.onSurface }}>{totalWorkouts}</Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>total</Text>
              </View>
            </CardContent>
          </Card>

          {/* Heatmap Section */}
          <View style={styles.heatmapSection}>
            <Pressable
              onPress={() => setHeatmapExpanded(!heatmapExpanded)}
              style={styles.heatmapHeader}
              accessibilityRole="button"
              accessibilityLabel={`Last 16 Weeks, ${heatmapExpanded ? "collapse" : "expand"}`}
              accessibilityState={{ expanded: heatmapExpanded }}
            >
              <Text variant="subtitle" style={{ color: colors.onBackground }}>
                Last 16 Weeks
              </Text>
              <Icon
                name={heatmapExpanded ? ChevronUp : ChevronDown}
                size={20}
                color={colors.onSurfaceVariant}
              />
            </Pressable>
            {heatmapExpanded && (
              heatmapLoading ? (
                <View style={styles.heatmapLoading}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : heatmapError ? (
                <View style={styles.heatmapLoading}>
                  <Text variant="caption" style={{ color: colors.error }}>
                    Unable to load heatmap data. Pull down to retry.
                  </Text>
                </View>
              ) : (
                <WorkoutHeatmap
                  data={heatmapData}
                  weeks={16}
                  onDayPress={onHeatmapDayPress}
                />
              )
            )}
          </View>

          {/* Search */}
          <SearchBar
            placeholder="Search workouts"
            value={query}
            onChangeText={onSearch}
            containerStyle={[styles.search, { backgroundColor: colors.surface }]}
            accessibilityLabel="Search workout history"
          />

          {/* Month Navigation */}
          <View style={styles.monthNav}>
            <Pressable
              onPress={prevMonth}
              accessibilityLabel="Previous month"
              style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name={ChevronLeft} size={24} />
            </Pressable>
            <Text
              variant="subtitle"
              style={{ color: colors.onBackground }}
            >
              {monthLabel(year, month)}
            </Text>
            <Pressable
              onPress={nextMonth}
              accessibilityLabel="Next month"
              style={{ minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
            >
              <Icon name={ChevronRight} size={24} />
            </Pressable>
          </View>

          {/* Per-Month Summary Bar */}
          <Text
            variant="caption"
            style={[
              styles.monthSummary,
              { color: colors.onSurfaceVariant },
            ]}
            accessibilityLabel={
              monthSummary.count > 0
                ? `${monthSummary.count} workouts, ${monthSummary.totalHours} hours this month`
                : "No workouts this month"
            }
          >
            {monthSummary.count > 0
              ? `${monthSummary.count} workout${monthSummary.count !== 1 ? "s" : ""} · ${monthSummary.totalHours} hrs`
              : "No workouts this month"}
          </Text>

          {/* Day-of-week headers */}
          <View style={styles.grid}>
            {DAYS.map((d) => (
              <View key={d} style={[styles.cell, { width: cellSize, height: 28 }]}>
                <Text
                  variant="caption"
                  style={{ color: colors.onSurfaceVariant, fontSize: 12 * layout.scale }}
                >
                  {d}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid with swipe gesture */}
          <GestureDetector gesture={swipeGesture}>
            <Animated.View style={[styles.grid, animatedCalendarStyle]}>
              {cells}
            </Animated.View>
          </GestureDetector>

          {/* Inline Day Detail Panel */}
          {renderDayDetailPanel()}

          {/* Active filter chip */}
          {(selected || query.trim()) && (
            <Chip
              icon={<Icon name={X} size={16} />}
              onPress={clearFilter}
              style={styles.chip}
              accessibilityLabel="Clear filter"
            >
              {query.trim()
                ? `Search: ${query}`
                : `${new Date(year, month, Number(selected!.split("-")[2])).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`}
            </Chip>
          )}
        </>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant }}
          >
            {emptyMessage()}
          </Text>
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
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  streakCard: {
    marginBottom: 12,
  },
  streakRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 4,
  },
  streakItem: {
    alignItems: "center",
    gap: 2,
  },
  heatmapSection: {
    marginBottom: 12,
  },
  heatmapHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  heatmapLoading: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    marginBottom: 12,
  },
  monthNav: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
  },
  cell: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 2,
    marginHorizontal: 2,
    minHeight: MIN_TOUCH_TARGET,
  },
  dots: {
    flexDirection: "row",
    gap: 3,
    position: "absolute",
    bottom: 4,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.sm,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },
  monthSummary: {
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  dayDetailPanel: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    gap: spacing.xs,
  },
  dayDetailItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.sm,
    borderRadius: radii.md,
    gap: spacing.sm,
    marginTop: spacing.xxs,
  },
  card: {
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  chip: {
    alignSelf: "flex-start",
    marginBottom: 12,
    marginTop: 4,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
});
