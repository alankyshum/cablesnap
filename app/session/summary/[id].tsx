import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  Button,
  Card,
  Text,
  useTheme,
} from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import {
  getBodySettings,
  getSessionById,
  getSessionComparison,
  getSessionPRs,
  getSessionRepPRs,
  getSessionSets,
  getSessionWeightIncreases,
  buildAchievementContext,
  getEarnedAchievementIds,
  saveEarnedAchievements,
} from "../../../lib/db";
import { evaluateAchievements } from "../../../lib/achievements";
import type { AchievementDef } from "../../../lib/achievements";
import type { WorkoutSession, WorkoutSet } from "../../../lib/types";
import { TRAINING_MODE_LABELS } from "../../../lib/types";
import { toDisplay } from "../../../lib/units";
import { formatTime } from "../../../lib/format";

type PR = { exercise_id: string; name: string; weight: number; previous_max: number };
type RepPR = { exercise_id: string; name: string; reps: number; previous_max: number };
type Increase = { exercise_id: string; name: string; current: number; previous: number };
type Comparison = {
  previous: { volume: number; duration: number; sets: number } | null;
  current: { volume: number; duration: number; sets: number };
} | null;

export default function Summary() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [sets, setSets] = useState<(WorkoutSet & { exercise_name?: string })[]>([]);
  const [prs, setPrs] = useState<PR[]>([]);
  const [repPrs, setRepPrs] = useState<RepPR[]>([]);
  const [increases, setIncreases] = useState<Increase[]>([]);
  const [comparison, setComparison] = useState<Comparison>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [newAchievements, setNewAchievements] = useState<AchievementDef[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [sess, settings] = await Promise.all([
        getSessionById(id),
        getBodySettings(),
      ]);
      if (!sess) return;
      setSession(sess);
      setUnit(settings.weight_unit);

      const [setsData, prData, repPrData, incData, compData] = await Promise.all([
        getSessionSets(id),
        getSessionPRs(id),
        getSessionRepPRs(id),
        getSessionWeightIncreases(id),
        getSessionComparison(id),
      ]);
      setSets(setsData);
      setPrs(prData);
      setRepPrs(repPrData);
      // Filter out exercises that are already weight PRs
      setIncreases(incData.filter(
        (inc) => !prData.some((pr) => pr.exercise_id === inc.exercise_id)
      ));
      setComparison(compData);

      // Achievement evaluation
      try {
        const [ctx, alreadyEarnedIds] = await Promise.all([
          buildAchievementContext(),
          getEarnedAchievementIds(),
        ]);
        const earned = evaluateAchievements(ctx, alreadyEarnedIds);
        if (earned.length > 0) {
          await saveEarnedAchievements(earned.map((e) => e.achievement.id));
          setNewAchievements(earned.map((e) => e.achievement));
          if (Platform.OS !== "web") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }
        }
      } catch (e) {
        console.warn("Achievement evaluation failed:", e);
      }

      AccessibilityInfo.announceForAccessibility("Workout Complete!");
    })();
  }, [id]);

  const completed = useMemo(
    () => sets.filter((s) => s.completed),
    [sets],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; sets: typeof completed }>();
    for (const s of completed) {
      const key = s.exercise_id;
      if (!map.has(key)) map.set(key, { name: s.exercise_name ?? key, sets: [] });
      map.get(key)!.sets.push(s);
    }
    return [...map.values()];
  }, [completed]);

  const volume = useMemo(() => {
    let total = 0;
    for (const s of completed) {
      if (s.weight && s.reps) total += s.weight * s.reps;
    }
    return total;
  }, [completed]);

  const duration = session?.duration_seconds
    ? formatTime(session.duration_seconds)
    : "0:00";

  const durationSpoken = () => {
    if (!session?.duration_seconds) return "0 minutes";
    const h = Math.floor(session.duration_seconds / 3600);
    const m = Math.floor((session.duration_seconds % 3600) / 60);
    if (h > 0) return `${h} hour${h > 1 ? "s" : ""} ${m} minute${m !== 1 ? "s" : ""}`;
    return `${m} minute${m !== 1 ? "s" : ""}`;
  };

  const volumeDisplay = toDisplay(volume, unit);

  const delta = (cur: number, prev: number) => {
    const diff = cur - prev;
    if (diff > 0) return `↑ ${diff}`;
    if (diff < 0) return `↓ ${Math.abs(diff)}`;
    return "—";
  };

  const deltaTime = (cur: number, prev: number) => {
    const diff = cur - prev;
    const m = Math.floor(Math.abs(diff) / 60);
    if (diff > 0) return `↑ ${m}m`;
    if (diff < 0) return `↓ ${m}m`;
    return "—";
  };

  const share = async () => {
    const lines = [`🏋️ ${session?.name ?? "Workout"} Complete!`];
    lines.push(`Duration: ${duration}`);
    lines.push(`Sets: ${completed.length}`);
    lines.push(`Volume: ${volumeDisplay.toLocaleString()} ${unit}`);
    if (prs.length > 0) {
      lines.push("");
      lines.push("🏆 New PRs:");
      for (const pr of prs) {
        lines.push(`  ${pr.name}: ${toDisplay(pr.weight, unit)} ${unit}`);
      }
    }
    if (repPrs.length > 0) {
      if (prs.length === 0) lines.push("", "🏆 New PRs:");
      for (const pr of repPrs) {
        lines.push(`  ${pr.name}: ${pr.reps} reps`);
      }
    }
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // User cancelled share
    }
  };

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Summary" }} />
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const allPrs = [...prs, ...repPrs];

  return (
    <>
      <Stack.Screen options={{ title: "Workout Complete!" }} />
      <FlashList
        data={
          [
            ...(newAchievements.length > 0 ? [{ key: "achievements" }] : []),
            ...(allPrs.length > 0 ? [{ key: "prs" }] : []),
            ...(increases.length > 0 ? [{ key: "increases" }] : []),
            ...(comparison?.previous ? [{ key: "comparison" }] : []),
            ...(grouped.length > 0 ? [{ key: "sets" }] : []),
          ] as { key: string }[]
        }
        keyExtractor={(s) => s.key}
        style={StyleSheet.flatten([styles.container, { backgroundColor: theme.colors.background }])}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <MaterialCommunityIcons
                name="check-circle"
                size={48}
                color={theme.colors.primary}
              />
              <Text
                variant="headlineMedium"
                style={[styles.title, { color: theme.colors.onBackground }]}
                accessibilityRole="header"
              >
                Workout Complete!
              </Text>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.onSurfaceVariant }}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {session.name}
              </Text>
            </View>

            {/* Stats Row */}
            <View style={styles.stats}>
              <Card
                style={[styles.stat, { backgroundColor: theme.colors.surface }]}
                accessibilityLabel={`Duration: ${durationSpoken()}`}
              >
                <Card.Content style={styles.statInner}>
                  <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                    {duration}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Duration
                  </Text>
                </Card.Content>
              </Card>
              <Card
                style={[styles.stat, { backgroundColor: theme.colors.surface }]}
                accessibilityLabel={`${completed.length} sets completed`}
              >
                <Card.Content style={styles.statInner}>
                  <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                    {completed.length}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Sets
                  </Text>
                </Card.Content>
              </Card>
              <Card
                style={[styles.stat, { backgroundColor: theme.colors.surface }]}
                accessibilityLabel={`Total volume: ${volumeDisplay.toLocaleString()} ${unit}`}
              >
                <Card.Content style={styles.statInner}>
                  <Text variant="headlineSmall" style={{ color: theme.colors.primary }}>
                    {volumeDisplay.toLocaleString()}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Volume ({unit})
                  </Text>
                </Card.Content>
              </Card>
            </View>
          </>
        }
        renderItem={({ item }) => {
          if (item.key === "achievements") {
            const displayed = newAchievements.slice(0, 3);
            const extraCount = newAchievements.length - 3;
            return (
              <Card
                style={[styles.section, { backgroundColor: theme.colors.tertiaryContainer }]}
                accessibilityLabel={`${newAchievements.length} achievement${newAchievements.length > 1 ? "s" : ""} unlocked`}
                accessibilityLiveRegion="polite"
              >
                <Card.Content>
                  <View style={styles.sectionHeader}>
                    <Text style={{ fontSize: 20 }}>🏆</Text>
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}
                    >
                      Achievement{newAchievements.length > 1 ? "s" : ""} Unlocked!
                    </Text>
                  </View>
                  {displayed.map((a) => (
                    <View key={a.id} style={styles.row}>
                      <Text style={{ fontSize: 18, marginRight: 8 }}>{a.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text
                          variant="bodyMedium"
                          style={{ color: theme.colors.onTertiaryContainer, fontWeight: "600" }}
                        >
                          {a.name}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onTertiaryContainer }}
                        >
                          {a.description}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {extraCount > 0 && (
                    <Button
                      mode="text"
                      onPress={() => router.push("/progress/achievements")}
                      textColor={theme.colors.onTertiaryContainer}
                      style={{ marginTop: 4 }}
                      accessibilityLabel={`View ${extraCount} more achievements`}
                      accessibilityRole="link"
                    >
                      +{extraCount} more
                    </Button>
                  )}
                </Card.Content>
              </Card>
            );
          }

          if (item.key === "prs") {
            return (
              <Card
                style={[styles.section, { backgroundColor: theme.colors.tertiaryContainer }]}
                accessibilityLabel={`${allPrs.length} new personal record${allPrs.length > 1 ? "s" : ""}`}
              >
                <Card.Content>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="trophy"
                      size={20}
                      color={theme.colors.onTertiaryContainer}
                    />
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}
                    >
                      {allPrs.length} New PR{allPrs.length > 1 ? "s" : ""}
                    </Text>
                  </View>
                  {prs.map((pr) => (
                    <View key={pr.exercise_id} style={styles.row}>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onTertiaryContainer, flex: 1 }}
                        accessibilityLabel={`New personal record: ${pr.name}, ${toDisplay(pr.weight, unit)} ${unit}`}
                      >
                        {pr.name}
                      </Text>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onTertiaryContainer }}
                      >
                        {toDisplay(pr.previous_max, unit)} → {toDisplay(pr.weight, unit)} {unit}
                      </Text>
                    </View>
                  ))}
                  {repPrs.map((pr) => (
                    <View key={pr.exercise_id} style={styles.row}>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onTertiaryContainer, flex: 1 }}
                        accessibilityLabel={`New rep personal record: ${pr.name}, ${pr.reps} reps`}
                      >
                        {pr.name}
                      </Text>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onTertiaryContainer }}
                      >
                        {pr.previous_max} → {pr.reps} reps
                      </Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            );
          }

          if (item.key === "increases") {
            return (
              <Card style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="trending-up"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onSurface, marginLeft: 8, fontWeight: "700" }}
                    >
                      Weight Increases
                    </Text>
                  </View>
                  {increases.map((inc) => (
                    <View key={inc.exercise_id} style={styles.row}>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onSurface, flex: 1 }}
                        accessibilityLabel={`${inc.name}: weight increased from ${toDisplay(inc.previous, unit)} to ${toDisplay(inc.current, unit)} ${unit}`}
                      >
                        {inc.name}
                      </Text>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.primary }}
                      >
                        {toDisplay(inc.previous, unit)} → {toDisplay(inc.current, unit)} {unit}
                      </Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            );
          }

          if (item.key === "comparison" && comparison?.previous) {
            return (
              <Card style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="compare-horizontal"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onSurface, marginLeft: 8, fontWeight: "700" }}
                    >
                      vs. Last Time
                    </Text>
                  </View>
                  <View style={styles.compRow}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                      Volume
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurface }}
                      accessibilityLabel={`Volume ${comparison.current.volume >= comparison.previous.volume ? "increased" : "decreased"} by ${Math.abs(comparison.current.volume - comparison.previous.volume).toLocaleString()}`}
                    >
                      {delta(comparison.current.volume, comparison.previous.volume)}
                    </Text>
                  </View>
                  <View style={styles.compRow}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                      Duration
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurface }}
                    >
                      {deltaTime(comparison.current.duration, comparison.previous.duration)}
                    </Text>
                  </View>
                  <View style={styles.compRow}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
                      Sets
                    </Text>
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurface }}
                    >
                      {delta(comparison.current.sets, comparison.previous.sets)}
                    </Text>
                  </View>
                </Card.Content>
              </Card>
            );
          }

          if (item.key === "sets") {
            return (
              <Card style={[styles.section, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <View style={styles.sectionHeader}>
                    <MaterialCommunityIcons
                      name="dumbbell"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onSurface, marginLeft: 8, fontWeight: "700" }}
                    >
                      Sets
                    </Text>
                  </View>
                  {grouped.map((group) => (
                    <View key={group.name} style={styles.exerciseGroup}>
                      <Text
                        variant="labelLarge"
                        style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}
                      >
                        {group.name}
                      </Text>
                      {group.sets.map((set) => (
                        <View key={set.id} style={styles.setRow}>
                          <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                            {set.weight ?? 0} × {set.reps ?? 0}
                          </Text>
                          {set.training_mode && set.training_mode !== "weight" && (
                            <View style={[styles.modeBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                              <Text style={{ color: theme.colors.onSecondaryContainer, fontSize: 12, fontWeight: "700" }}>
                                {TRAINING_MODE_LABELS[set.training_mode]?.short ?? set.training_mode}
                              </Text>
                            </View>
                          )}
                          {set.tempo && (
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}
                            >
                              ♩ {set.tempo}
                            </Text>
                          )}
                          {set.rpe != null && (
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}
                            >
                              RPE {set.rpe}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  ))}
                </Card.Content>
              </Card>
            );
          }

          return null;
        }}
        ListFooterComponent={
          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={() => router.replace("/(tabs)")}
              style={styles.doneBtn}
              contentStyle={styles.btnContent}
              accessibilityRole="button"
              accessibilityHint="Return to workouts tab"
            >
              Done
            </Button>
            <Button
              mode="outlined"
              onPress={share}
              style={styles.shareBtn}
              contentStyle={styles.btnContent}
              accessibilityRole="button"
              accessibilityHint="Share workout summary"
            >
              Share
            </Button>
            <Button
              mode="text"
              onPress={() => router.replace(`/session/detail/${id}`)}
              contentStyle={styles.btnContent}
              accessibilityRole="button"
              accessibilityHint="View detailed workout breakdown"
            >
              View Details
            </Button>
          </View>
        }
      />
    </>
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
    paddingBottom: 48,
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
    paddingTop: 8,
  },
  title: {
    fontWeight: "700",
    marginTop: 8,
    marginBottom: 4,
  },
  stats: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
  },
  statInner: {
    alignItems: "center",
    paddingVertical: 8,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  compRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  exerciseGroup: {
    marginBottom: 8,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
    paddingLeft: 8,
  },
  modeBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  actions: {
    marginTop: 16,
    gap: 12,
  },
  doneBtn: {
    borderRadius: 8,
  },
  shareBtn: {
    borderRadius: 8,
  },
  btnContent: {
    paddingVertical: 4,
  },
});
