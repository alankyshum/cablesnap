import { useCallback, useMemo, useState } from "react";
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
  getCompletedSessionsWithSetCount,
  getBodySettings,
} from "../../lib/db";
import {
  getRecentPRsWithDelta,
  getPRStats,
} from "../../lib/db/pr-dashboard";
import type { RecentPR, PRStats } from "../../lib/db/pr-dashboard";
import { useLayout } from "../../lib/layout";
import { useFloatingTabBarHeight } from "../../components/FloatingTabBar";
import WeeklySummary from "../../components/WeeklySummary";
import { useThemeColors } from "@/hooks/useThemeColors";
import { WorkoutChartCard, SessionsCard } from "./WorkoutCards";
import { PRSummaryCard } from "./PRSummaryCard";
import CalendarView from "./CalendarView";
import StrengthLevelsCard from "./StrengthLevelsCard";
import ActiveGoalsCard from "./ActiveGoalsCard";
import { fontSizes } from "@/constants/design-tokens";

let cachedWeekStart: number | null = null;
function getWeekStartDay(): number {
  if (cachedWeekStart !== null) return cachedWeekStart;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCalendars } = require("expo-localization");
    const calendars = getCalendars();
    if (calendars.length > 0 && calendars[0].firstWeekday != null) {
      // expo-localization firstWeekday: 1 = Sunday, 2 = Monday, ...
      // We need 0 = Sunday, 1 = Monday, ...
      cachedWeekStart = (calendars[0].firstWeekday - 1) % 7;
      return cachedWeekStart;
    }
  } catch {
    // expo-localization not available (e.g. testing), default Sunday
  }
  cachedWeekStart = 0;
  return 0;
}

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
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const weekStartDay = useMemo(() => getWeekStartDay(), []);

  const [freq, setFreq] = useState<{ week: string; count: number }[]>([]);
  const [vol, setVol] = useState<{ week: string; volume: number }[]>([]);
  const [recentPRs, setRecentPRs] = useState<RecentPR[]>([]);
  const [prStats, setPRStats] = useState<PRStats>({ totalPRs: 0, prsThisMonth: 0 });
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [sessions, setSessions] = useState<SessionRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [f, v, rp, ps, s, settings] = await Promise.all([
          getWeeklySessionCounts(),
          getWeeklyVolume(),
          getRecentPRsWithDelta(3),
          getPRStats(),
          getCompletedSessionsWithSetCount(),
          getBodySettings(),
        ]);
        setFreq(f);
        setVol(v);
        setRecentPRs(rp);
        setPRStats(ps);
        setSessions(s);
        setWeightUnit(settings.weight_unit as "kg" | "lb");
      })();
    }, []),
  );

  const chartWidth = layout.atLeastMedium
    ? (screenWidth - 96) / 2 - 32
    : screenWidth - 48;

  const empty = sessions.length === 0 && freq.length === 0;

  const toggleButton = (
    <Pressable
      onPress={() => setViewMode((m) => (m === "list" ? "calendar" : "list"))}
      style={[styles.toggleButton, { borderColor: colors.outlineVariant }]}
      accessibilityRole="button"
      accessibilityLabel={
        viewMode === "list" ? "Switch to calendar view" : "Switch to list view"
      }
    >
      <Text style={{ color: colors.onSurface, fontSize: fontSizes.base }}>
        {viewMode === "list" ? "📅" : "📋"}
      </Text>
    </Pressable>
  );

  if (viewMode === "calendar") {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.toggleRow}>{toggleButton}</View>
        <CalendarView weekStartDay={weekStartDay} />
      </View>
    );
  }

  if (empty) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.toggleRow}>{toggleButton}</View>
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
        <Text style={{ fontSize: fontSizes.xl, marginRight: 8 }}>🏆</Text>
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
            <View style={styles.toggleRow}>{toggleButton}</View>
            <WeeklySummary />
            {achievementsCard}
            <View style={styles.grid}>
              {freqCard}
              {volCard}
            </View>
            <View style={styles.grid}>
              <PRSummaryCard
                recentPRs={recentPRs}
                stats={prStats}
                weightUnit={weightUnit}
                onSeeAll={() => router.push("/progress/records")}
                style={wideCard}
              />
              <SessionsCard sessions={sessions} style={wideCard} />
            </View>
            <ActiveGoalsCard />
            <StrengthLevelsCard />
          </>
        ) : (
          <>
            <View style={styles.toggleRow}>{toggleButton}</View>
            <WeeklySummary />
            {achievementsCard}
            {freqCard}
            {volCard}
            <PRSummaryCard
              recentPRs={recentPRs}
              stats={prStats}
              weightUnit={weightUnit}
              onSeeAll={() => router.push("/progress/records")}
            />
            <SessionsCard sessions={sessions} />
            <ActiveGoalsCard />
            <StrengthLevelsCard />
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
  toggleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  toggleButton: {
    borderWidth: 1,
    borderRadius: 8,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
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
