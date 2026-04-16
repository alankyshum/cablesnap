import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { FlashList } from "@shopify/flash-list";
import {
  Card,
  Chip,
  Icon,
  IconButton,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getAllCompletedSessionWeeks,
  getRecentSessions,
  getSessionCountsByDay,
  getSessionsByMonth,
  getTotalSessionCount,
  searchSessions,
} from "../lib/db";
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

function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const layout = useLayout();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SessionRow[] | null>(null);
  const [hasAny, setHasAny] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Heatmap + streak state
  const [heatmapData, setHeatmapData] = useState<Map<string, number>>(new Map());
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const [totalWorkouts, setTotalWorkouts] = useState(0);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [heatmapError, setHeatmapError] = useState(false);
  const [heatmapExpanded, setHeatmapExpanded] = useState(true);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

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

  const filtered = useMemo(() => {
    if (results) return results;
    if (!selected) return sessions;
    return sessions.filter((s) => formatDateKey(s.started_at) === selected);
  }, [sessions, selected, results]);

  const prevMonth = () => {
    setSelected(null);
    setQuery("");
    setResults(null);
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  };

  const nextMonth = () => {
    setSelected(null);
    setQuery("");
    setResults(null);
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  };

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
  const cellSize = Math.max(44, Math.floor(layout.width / 7) - 4);

  const renderDay = (day: number) => {
    const key = formatDateKey(new Date(year, month, day).getTime());
    const count = dotMap.get(key) ?? 0;
    const isToday = key === todayKey;
    const isSel = key === selected;

    const label =
      count > 0
        ? `${day} ${monthLabel(year, month)}, ${count} workout${count > 1 ? "s" : ""}`
        : `${day} ${monthLabel(year, month)}, rest day`;

    return (
      <Pressable
        key={key}
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
            borderColor: isToday ? theme.colors.primary : "transparent",
            backgroundColor: isSel
              ? theme.colors.primary
              : count > 0
                ? withOpacity(theme.colors.primaryContainer, 0.4)
                : "transparent",
          },
        ]}
      >
        <Text
          variant="bodySmall"
          style={{
            color: isSel
              ? theme.colors.onPrimary
              : theme.colors.onBackground,
            fontSize: 14 * layout.scale,
          }}
        >
          {day}
        </Text>
        {count > 0 && (
          <View style={styles.dots}>
            <View
              style={[
                styles.dot,
                { backgroundColor: isSel ? theme.colors.onPrimary : theme.colors.primary },
              ]}
            />
            {count > 1 && (
              <View
                style={[
                  styles.dot,
                  { backgroundColor: isSel ? theme.colors.onPrimary : theme.colors.primary },
                ]}
              />
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

  const renderSession = useCallback(({ item }: { item: SessionRow }) => {
    const date = new Date(item.started_at).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          onPress={() => router.push(`/session/detail/${item.id}`)}
          accessibilityLabel={`${item.name || "Untitled workout"}, ${date}, ${formatDuration(item.duration_seconds)}, ${item.set_count} sets${item.rating ? `, rated ${item.rating} out of 5` : ""}`}
          accessibilityRole="button"
        >
          <Card.Content>
            <View style={styles.cardHeader}>
              <Text variant="titleSmall" style={{ color: theme.colors.onSurface, flex: 1, minWidth: 0 }} numberOfLines={1}>
                {item.name || "Untitled workout"}
              </Text>
              {item.rating != null && item.rating > 0 && (
                <RatingWidget value={item.rating} readOnly size="small" />
              )}
            </View>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {date} · {formatDuration(item.duration_seconds)} · {item.set_count} sets
            </Text>
          </Card.Content>
        </Card>
      </Animated.View>
    );
  }, [theme, router]);

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
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 40 }}
      ListHeaderComponent={
        <>
          {/* Streak Summary Bar */}
          <Card style={[styles.streakCard, { backgroundColor: theme.colors.surface }]}>
            <Card.Content style={styles.streakRow}>
              <View style={styles.streakItem} accessibilityLabel={`Current streak: ${currentStreak} weeks`}>
                <Icon source="whatshot" size={20} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{currentStreak}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>weeks</Text>
              </View>
              <View style={styles.streakItem} accessibilityLabel={`Longest streak: ${longestStreak} weeks`}>
                <Icon source="emoji-events" size={20} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{longestStreak}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>weeks</Text>
              </View>
              <View style={styles.streakItem} accessibilityLabel={`Total workouts: ${totalWorkouts}`}>
                <Icon source="fitness-center" size={20} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>{totalWorkouts}</Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>total</Text>
              </View>
            </Card.Content>
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
              <Text variant="titleSmall" style={{ color: theme.colors.onBackground }}>
                Last 16 Weeks
              </Text>
              <Icon
                source={heatmapExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                color={theme.colors.onSurfaceVariant}
              />
            </Pressable>
            {heatmapExpanded && (
              heatmapLoading ? (
                <View style={styles.heatmapLoading}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                </View>
              ) : heatmapError ? (
                <View style={styles.heatmapLoading}>
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>
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
          <Searchbar
            placeholder="Search workouts"
            value={query}
            onChangeText={onSearch}
            style={[styles.search, { backgroundColor: theme.colors.surface }]}
            accessibilityLabel="Search workout history"
          />

          {/* Month Navigation */}
          <View style={styles.monthNav}>
            <IconButton
              icon="chevron-left"
              onPress={prevMonth}
              accessibilityLabel="Previous month"
            />
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onBackground }}
            >
              {monthLabel(year, month)}
            </Text>
            <IconButton
              icon="chevron-right"
              onPress={nextMonth}
              accessibilityLabel="Next month"
            />
          </View>

          {/* Day-of-week headers */}
          <View style={styles.grid}>
            {DAYS.map((d) => (
              <View key={d} style={[styles.cell, { width: cellSize, height: 28 }]}>
                <Text
                  variant="labelSmall"
                  style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 * layout.scale }}
                >
                  {d}
                </Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.grid}>{cells}</View>

          {/* Active filter chip */}
          {(selected || query.trim()) && (
            <Chip
              icon="close"
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
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
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
    minHeight: 44,
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
    borderRadius: 2.5,
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
