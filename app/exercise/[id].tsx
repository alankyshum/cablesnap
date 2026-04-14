import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Button, Card, Chip, IconButton, Snackbar, Text, useTheme } from "react-native-paper";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { LineChart } from "react-native-chart-kit";
import {
  getExerciseById,
  softDeleteCustomExercise,
  getTemplatesUsingExercise,
  getExerciseHistory,
  getExerciseRecords,
  getExerciseChartData,
  getBodySettings,
  getBestSet,
  type ExerciseSession,
  type ExerciseRecords as Records,
} from "../../lib/db";
import { CATEGORY_LABELS, MOUNT_POSITION_LABELS, ATTACHMENT_LABELS, type Exercise } from "../../lib/types";
import { semantic, difficultyText } from "../../constants/theme";
import { rpeColor, rpeText } from "../../lib/rpe";
import { toDisplay } from "../../lib/units";
import { epley, percentageTable } from "../../lib/rm";

const PAGE_SIZE = 10;
const MAX_ITEMS = 50;

const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: semantic.beginner,
  intermediate: semantic.intermediate,
  advanced: semantic.advanced,
};

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ts));
}

function formatDateLong(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(ts));
}

export default function ExerciseDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [toast, setToast] = useState("");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");

  // Records state
  const [records, setRecords] = useState<Records | null>(null);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState(false);
  const [best, setBest] = useState<{ weight: number; reps: number } | null>(null);

  // Chart state
  const [chart, setChart] = useState<{ date: number; value: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState(false);

  // History state
  const [history, setHistory] = useState<ExerciseSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadRecords = useCallback(async (eid: string) => {
    setRecordsLoading(true);
    setRecordsError(false);
    try {
      const [r, b] = await Promise.all([getExerciseRecords(eid), getBestSet(eid)]);
      setRecords(r);
      setBest(b);
    } catch {
      setRecordsError(true);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  const loadChart = useCallback(async (eid: string) => {
    setChartLoading(true);
    setChartError(false);
    try {
      const c = await getExerciseChartData(eid);
      setChart(c);
    } catch {
      setChartError(true);
    } finally {
      setChartLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (eid: string) => {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const h = await getExerciseHistory(eid, PAGE_SIZE, 0);
      setHistory(h);
      setHasMore(h.length >= PAGE_SIZE);
    } catch {
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      getExerciseById(id).then(setExercise);
      getBodySettings().then((s) => setUnit(s.weight_unit));
      loadRecords(id);
      loadChart(id);
      loadHistory(id);
    }, [id, loadRecords, loadChart, loadHistory])
  );

  const loadMore = useCallback(async () => {
    if (!id || loadingMore || !hasMore || history.length >= MAX_ITEMS) return;
    setLoadingMore(true);
    try {
      const more = await getExerciseHistory(id, PAGE_SIZE, history.length);
      setHistory((prev) => [...prev, ...more]);
      setHasMore(more.length >= PAGE_SIZE && history.length + more.length < MAX_ITEMS);
    } catch {
      // silent — footer indicator disappears
    } finally {
      setLoadingMore(false);
    }
  }, [id, loadingMore, hasMore, history.length]);

  const edit = useCallback(() => {
    if (id) router.push(`/exercise/edit/${id}`);
  }, [id, router]);

  const remove = useCallback(async () => {
    if (!id || !exercise) return;
    const templates = await getTemplatesUsingExercise(id);
    const msg = templates.length > 0
      ? `Delete ${exercise.name}? This exercise is used in ${templates.length} template(s). It will be removed from those templates.`
      : `Delete ${exercise.name}? This exercise will be removed from the library.`;
    Alert.alert("Delete Exercise", msg, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await softDeleteCustomExercise(id);
            setToast("Exercise deleted");
            setTimeout(() => router.back(), 400);
          } catch {
            setToast("Failed to delete exercise");
          }
        },
      },
    ]);
  }, [id, exercise, router]);

  if (!exercise) {
    return (
      <>
        <Stack.Screen options={{ title: "Exercise" }} />
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const steps = exercise.instructions
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const bw = records?.is_bodyweight ?? false;
  const chartWidth = screenWidth - 48;

  const chartConfig = {
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    color: () => theme.colors.primary,
    labelColor: () => theme.colors.onSurfaceVariant,
    decimalPlaces: bw ? 0 : 1,
    propsForBackgroundLines: { stroke: theme.colors.outlineVariant },
  };

  // Chart accessibility summary
  const chartSummary = chart.length >= 2
    ? (() => {
        const start = chart[0].value;
        const end = chart[chart.length - 1].value;
        const pct = start > 0 ? Math.round(((end - start) / start) * 100) : 0;
        const label = bw ? "reps" : unit;
        const sv = bw ? start : toDisplay(start, unit);
        const ev = bw ? end : toDisplay(end, unit);
        const dir = pct >= 0 ? "+" : "";
        return `Your ${exercise.name} progressed from ${sv}${label} to ${ev}${label} over ${chart.length} sessions (${dir}${pct}%)`;
      })()
    : null;

  const renderHeader = () => (
    <View style={styles.content}>
      {/* Custom badge */}
      {exercise.is_custom && (
        <Chip
          compact
          style={[styles.badge, { backgroundColor: theme.colors.tertiaryContainer }]}
          textStyle={{ fontSize: 12 }}
        >
          Custom
        </Chip>
      )}

      {/* Category & Difficulty */}
      <View style={styles.row}>
        <Chip
          compact
          style={{ backgroundColor: theme.colors.primaryContainer }}
          textStyle={{ color: theme.colors.onPrimaryContainer }}
        >
          {CATEGORY_LABELS[exercise.category]}
        </Chip>
        <Chip
          compact
          style={[styles.difficultyChip, { backgroundColor: DIFFICULTY_COLORS[exercise.difficulty] }]}
          textStyle={[styles.difficultyText, { color: difficultyText(exercise.difficulty) }]}
        >
          {exercise.difficulty}
        </Chip>
      </View>

      {/* Voltra Metadata */}
      {exercise.mount_position && (
        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            Mount Position
          </Text>
          <Text
            variant="bodyLarge"
            style={[styles.value, { color: theme.colors.onSurface }]}
            accessibilityLabel={`Mount position: ${MOUNT_POSITION_LABELS[exercise.mount_position]} on rack`}
          >
            {MOUNT_POSITION_LABELS[exercise.mount_position]}
          </Text>
        </View>
      )}
      {exercise.attachment && (
        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            Attachment
          </Text>
          <Text
            variant="bodyLarge"
            style={[styles.value, { color: theme.colors.onSurface }]}
            accessibilityLabel={`Attachment: ${ATTACHMENT_LABELS[exercise.attachment]}`}
          >
            {ATTACHMENT_LABELS[exercise.attachment]}
          </Text>
        </View>
      )}
      {exercise.training_modes && exercise.training_modes.length > 0 && (
        <View
          style={styles.section}
          accessibilityLabel={`Compatible training modes: ${exercise.training_modes.join(", ")}`}
        >
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>
            Training Modes
          </Text>
          <View style={styles.chipRow}>
            {exercise.training_modes.map((m) => (
              <Chip
                key={m}
                compact
                style={[styles.muscleChip, { backgroundColor: theme.colors.secondaryContainer }]}
              >
                {m.replace(/_/g, " ")}
              </Chip>
            ))}
          </View>
        </View>
      )}

      {/* Primary Muscles */}
      <View style={styles.section}>
        <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          Primary Muscles
        </Text>
        <View style={styles.chipRow}>
          {exercise.primary_muscles.map((m) => (
            <Chip
              key={m}
              compact
              style={[styles.muscleChip, { backgroundColor: theme.colors.secondaryContainer }]}
            >
              {m}
            </Chip>
          ))}
        </View>
      </View>

      {/* Secondary Muscles */}
      {exercise.secondary_muscles.length > 0 && (
        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Secondary Muscles
          </Text>
          <View style={styles.chipRow}>
            {exercise.secondary_muscles.map((m) => (
              <Chip
                key={m}
                compact
                style={[styles.muscleChip, { backgroundColor: theme.colors.tertiaryContainer }]}
              >
                {m}
              </Chip>
            ))}
          </View>
        </View>
      )}

      {/* Instructions */}
      {steps.length > 0 && (
        <View style={styles.section}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            Instructions
          </Text>
          {steps.map((step, i) => (
            <Text
              key={i}
              variant="bodyMedium"
              style={[styles.step, { color: theme.colors.onSurface }]}
            >
              {step}
            </Text>
          ))}
        </View>
      )}

      {/* Personal Records Card */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            Personal Records
          </Text>
          {recordsLoading ? (
            <ActivityIndicator style={styles.loader} />
          ) : recordsError ? (
            <View style={styles.errorBox}>
              <Text style={{ color: theme.colors.error }}>Failed to load records</Text>
              <Button mode="text" onPress={() => id && loadRecords(id)}>Retry</Button>
            </View>
          ) : records && records.total_sessions === 0 ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No workout data yet — start a session to build your history
            </Text>
          ) : records ? (
            <>
            <View style={styles.statsRow}>
              {bw ? (
                <>
                  <View style={styles.stat} accessibilityLabel={`Maximum reps: ${records.max_reps ?? 0}`}>
                    <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                      {records.max_reps ?? "—"}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Max Reps</Text>
                  </View>
                  <View style={styles.stat} accessibilityLabel={`Total sessions: ${records.total_sessions}`}>
                    <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                      {records.total_sessions}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Sessions</Text>
                  </View>
                  <View style={styles.stat} accessibilityLabel={`Best volume: ${records.max_volume ?? 0}`}>
                    <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                      {records.max_volume != null ? Math.round(records.max_volume) : "—"}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Best Vol</Text>
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.stat} accessibilityLabel={`Maximum weight: ${records.max_weight != null ? toDisplay(records.max_weight, unit) : 0} ${unit}`}>
                    <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                      {records.max_weight != null ? toDisplay(records.max_weight, unit) : "—"}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Max {unit}</Text>
                  </View>
                  <View style={styles.stat} accessibilityLabel={`Maximum reps: ${records.max_reps ?? 0}`}>
                    <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                      {records.max_reps ?? "—"}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Max Reps</Text>
                  </View>
                  <View style={styles.stat} accessibilityLabel={`Estimated one rep max: ${records.est_1rm != null ? toDisplay(records.est_1rm, unit) : 0} ${unit}`}>
                    <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                      {records.est_1rm != null ? toDisplay(records.est_1rm, unit) : "—"}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {best && best.reps === 1 ? "Tested 1RM" : "Est 1RM"}
                    </Text>
                  </View>
                  <View style={styles.stat} accessibilityLabel={`Total sessions: ${records.total_sessions}`}>
                    <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                      {records.total_sessions}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Sessions</Text>
                  </View>
                </>
              )}
            </View>

            {/* Strength Profile — % 1RM breakdown table */}
            {!bw && records.est_1rm != null && (() => {
              const tested = best != null && best.reps === 1;
              const orm = toDisplay(records.est_1rm!, unit);
              const table = percentageTable(orm);
              const source = best
                ? `Based on: ${toDisplay(best.weight, unit)}${unit} × ${best.reps} reps`
                : "";
              return (
                <View style={[styles.pctSection, { borderTopColor: theme.colors.outlineVariant }]}>
                  <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                    {tested ? "Tested 1RM" : "Estimated 1RM"}: {orm} {unit}
                  </Text>
                  {source ? (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                      {source} · Epley
                    </Text>
                  ) : null}
                  <View style={styles.pctTable}>
                    <View style={styles.pctRow}>
                      <Text variant="labelSmall" style={[styles.pctCol, { color: theme.colors.onSurfaceVariant }]}>% 1RM</Text>
                      <Text variant="labelSmall" style={[styles.pctCol, { color: theme.colors.onSurfaceVariant }]}>Weight</Text>
                      <Text variant="labelSmall" style={[styles.pctCol, { color: theme.colors.onSurfaceVariant }]}>Reps</Text>
                    </View>
                    {table.map((row) => (
                      <View
                        key={row.pct}
                        style={[styles.pctRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outlineVariant }]}
                        accessibilityLabel={`${row.pct} percent of one rep max, ${row.weight} ${unit === "kg" ? "kilograms" : "pounds"}, ${row.reps} reps`}
                      >
                        <Text variant="bodySmall" style={[styles.pctCol, { color: theme.colors.onSurface }]}>{row.pct}%</Text>
                        <Text variant="bodySmall" style={[styles.pctCol, { color: theme.colors.onSurface }]}>{row.weight} {unit}</Text>
                        <Text variant="bodySmall" style={[styles.pctCol, { color: theme.colors.onSurface }]}>{row.reps}</Text>
                      </View>
                    ))}
                  </View>
                  <Button
                    mode="text"
                    compact
                    icon="calculator"
                    onPress={() => router.push("/tools/rm")}
                    style={{ alignSelf: "flex-start", marginTop: 4 }}
                    accessibilityLabel="Open 1RM calculator"
                  >
                    1RM Calculator
                  </Button>
                </View>
              );
            })()}
            </>
          ) : null}
        </Card.Content>
      </Card>

      {/* Performance Chart */}
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            {bw ? "Reps Progression" : "Weight Progression"}
          </Text>
          {chartLoading ? (
            <ActivityIndicator style={styles.loader} />
          ) : chartError ? (
            <View style={styles.errorBox}>
              <Text style={{ color: theme.colors.error }}>Failed to load chart</Text>
              <Button mode="text" onPress={() => id && loadChart(id)}>Retry</Button>
            </View>
          ) : chart.length < 2 ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              {chart.length === 0
                ? "No data to chart yet"
                : "Log more sessions to see a trend chart"}
            </Text>
          ) : (
            <View accessibilityLabel={chartSummary ?? undefined}>
              <LineChart
                data={{
                  labels: chart.map((d) => formatDate(d.date)),
                  datasets: [{
                    data: bw ? chart.map((d) => d.value) : chart.map((d) => toDisplay(d.value, unit)),
                  }],
                }}
                width={chartWidth}
                height={200}
                chartConfig={chartConfig}
                bezier
                style={styles.chartStyle}
                withDots={chart.length <= 30}
              />
              {chartSummary && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                  {chartSummary}
                </Text>
              )}
            </View>
          )}
        </Card.Content>
      </Card>

      {/* History section header */}
      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 8, marginBottom: 8 }}>
        Session History
      </Text>

      {historyLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : historyError ? (
        <View style={styles.errorBox}>
          <Text style={{ color: theme.colors.error }}>Failed to load history</Text>
          <Button mode="text" onPress={() => id && loadHistory(id)}>Retry</Button>
        </View>
      ) : history.length === 0 ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
          No sessions recorded for this exercise
        </Text>
      ) : null}
    </View>
  );

  const renderItem = ({ item }: { item: ExerciseSession }) => {
    const rpeLabel = item.avg_rpe != null ? `, avg RPE ${Math.round(item.avg_rpe * 10) / 10}` : "";
    const label = bw
      ? `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max reps ${item.max_reps}${rpeLabel}`
      : `${exercise.name} session on ${formatDateLong(item.started_at)}, ${item.set_count} sets, max weight ${toDisplay(item.max_weight, unit)} ${unit}${rpeLabel}`;
    return (
      <Pressable
        onPress={() => router.push(`/session/detail/${item.session_id}`)}
        style={[styles.historyRow, { borderBottomColor: theme.colors.outlineVariant }]}
        accessibilityLabel={label}
        accessibilityRole="button"
      >
        <View style={styles.historyLeft}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>
            {formatDateLong(item.started_at)}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.session_name} · {item.set_count} sets · {item.total_reps} reps
          </Text>
        </View>
        <View style={styles.historyRight}>
          <Text variant="titleMedium" style={{ color: theme.colors.primary }}>
            {bw ? `${item.max_reps} reps` : `${toDisplay(item.max_weight, unit)} ${unit}`}
          </Text>
          {item.avg_rpe != null && (
            <View style={[styles.rpeBadge, { backgroundColor: rpeColor(item.avg_rpe) }]}>
              <Text style={{ color: rpeText(item.avg_rpe), fontSize: 12, fontWeight: "600" }}>
                RPE {Math.round(item.avg_rpe * 10) / 10}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderFooter = () => {
    if (loadingMore) return <ActivityIndicator style={{ padding: 16 }} />;
    if (!hasMore && history.length >= MAX_ITEMS) {
      return (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 16 }}>
          Showing last {history.length} sessions
        </Text>
      );
    }
    return null;
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: exercise.name,
          headerRight: exercise.is_custom
            ? () => (
                <View style={styles.headerActions}>
                  <IconButton
                    icon="pencil"
                    size={22}
                    onPress={edit}
                    accessibilityLabel="Edit exercise"
                  />
                  <IconButton
                    icon="delete"
                    size={22}
                    onPress={remove}
                    accessibilityLabel="Delete exercise"
                  />
                </View>
              )
            : undefined,
        }}
      />
      <FlatList
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        data={historyLoading || historyError || history.length === 0 ? [] : history}
        keyExtractor={(item) => item.session_id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={{ paddingBottom: 32 }}
      />

      <Snackbar visible={!!toast} onDismiss={() => setToast("")} duration={3000}>
        {toast}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
  },
  headerActions: {
    flexDirection: "row",
  },
  badge: {
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  value: {
    marginTop: 4,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  muscleChip: {
    marginBottom: 2,
  },
  difficultyChip: {
    borderRadius: 16,
  },
  difficultyText: {
    fontWeight: "600",
  },
  step: {
    marginTop: 6,
    lineHeight: 22,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  loader: {
    paddingVertical: 24,
  },
  errorBox: {
    alignItems: "center",
    paddingVertical: 12,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  stat: {
    alignItems: "center",
  },
  chartStyle: {
    borderRadius: 12,
    marginLeft: -16,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyLeft: {
    flex: 1,
  },
  historyRight: {
    marginLeft: 12,
    alignItems: "flex-end",
  },
  rpeBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  pctSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,

  },
  pctTable: {
    borderRadius: 8,
    overflow: "hidden",
  },
  pctRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  pctCol: {
    flex: 1,
    textAlign: "center",
  },
});
