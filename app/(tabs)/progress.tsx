import { useCallback, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Button,
  Card,
  Divider,
  FAB,
  IconButton,
  ProgressBar,
  SegmentedButtons,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import { BarChart, LineChart } from "react-native-chart-kit";
import {
  getWeeklySessionCounts,
  getWeeklyVolume,
  getPersonalRecords,
  getCompletedSessionsWithSetCount,
  getBodySettings,
  getLatestBodyWeight,
  getPreviousBodyWeight,
  getBodyWeightEntries,
  getBodyWeightCount,
  getBodyWeightChartData,
  getLatestMeasurements,
  upsertBodyWeight,
  deleteBodyWeight,
  updateBodySettings,
} from "../../lib/db";
import type { BodyWeight, BodySettings, BodyMeasurements } from "../../lib/types";
import { useLayout } from "../../lib/layout";

type PR = { exercise_id: string; name: string; max_weight: number };
type SessionRow = { id: string; name: string; started_at: number; duration_seconds: number | null; set_count: number };

const KG_TO_LB = 2.20462;
const LB_TO_KG = 0.453592;
const PAGE_SIZE = 20;

function toDisplay(kg: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? Math.round(kg * KG_TO_LB * 10) / 10 : Math.round(kg * 10) / 10;
}

function toKg(val: number, unit: "kg" | "lb"): number {
  return unit === "lb" ? val * LB_TO_KG : val;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function movingAvg(data: { date: string; weight: number }[], window = 7): { date: string; avg: number }[] {
  return data.map((entry, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((sum, e) => sum + e.weight, 0) / slice.length;
    return { date: entry.date, avg: Math.round(avg * 10) / 10 };
  });
}

export default function Progress() {
  const theme = useTheme();
  const layout = useLayout();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [segment, setSegment] = useState("workouts");

  // Workout state
  const [freq, setFreq] = useState<{ week: string; count: number }[]>([]);
  const [vol, setVol] = useState<{ week: string; volume: number }[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  // Body state
  const [settings, setSettings] = useState<BodySettings | null>(null);
  const [latest, setLatest] = useState<BodyWeight | null>(null);
  const [previous, setPrevious] = useState<BodyWeight | null>(null);
  const [entries, setEntries] = useState<BodyWeight[]>([]);
  const [total, setTotal] = useState(0);
  const [chart, setChart] = useState<{ date: string; weight: number }[]>([]);
  const [measurements, setMeasurements] = useState<BodyMeasurements | null>(null);
  const [modal, setModal] = useState(false);
  const [snack, setSnack] = useState("");
  const undoRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  // Weight log modal state
  const [logWeight, setLogWeight] = useState("");
  const [logDate, setLogDate] = useState(today());
  const [logNotes, setLogNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadWorkouts = useCallback(async () => {
    const [f, v, p, s] = await Promise.all([
      getWeeklySessionCounts(),
      getWeeklyVolume(),
      getPersonalRecords(),
      getCompletedSessionsWithSetCount(),
    ]);
    setFreq(f);
    setVol(v);
    setPrs(p);
    setSessions(s);
  }, []);

  const loadBody = useCallback(async () => {
    const [s, l, p, c, cnt, m] = await Promise.all([
      getBodySettings(),
      getLatestBodyWeight(),
      getPreviousBodyWeight(),
      getBodyWeightChartData(),
      getBodyWeightCount(),
      getLatestMeasurements(),
    ]);
    setSettings(s);
    setLatest(l);
    setPrevious(p);
    setChart(c);
    setTotal(cnt);
    setMeasurements(m);
    const e = await getBodyWeightEntries(PAGE_SIZE, 0);
    setEntries(e);
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (segment === "workouts") loadWorkouts();
      else loadBody();
    }, [segment, loadWorkouts, loadBody])
  );

  const chartWidth = layout.wide
    ? (screenWidth - 64) / 2 - 32
    : screenWidth - 48;

  const handleSave = async () => {
    const val = parseFloat(logWeight);
    if (isNaN(val) || val <= 0) return;

    const kg = toKg(val, settings?.weight_unit ?? "kg");

    if (kg > 300) {
      Alert.alert(
        "Unusual Weight",
        `${val} ${settings?.weight_unit ?? "kg"} seems high. Save anyway?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: () => doSave(kg) },
        ]
      );
      return;
    }

    if (logDate > today()) {
      Alert.alert(
        "Future Date",
        "This date is in the future. Save anyway?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: () => doSave(kg) },
        ]
      );
      return;
    }

    await doSave(kg);
  };

  const doSave = async (kg: number) => {
    setSaving(true);
    try {
      await upsertBodyWeight(kg, logDate, logNotes);
      setModal(false);
      setLogWeight("");
      setLogDate(today());
      setLogNotes("");
      await loadBody();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (item: BodyWeight) => {
    const filtered = entries.filter((e) => e.id !== item.id);
    setEntries(filtered);
    setSnack("Entry deleted");

    const timer = setTimeout(async () => {
      await deleteBodyWeight(item.id);
      undoRef.current = null;
      await loadBody();
    }, 3000);

    if (undoRef.current) clearTimeout(undoRef.current.timer);
    undoRef.current = { id: item.id, timer };
  };

  const handleUndo = () => {
    if (!undoRef.current) return;
    clearTimeout(undoRef.current.timer);
    undoRef.current = null;
    setSnack("");
    loadBody();
  };

  const loadMore = async () => {
    if (entries.length >= total) return;
    const more = await getBodyWeightEntries(PAGE_SIZE, entries.length);
    setEntries([...entries, ...more]);
  };

  const unit = settings?.weight_unit ?? "kg";

  // ---- Render helpers ----

  const chartConfig = {
    backgroundGradientFrom: theme.colors.surface,
    backgroundGradientTo: theme.colors.surface,
    color: () => theme.colors.primary,
    labelColor: () => theme.colors.onSurfaceVariant,
    barPercentage: 0.6,
    decimalPlaces: 0,
    propsForBackgroundLines: { stroke: theme.colors.outlineVariant },
  };

  const duration = (secs: number | null) => {
    if (!secs) return "-";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return h + "h " + m + "m";
    return m + "m";
  };

  const dateStr = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });

  // ---- Workout segment ----

  const renderWorkouts = () => {
    const empty = sessions.length === 0 && freq.length === 0;

    if (empty) {
      return (
        <View style={[styles.center, { flex: 1 }]}>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 32 }}>
            Complete your first workout to see progress
          </Text>
        </View>
      );
    }

    const freqCard = freq.length > 0 ? (
      <Card style={[styles.card, layout.wide && styles.wideCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            Sessions Per Week
          </Text>
          <BarChart
            data={{
              labels: freq.map((f) => f.week),
              datasets: [{ data: freq.map((f) => f.count) }],
            }}
            width={chartWidth}
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            style={styles.chartStyle}
          />
        </Card.Content>
      </Card>
    ) : null;

    const volCard = vol.length > 0 ? (
      <Card style={[styles.card, layout.wide && styles.wideCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            Weekly Volume (kg)
          </Text>
          <BarChart
            data={{
              labels: vol.map((v) => v.week),
              datasets: [{ data: vol.map((v) => v.volume) }],
            }}
            width={chartWidth}
            height={180}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={chartConfig}
            fromZero
            showValuesOnTopOfBars
            style={styles.chartStyle}
          />
        </Card.Content>
      </Card>
    ) : null;

    const prCard = (
      <Card style={[styles.card, layout.wide && styles.wideCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            Personal Records
          </Text>
          {prs.length === 0 ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No records yet — start lifting!
            </Text>
          ) : (
            prs.map((pr) => (
              <View key={pr.exercise_id} style={[styles.prRow, { borderBottomColor: theme.colors.outlineVariant }]}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
                  {pr.name}
                </Text>
                <Text variant="titleSmall" style={{ color: theme.colors.primary }}>
                  {pr.max_weight} kg
                </Text>
              </View>
            ))
          )}
        </Card.Content>
      </Card>
    );

    const sessionsCard = (
      <Card style={[styles.card, layout.wide && styles.wideCard, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
            Recent Sessions
          </Text>
          {sessions.map((s, i) => (
            <View key={s.id}>
              <View style={styles.sessionRow}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                    {s.name}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {dateStr(s.started_at)} · {duration(s.duration_seconds)} · {s.set_count} sets
                  </Text>
                </View>
              </View>
              {i < sessions.length - 1 && <Divider style={{ marginVertical: 6 }} />}
            </View>
          ))}
        </Card.Content>
      </Card>
    );

    return (
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
      >
        {layout.wide ? (
          <>
            <View style={styles.grid}>
              {freqCard}
              {volCard}
            </View>
            <View style={styles.grid}>
              {prCard}
              {sessionsCard}
            </View>
          </>
        ) : (
          <>
            {freqCard}
            {volCard}
            {prCard}
            {sessionsCard}
          </>
        )}
      </ScrollView>
    );
  };

  // ---- Body segment ----

  const renderBody = () => {
    if (!settings) return null;

    // Empty state
    if (total === 0 && !measurements) {
      return (
        <View style={[styles.center, { flex: 1 }]}>
          <Text variant="headlineMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            📏
          </Text>
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, textAlign: "center", padding: 16 }}>
            Log your first weigh-in
          </Text>
          <FAB
            icon="plus"
            onPress={() => setModal(true)}
            style={[styles.emptyFab, { backgroundColor: theme.colors.primary }]}
            color={theme.colors.onPrimary}
            accessibilityLabel="Log body weight"
          />
        </View>
      );
    }

    const delta = latest && previous
      ? Math.round((latest.weight - previous.weight) * 10) / 10
      : null;

    const deltaDisplay = delta !== null ? toDisplay(Math.abs(delta), unit) : null;
    const arrow = delta !== null ? (delta > 0 ? "↑" : delta < 0 ? "↓" : "") : "";
    const deltaLabel = deltaDisplay !== null
      ? `${arrow}${deltaDisplay} ${unit}`
      : "";

    // Unit toggle
    const toggleUnit = async () => {
      const next = unit === "kg" ? "lb" : "kg";
      await updateBodySettings(next, settings.measurement_unit, settings.weight_goal, settings.body_fat_goal);
      await loadBody();
    };

    // Weight card
    const weightCard = latest ? (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
              Current Weight
            </Text>
            <Button
              mode="text"
              compact
              onPress={toggleUnit}
              accessibilityLabel={`Switch to ${unit === "kg" ? "pounds" : "kilograms"}`}
            >
              {unit === "kg" ? "kg → lb" : "lb → kg"}
            </Button>
          </View>
          <Text
            variant="displaySmall"
            style={{ color: theme.colors.onSurface, marginTop: 4 }}
            accessibilityLabel={`Current weight ${toDisplay(latest.weight, unit)} ${unit}`}
          >
            {toDisplay(latest.weight, unit)} {unit}
          </Text>
          {delta !== null && delta !== 0 && (
            <Text
              variant="bodyMedium"
              style={{ color: delta > 0 ? theme.colors.error : theme.colors.primary, marginTop: 4 }}
              accessibilityValue={{ text: `${deltaLabel} since previous entry` }}
            >
              {deltaLabel} since previous
            </Text>
          )}
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {latest.date}
          </Text>
        </Card.Content>
      </Card>
    ) : null;

    // Goals card
    const goalsCard = (settings.weight_goal || settings.body_fat_goal) ? (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
              Goals
            </Text>
            <Button
              mode="text"
              compact
              onPress={() => router.push("/body/goals")}
              accessibilityLabel="Edit body goals"
            >
              Edit
            </Button>
          </View>
          {settings.weight_goal && latest && (
            <View style={{ marginTop: 8 }}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                Weight: {toDisplay(latest.weight, unit)} → {toDisplay(settings.weight_goal, unit)} {unit}
              </Text>
              <ProgressBar
                progress={Math.min(1, Math.max(0, 1 - Math.abs(latest.weight - settings.weight_goal) / Math.max(latest.weight, 1)))}
                color={theme.colors.primary}
                style={{ marginTop: 8, borderRadius: 4 }}
                accessibilityLabel={`Weight goal progress`}
              />
            </View>
          )}
          {settings.body_fat_goal && measurements?.body_fat && (
            <View style={{ marginTop: 12 }}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                Body fat: {measurements.body_fat}% → {settings.body_fat_goal}%
              </Text>
              <ProgressBar
                progress={Math.min(1, Math.max(0, 1 - Math.abs(measurements.body_fat - settings.body_fat_goal) / Math.max(measurements.body_fat, 1)))}
                color={theme.colors.primary}
                style={{ marginTop: 8, borderRadius: 4 }}
                accessibilityLabel={`Body fat goal progress`}
              />
            </View>
          )}
        </Card.Content>
      </Card>
    ) : (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            Goals
          </Text>
          <Button
            mode="outlined"
            onPress={() => router.push("/body/goals")}
            accessibilityLabel="Set body goals"
          >
            Set Goals
          </Button>
        </Card.Content>
      </Card>
    );

    // Chart card — only show if 2+ entries
    const chartCard = chart.length >= 2 ? (() => {
      const avg = movingAvg(chart);
      const labels = chart.length <= 8
        ? chart.map((d) => d.date.slice(5))
        : chart.filter((_, i) => i % Math.ceil(chart.length / 6) === 0 || i === chart.length - 1).map((d) => d.date.slice(5));

      // Pad labels to match data length
      const paddedLabels = chart.map((d, i) => {
        if (chart.length <= 8) return d.date.slice(5);
        if (i % Math.ceil(chart.length / 6) === 0 || i === chart.length - 1) return d.date.slice(5);
        return "";
      });

      return (
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <Card.Content>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 12 }}>
              Weight Trend
            </Text>
            <LineChart
              data={{
                labels: paddedLabels,
                datasets: [
                  { data: chart.map((d) => toDisplay(d.weight, unit)), color: () => theme.colors.primary },
                  { data: avg.map((d) => toDisplay(d.avg, unit)), color: () => theme.colors.tertiary, strokeDashArray: [5, 5] },
                ],
              }}
              width={chartWidth}
              height={200}
              chartConfig={{
                ...chartConfig,
                decimalPlaces: 1,
              }}
              bezier
              style={styles.chartStyle}
              withDots={chart.length <= 30}
            />
            <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.primary }}>● Actual</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.tertiary }}>● 7-day avg</Text>
            </View>
          </Card.Content>
        </Card>
      );
    })() : null;

    // Single entry: card only, no chart
    const singleCard = chart.length === 1 && latest ? (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            Weight Trend
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            {toDisplay(latest.weight, unit)} {unit} on {latest.date}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            Log more entries to see a chart
          </Text>
        </Card.Content>
      </Card>
    ) : null;

    // Measurements card
    const measCard = (
      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <View style={styles.cardHeader}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
              Measurements
            </Text>
          </View>
          {measurements ? (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Last logged: {measurements.date}
            </Text>
          ) : (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              No measurements logged yet
            </Text>
          )}
          <Button
            mode="outlined"
            onPress={() => router.push("/body/measurements")}
            style={{ marginTop: 8 }}
            accessibilityLabel="Log body measurements"
          >
            {measurements ? "Log Measurements" : "Add First Measurement"}
          </Button>
        </Card.Content>
      </Card>
    );

    // Recent entries list
    const renderEntry = ({ item }: { item: BodyWeight }) => (
      <View style={[styles.entryRow, { borderBottomColor: theme.colors.outlineVariant }]}>
        <View style={{ flex: 1 }}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
            {toDisplay(item.weight, unit)} {unit}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {item.date}{item.notes ? ` · ${item.notes}` : ""}
          </Text>
        </View>
        <IconButton
          icon="delete-outline"
          size={20}
          onPress={() => handleDelete(item)}
          accessibilityLabel={`Delete weight entry for ${item.date}`}
        />
      </View>
    );

    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.content}
          ListHeaderComponent={
            <>
              {weightCard}
              {goalsCard}
              {chartCard}
              {singleCard}
              {measCard}
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8, marginTop: 8 }}>
                Recent Entries
              </Text>
            </>
          }
          ListEmptyComponent={
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No entries yet
            </Text>
          }
        />
        <FAB
          icon="plus"
          onPress={() => setModal(true)}
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          color={theme.colors.onPrimary}
          accessibilityLabel="Log body weight"
        />
        <Snackbar
          visible={!!snack}
          onDismiss={() => { setSnack(""); }}
          duration={3000}
          action={{ label: "Undo", onPress: handleUndo }}
        >
          {snack}
        </Snackbar>
      </View>
    );
  };

  // ---- Weight log modal ----

  const renderModal = () => (
    <Modal
      visible={modal}
      transparent
      animationType="slide"
      onRequestClose={() => setModal(false)}
      accessibilityViewIsModal
    >
      <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
          <Text variant="titleLarge" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Log Weight
          </Text>

          <TextInput
            label={`Weight (${settings?.weight_unit ?? "kg"})`}
            value={logWeight}
            onChangeText={setLogWeight}
            keyboardType="numeric"
            mode="outlined"
            style={styles.input}
            accessibilityLabel={`Weight in ${settings?.weight_unit ?? "kg"}`}
          />

          <TextInput
            label="Date (YYYY-MM-DD)"
            value={logDate}
            onChangeText={setLogDate}
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Date for weight entry"
          />

          <TextInput
            label="Notes (optional)"
            value={logNotes}
            onChangeText={setLogNotes}
            mode="outlined"
            style={styles.input}
            accessibilityLabel="Optional notes"
          />

          <View style={styles.modalButtons}>
            <Button
              mode="outlined"
              onPress={() => setModal(false)}
              style={{ flex: 1, marginRight: 8 }}
              accessibilityLabel="Cancel weight log"
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={saving}
              disabled={saving || !logWeight}
              style={{ flex: 1 }}
              accessibilityLabel="Save weight entry"
            >
              Save
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.segmentContainer}>
        <SegmentedButtons
          value={segment}
          onValueChange={setSegment}
          buttons={[
            { value: "workouts", label: "Workouts", accessibilityLabel: "Workouts progress" },
            { value: "body", label: "Body", accessibilityLabel: "Body metrics" },
          ]}
        />
      </View>
      {segment === "workouts" ? renderWorkouts() : renderBody()}
      {renderModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  segmentContainer: {
    padding: 16,
    paddingBottom: 0,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 80,
  },
  grid: {
    flexDirection: "row",
    gap: 16,
  },
  card: {
    marginBottom: 16,
  },
  wideCard: {
    flex: 1,
  },
  chartStyle: {
    borderRadius: 8,
    marginLeft: -16,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyFab: {
    marginTop: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    elevation: 8,
  },
  input: {
    marginBottom: 12,
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 8,
  },
});
