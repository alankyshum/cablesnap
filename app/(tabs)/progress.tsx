import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { Card, Divider, Text, useTheme } from "react-native-paper";
import { useFocusEffect } from "expo-router";
import { BarChart } from "react-native-chart-kit";
import {
  getWeeklySessionCounts,
  getWeeklyVolume,
  getPersonalRecords,
  getCompletedSessionsWithSetCount,
} from "../../lib/db";
import type { WorkoutSession } from "../../lib/types";
import { useLayout } from "../../lib/layout";

type PR = { exercise_id: string; name: string; max_weight: number };
type SessionRow = WorkoutSession & { set_count: number };

export default function Progress() {
  const theme = useTheme();
  const layout = useLayout();
  const { width: screenWidth } = useWindowDimensions();
  const [freq, setFreq] = useState<{ week: string; count: number }[]>([]);
  const [vol, setVol] = useState<{ week: string; volume: number }[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
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
      })();
    }, [])
  );

  const chartWidth = layout.wide
    ? (screenWidth - 64) / 2 - 32
    : screenWidth - 48;
  const empty = sessions.length === 0 && freq.length === 0;

  const chart = {
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

  if (empty) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
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
          chartConfig={chart}
          fromZero
          showValuesOnTopOfBars
          style={styles.chart}
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
          chartConfig={chart}
          fromZero
          showValuesOnTopOfBars
          style={styles.chart}
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
      style={[styles.container, { backgroundColor: theme.colors.background }]}
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
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
  chart: {
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
});
