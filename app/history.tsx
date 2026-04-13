import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  Card,
  Chip,
  IconButton,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getRecentSessions,
  getSessionsByMonth,
  searchSessions,
} from "../lib/db";
import type { WorkoutSession } from "../lib/types";
import { useLayout } from "../lib/layout";
import ErrorBoundary from "../components/ErrorBoundary";

type SessionRow = WorkoutSession & { set_count: number };

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function weekday(d: Date): number {
  return (d.getDay() + 6) % 7; // Mon=0..Sun=6
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function dateKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
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

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const dotMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const key = dateKey(s.started_at);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [sessions]);

  const filtered = useMemo(() => {
    if (results) return results;
    if (!selected) return sessions;
    return sessions.filter((s) => dateKey(s.started_at) === selected);
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

  // Calendar grid
  const total = daysInMonth(year, month);
  const offset = weekday(new Date(year, month, 1));
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const cellSize = Math.max(44, Math.floor(layout.width / 7) - 4);

  const renderDay = (day: number) => {
    const key = `${year}-${month}-${day}`;
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

  const renderSession = useCallback(({ item }: ListRenderItemInfo<SessionRow>) => {
    const date = new Date(item.started_at).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return (
      <Card
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
        onPress={() => router.push(`/session/detail/${item.id}`)}
        accessibilityLabel={`${item.name || "Untitled workout"}, ${date}, ${formatDuration(item.duration_seconds)}, ${item.set_count} sets`}
        accessibilityRole="button"
      >
        <Card.Content>
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
            {item.name || "Untitled workout"}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {date} · {formatDuration(item.duration_seconds)} · {item.set_count} sets
          </Text>
        </Card.Content>
      </Card>
    );
  }, [theme, router]);

  const emptyMessage = () => {
    if (query.trim()) return `No workouts matching "${query}"`;
    if (selected) return "Rest day!";
    if (!hasAny) return "No workouts yet. Start your first workout!";
    return `No workouts in ${monthLabel(year, month)}`;
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
    >
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

      {/* Session List */}
      {filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {emptyMessage()}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={renderSession}
        />
      )}
    </ScrollView>
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
