/* eslint-disable complexity */
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Masonry from "@/components/ui/Masonry";
import { Text } from "@/components/ui/text";
import { useFocusEffect, useRouter } from "expo-router";
import {
  getWeeklySessionCounts,
  getWeeklyVolume,
  getCompletedSessionsWithSetCount,
  getBodySettings,
  getActiveGymCount,
  getGymProfiles,
  getSessionsByGym,
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
import { WorkoutChartCard, SessionsByGymCard, SessionsCard } from "./WorkoutCards";
import { PRSummaryCard } from "./PRSummaryCard";
import { RPETrendCard, RatingTrendCard } from "./TrendCards";
import CalendarView from "./CalendarView";
import StrengthLevelsCard from "./StrengthLevelsCard";
import ActiveGoalsCard from "./ActiveGoalsCard";
import WorkoutEmptyState from "./WorkoutEmptyState";
import { fontSizes } from "@/constants/design-tokens";
import { CalendarDays, List } from "lucide-react-native";

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

type GymFilterOption = {
  id: string;
  name: string;
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
  const [activeGymCount, setActiveGymCount] = useState(0);
  const [gymOptions, setGymOptions] = useState<GymFilterOption[]>([]);
  const [sessionsByGym, setSessionsByGym] = useState<Array<{ gymId: string; gymName: string; count: number }>>([]);
  const [selectedGymId, setSelectedGymId] = useState<string>("all");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [f, v, rp, ps, s, settings, liveGymCount, gyms, gymRows] = await Promise.all([
          getWeeklySessionCounts(8, selectedGymId === "all" ? null : selectedGymId),
          getWeeklyVolume(8, selectedGymId === "all" ? null : selectedGymId),
          getRecentPRsWithDelta(3),
          getPRStats(),
          getCompletedSessionsWithSetCount(10, selectedGymId === "all" ? null : selectedGymId),
          getBodySettings(),
          getActiveGymCount(),
          getGymProfiles(),
          getSessionsByGym(),
        ]);
        setFreq(f);
        setVol(v);
        setRecentPRs(rp);
        setPRStats(ps);
        setSessions(s);
        setWeightUnit(settings.weight_unit as "kg" | "lb");
        setActiveGymCount(liveGymCount);
        const liveGymIds = new Set(gyms.map((gym) => gym.id));
        const options = gymRows
          .filter((row) => liveGymIds.has(row.gymId))
          .map((row) => ({ id: row.gymId, name: row.gymName }));
        setGymOptions(options);
        setSessionsByGym(gymRows);
        if (selectedGymId !== "all" && !options.some((option) => option.id === selectedGymId)) {
          setSelectedGymId("all");
        }
      })();
    }, [selectedGymId]),
  );

  const chartWidth = layout.atLeastMedium
    ? Math.floor((screenWidth - layout.horizontalPadding * 2 - 16 * (layout.expanded ? 2 : 1)) / (layout.expanded ? 3 : 2)) - 32
    : screenWidth - 48;

  const empty = sessions.length === 0 && freq.length === 0;
  const isListView = viewMode === "list" && !empty;
  const showGymUI = activeGymCount >= 2;

  const toggleButton = (
    <Pressable
      onPress={() => setViewMode((m) => (m === "list" ? "calendar" : "list"))}
      style={[styles.toggleButton, { borderColor: colors.outlineVariant }]}
      accessibilityRole="button"
      accessibilityLabel={
        viewMode === "list" ? "Switch to calendar view" : "Switch to list view"
      }
    >
      {viewMode === "list" ? (
        <CalendarDays size={20} color={colors.onSurface} />
      ) : (
        <List size={20} color={colors.onSurface} />
      )}
    </Pressable>
  );

  const gymFilter = showGymUI ? (
    <View style={styles.filterRow} testID="workout-gym-filter-row">
      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
        Filter:
      </Text>
      <View style={styles.filterPills} testID="workout-gym-filter-pills">
        {[{ id: "all", name: "All gyms" }, ...gymOptions].map((option) => {
          const selected = selectedGymId === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setSelectedGymId(option.id)}
              style={[
                styles.filterPill,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: colors.outlineVariant,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Filter workouts by ${option.name}`}
              accessibilityState={{ selected }}
            >
              <Text style={{ color: selected ? colors.onPrimary : colors.onSurfaceVariant, fontSize: fontSizes.sm }}>
                {option.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ) : null;

  if (viewMode === "calendar") {
    return (
      <View style={{ flex: 1 }}>
        <View
          testID="workout-toggle-row"
          style={[
            styles.toggleRow,
            {
              paddingHorizontal: isListView ? 0 : 16,
              paddingTop: 0,
            },
          ]}
        >
          {toggleButton}
        </View>
        {gymFilter}
        <CalendarView weekStartDay={weekStartDay} />
      </View>
    );
  }

  if (empty) {
    return (
      <View style={{ flex: 1 }}>
        <View
          testID="workout-toggle-row"
          style={[
            styles.toggleRow,
            {
              paddingHorizontal: isListView ? 0 : 16,
              paddingTop: 0,
            },
          ]}
        >
          {toggleButton}
        </View>
        {gymFilter}
        <View style={[styles.center, { flex: 1 }]}>
          <WorkoutEmptyState />
        </View>
      </View>
    );
  }

  const achievementsCard = (
    <Pressable
      style={[
        styles.card,
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
      />
    ) : null;

  const sessionsByGymCard =
    showGymUI && sessionsByGym.length > 0 ? <SessionsByGymCard rows={sessionsByGym} /> : null;

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
            <View
              testID="workout-toggle-row"
              style={[
                styles.toggleRow,
                {
                  paddingHorizontal: isListView ? 0 : 16,
                  paddingTop: 0,
                },
              ]}
            >
              {toggleButton}
            </View>
            {gymFilter}
            <WeeklySummary />
            {achievementsCard}
            <Masonry gap={16} testID="workout-progress-masonry">
              {freqCard}
              {volCard}
              <RPETrendCard chartWidth={chartWidth} gymId={selectedGymId === "all" ? null : selectedGymId} />
              <RatingTrendCard chartWidth={chartWidth} gymId={selectedGymId === "all" ? null : selectedGymId} />
              <PRSummaryCard
                recentPRs={recentPRs}
                stats={prStats}
                weightUnit={weightUnit}
                onSeeAll={() => router.push("/progress/records")}
              />
              <SessionsCard sessions={sessions} />
              {sessionsByGymCard}
              <ActiveGoalsCard />
              <StrengthLevelsCard />
            </Masonry>
          </>
        ) : (
          <>
            <View
              testID="workout-toggle-row"
              style={[
                styles.toggleRow,
                {
                  paddingHorizontal: isListView ? 0 : 16,
                  paddingTop: 0,
                },
              ]}
            >
              {toggleButton}
            </View>
            {gymFilter}
            <WeeklySummary />
            {achievementsCard}
            {freqCard}
            {volCard}
            <RPETrendCard chartWidth={chartWidth} gymId={selectedGymId === "all" ? null : selectedGymId} />
            <RatingTrendCard chartWidth={chartWidth} gymId={selectedGymId === "all" ? null : selectedGymId} />
            <PRSummaryCard
              recentPRs={recentPRs}
              stats={prStats}
              weightUnit={weightUnit}
              onSeeAll={() => router.push("/progress/records")}
            />
            <SessionsCard sessions={sessions} />
            {sessionsByGymCard}
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
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 80,
  },
  card: {
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 8,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
  },
  filterPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  toggleButton: {
    borderWidth: 1,
    borderRadius: 8,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
