import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Text } from "@/components/ui/text";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getWeeklySessionCounts,
  getWeeklyVolume,
  getPersonalRecords,
  getCompletedSessionsWithSetCount,
} from "../../lib/db";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import WeeklySummary from "../../components/WeeklySummary";
import { useThemeColors } from "@/hooks/useThemeColors";
import { WorkoutChartCard, PRCard, SessionsCard } from "./WorkoutCards";

type PR = {
  exercise_id: string;
  name: string;
  max_weight: number;
};
type SessionRow = {
  id: string;
  name: string;
  started_at: number;
  duration_seconds: number | null;
  set_count: number;
};

export default function WorkoutSegment() {
  const colors = useThemeColors();
  const layout = useLayout();
  const tabBarHeight = useFloatingTabBarHeight();
  const router = useRouter();
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
    }, []),
  );

  const chartWidth = layout.atLeastMedium
    ? (screenWidth - 96) / 2 - 32
    : screenWidth - 48;

  const empty = sessions.length === 0 && freq.length === 0;

  if (empty) {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          <WeeklySummary />
        </View>
        <View style={[styles.center, { flex: 1 }]}>
          <Text
            style={{
              color: colors.onSurfaceVariant,
              textAlign: "center",
              padding: 32,
            }}
          >
            Complete your first workout to see progress
          </Text>
        </View>
      </View>
    );
  }

  const wideCard = layout.atLeastMedium ? styles.wideCard : undefined;

  const achievementsCard = (
    <Pressable
      style={[
        styles.card,
        wideCard,
        { backgroundColor: colors.surface, borderRadius: 12, padding: 18 },
      ]}
      onPress={() => router.push("/progress/achievements")}
      accessibilityLabel="Achievements"
      accessibilityRole="button"
      accessibilityHint="View your achievements and milestones"
    >
      <View style={styles.cardHeader}>
        <Text style={{ fontSize: 20, marginRight: 8 }}>🏆</Text>
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          Achievements
        </Text>
      </View>
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
      >
        Track your milestones and badges
      </Text>
    </Pressable>
  );

  const freqCard =
    freq.length > 0 ? (
      <WorkoutChartCard
        title="Sessions Per Week"
        data={freq.map((f) => ({ x: f.week, y: f.count }))}
        xKey="x"
        yKey="y"
        chartWidth={chartWidth}
        style={wideCard}
      />
    ) : null;

  const volCard =
    vol.length > 0 ? (
      <WorkoutChartCard
        title="Weekly Volume (kg)"
        data={vol.map((v) => ({ x: v.week, y: v.volume }))}
        xKey="x"
        yKey="y"
        chartWidth={chartWidth}
        style={wideCard}
      />
    ) : null;

  return (
    <FlatList
      data={[]}
      renderItem={null}
      style={{ flex: 1 }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: tabBarHeight + 16 },
      ]}
      ListHeaderComponent={
        layout.atLeastMedium ? (
          <>
            <WeeklySummary />
            {achievementsCard}
            <View style={styles.grid}>
              {freqCard}
              {volCard}
            </View>
            <View style={styles.grid}>
              <PRCard prs={prs} style={wideCard} />
              <SessionsCard sessions={sessions} style={wideCard} />
            </View>
          </>
        ) : (
          <>
            <WeeklySummary />
            {achievementsCard}
            {freqCard}
            {volCard}
            <PRCard prs={prs} />
            <SessionsCard sessions={sessions} />
          </>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
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
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
