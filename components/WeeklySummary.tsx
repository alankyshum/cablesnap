import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ChevronLeft, ChevronRight, Share2 } from "lucide-react-native";
import { useFocusEffect } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";

import {
  getWeeklySummary,
  getBodySettings,
} from "../lib/db";
import type { WeeklySummaryData } from "../lib/db";
import type { BodySettings } from "../lib/types";
import { mondayOf, formatDuration } from "../lib/format";
import { toDisplay } from "../lib/units";
import { duration, easing } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

// ─── Helpers ───────────────────────────────────────────────────────

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_WEEKS_BACK = 12;

function formatWeekRange(weekStartMs: number): string {
  const start = new Date(weekStartMs);
  const end = new Date(weekStartMs + 6 * 24 * 60 * 60 * 1000);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function volumeChangePercent(current: number, previous: number | null): string | null {
  if (previous === null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return pct > 0 ? `+${pct}%` : `${pct}%`;
}

// ─── Component ─────────────────────────────────────────────────────

export default function WeeklySummary() {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();

  const [expanded, setExpanded] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0); // 0 = current week
  const [data, setData] = useState<WeeklySummaryData | null>(null);
  const [settings, setSettings] = useState<BodySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Cache for preloaded weeks (ref to avoid re-render loops)
  const cacheRef = useRef<Record<number, WeeklySummaryData>>({});

  const currentMonday = useMemo(() => mondayOf(new Date()), []);
  const weekStartMs = currentMonday + weekOffset * ONE_WEEK_MS;

  // Animation
  const expandHeight = useSharedValue(0);
  const expandOpacity = useSharedValue(0);

  const expandAnimStyle = useAnimatedStyle(() => ({
    maxHeight: expandHeight.value,
    opacity: expandOpacity.value,
    overflow: "hidden" as const,
  }));

  useEffect(() => {
    if (reducedMotion) {
      expandHeight.value = expanded ? 2000 : 0;
      expandOpacity.value = expanded ? 1 : 0;
      return;
    }
    expandHeight.value = withTiming(expanded ? 2000 : 0, {
      duration: duration.normal,
      easing: easing.standard,
    });
    expandOpacity.value = withTiming(expanded ? 1 : 0, {
      duration: duration.normal,
      easing: easing.standard,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, reducedMotion]);

  const loadWeek = useCallback(
    async (offset: number): Promise<WeeklySummaryData | null> => {
      const monday = currentMonday + offset * ONE_WEEK_MS;
      try {
        return await getWeeklySummary(monday);
      } catch {
        return null;
      }
    },
    [currentMonday]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const cached = cacheRef.current[weekOffset];
      const [summary, bodySettings] = await Promise.all([
        cached ? Promise.resolve(cached) : loadWeek(weekOffset),
        getBodySettings(),
      ]);
      if (summary) {
        setData(summary);
        cacheRef.current[weekOffset] = summary;
      } else {
        setError(true);
      }
      setSettings(bodySettings);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [weekOffset, loadWeek]);

  // Preload adjacent weeks after initial render
  useEffect(() => {
    let cancelled = false;
    const preload = async () => {
      // Small delay to not block initial render
      await new Promise((r) => setTimeout(r, 100));
      if (cancelled) return;
      const offsets = [weekOffset - 1, weekOffset + 1].filter(
        (o) => o <= 0 && o >= -MAX_WEEKS_BACK && !cacheRef.current[o]
      );
      for (const o of offsets) {
        if (cancelled) return;
        const result = await loadWeek(o);
        if (result && !cancelled) {
          cacheRef.current[o] = result;
        }
      }
    };
    preload();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const unit = settings?.weight_unit ?? "kg";
  const canGoBack = weekOffset > -MAX_WEEKS_BACK;
  const canGoForward = weekOffset < 0;

  const navigateWeek = (dir: -1 | 1) => {
    const next = weekOffset + dir;
    if (next < -MAX_WEEKS_BACK || next > 0) return;
    setWeekOffset(next);
  };

  // ─── Share ─────────────────────────────────────────────────────

  const buildShareText = (): string => {
    if (!data) return "";
    const { workouts, prs, nutrition, body, streak } = data;
    const range = formatWeekRange(weekStartMs);
    const lines: string[] = [
      `📊 FitForge Weekly Summary`,
      `Week of ${range}`,
      "",
    ];

    if (workouts.sessionCount > 0) {
      lines.push(
        `💪 Workouts: ${workouts.sessionCount} completed (${formatDuration(workouts.totalDurationSeconds)} total)`
      );
      const volChange = volumeChangePercent(workouts.totalVolume, workouts.previousWeekVolume);
      const volStr = `${formatNumber(Math.round(toDisplay(workouts.totalVolume, unit)))} ${unit}`;
      lines.push(
        `📈 Volume: ${volStr}${volChange ? ` (${volChange} vs last week)` : ""}`
      );
    }

    if (prs.length > 0) {
      const prParts = prs.map((pr) => {
        const w = toDisplay(pr.newMax, unit);
        const delta =
          pr.previousMax !== null
            ? ` (+${toDisplay(pr.newMax - pr.previousMax, unit)})`
            : "";
        return `${pr.exerciseName} ${w}${unit}${delta}`;
      });
      lines.push(`🏆 PRs: ${prParts.join(", ")}`);
    }

    if (nutrition) {
      lines.push(
        `🥗 Nutrition: ${nutrition.daysOnTarget}/${nutrition.daysTracked} days on target (avg ${formatNumber(nutrition.avgCalories)} cal)`
      );
    }

    if (body && body.startWeight !== null && body.endWeight !== null) {
      const start = toDisplay(body.startWeight, unit);
      const end = toDisplay(body.endWeight, unit);
      const delta = Math.round((end - start) * 10) / 10;
      const sign = delta >= 0 ? "+" : "";
      lines.push(`⚖️ Weight: ${start} → ${end} ${unit} (${sign}${delta})`);
    }

    if (streak > 0) {
      lines.push(`🔥 Streak: ${streak} weeks`);
    }

    lines.push("", "Tracked with FitForge");
    return lines.join("\n");
  };

  const handleShare = async () => {
    try {
      await Share.share({ message: buildShareText() });
    } catch {
      // Share cancelled or failed — ignore
    }
  };

  // ─── Error / Loading states ────────────────────────────────────

  if (error) {
    return (
      <Card
        style={[styles.card, { backgroundColor: colors.surface }]}
        accessibilityLabel="Weekly summary unavailable"
      >
        <CardContent>
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant, textAlign: "center" }}
          >
            Couldn&apos;t load summary
          </Text>
        </CardContent>
      </Card>
    );
  }

  if (loading || !data) {
    return (
      <Card style={[styles.card, { backgroundColor: colors.surface }]}>
        <CardContent>
          <View style={styles.headerRow}>
            <Text variant="subtitle" style={{ color: colors.onSurface }}>
              📊 Loading…
            </Text>
          </View>
        </CardContent>
      </Card>
    );
  }

  // ─── Headline metrics ──────────────────────────────────────────

  const { workouts, prs, nutrition, body, streak } = data;
  const volChange = volumeChangePercent(workouts.totalVolume, workouts.previousWeekVolume);
  const isEmpty = workouts.sessionCount === 0;

  const headlineParts: string[] = [];
  if (workouts.scheduledCount !== null) {
    headlineParts.push(`${workouts.sessionCount}/${workouts.scheduledCount} workouts`);
  } else {
    headlineParts.push(
      `${workouts.sessionCount} workout${workouts.sessionCount !== 1 ? "s" : ""}`
    );
  }
  if (volChange) headlineParts.push(`${volChange} volume`);
  if (prs.length > 0) headlineParts.push(`${prs.length} PR${prs.length !== 1 ? "s" : ""}`);

  const headline = headlineParts.join("  ·  ");

  // ─── Render ────────────────────────────────────────────────────

  return (
    <Card
      style={[styles.card, { backgroundColor: colors.surface }]}
      accessibilityLabel={`Weekly summary for ${formatWeekRange(weekStartMs)}`}
      accessibilityState={{ expanded }}
    >
      <CardContent>
        {/* Header with week navigation */}
        <View style={styles.headerRow}>
          <Text style={{ fontSize: 20, marginRight: 8 }}>📊</Text>
          <Text
            variant="subtitle"
            style={{ color: colors.onSurface, flex: 1 }}
          >
            Week of {formatWeekRange(weekStartMs)}
          </Text>
          <Button
            variant="ghost"
            size="icon"
            icon={ChevronLeft}
            onPress={() => navigateWeek(-1)}
            disabled={!canGoBack}
            accessibilityLabel="Previous week"
            style={styles.navButton}
          />
          <Button
            variant="ghost"
            size="icon"
            icon={ChevronRight}
            onPress={() => navigateWeek(1)}
            disabled={!canGoForward}
            accessibilityLabel="Next week"
            style={styles.navButton}
          />
        </View>

        {isEmpty ? (
          <Text
            variant="body"
            style={{ color: colors.onSurfaceVariant, marginTop: 8 }}
          >
            No workouts logged this week. Start one from the Workouts tab!
          </Text>
        ) : (
          <>
            {/* Collapsed headline */}
            <Text
              variant="body"
              style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
              accessibilityLabel={headline}
            >
              {headline}
            </Text>

            {/* Expand/collapse toggle */}
            <Pressable
              onPress={() => setExpanded(!expanded)}
              accessibilityHint="Double tap to expand weekly summary"
              accessibilityRole="button"
              style={styles.toggleButton}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
              <Text
                variant="body"
                style={{ color: colors.primary }}
              >
                {expanded ? "Hide Details" : "View Details"}
              </Text>
            </Pressable>

            {/* Expanded content */}
            <Animated.View style={expandAnimStyle}>
              <View style={styles.expandedContent}>
                <Separator style={{ marginVertical: 12 }} />

                {/* WORKOUTS */}
                <Text
                  variant="subtitle"
                  style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
                >
                  WORKOUTS
                </Text>
                {workouts.scheduledCount !== null ? (
                  <StatRow
                    label="Completed"
                    value={`${workouts.sessionCount} of ${workouts.scheduledCount} scheduled (${Math.round((workouts.sessionCount / workouts.scheduledCount) * 100)}%)`}
                    colors={colors}
                  />
                ) : (
                  <StatRow
                    label="Completed"
                    value={`${workouts.sessionCount} workout${workouts.sessionCount !== 1 ? "s" : ""}`}
                    colors={colors}
                  />
                )}
                <StatRow
                  label="Total duration"
                  value={formatDuration(workouts.totalDurationSeconds)}
                  colors={colors}
                />
                {workouts.sessionCount > 0 && (
                  <StatRow
                    label="Avg session"
                    value={formatDuration(
                      Math.round(workouts.totalDurationSeconds / workouts.sessionCount)
                    )}
                    colors={colors}
                  />
                )}

                {/* VOLUME */}
                <Separator style={{ marginVertical: 12 }} />
                <Text
                  variant="subtitle"
                  style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
                >
                  VOLUME
                </Text>
                <StatRow
                  label="Total"
                  value={`${formatNumber(Math.round(toDisplay(workouts.totalVolume, unit)))} ${unit}${volChange ? `  ▲ ${volChange} vs last` : ""}`}
                  colors={colors}
                />
                {workouts.sessionCount > 0 && (
                  <StatRow
                    label="Avg per session"
                    value={`${formatNumber(Math.round(toDisplay(workouts.totalVolume / workouts.sessionCount, unit)))} ${unit}`}
                    colors={colors}
                  />
                )}
                {workouts.hasBodyweightOnly && (
                  <Text
                    variant="caption"
                    style={{ color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: 4 }}
                  >
                    Volume tracks weighted exercises only
                  </Text>
                )}

                {/* PRs */}
                {prs.length > 0 && (
                  <>
                    <Separator style={{ marginVertical: 12 }} />
                    <Text
                      variant="subtitle"
                      style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
                    >
                      PERSONAL RECORDS
                    </Text>
                    {prs.map((pr) => {
                      const w = toDisplay(pr.newMax, unit);
                      const delta =
                        pr.previousMax !== null
                          ? ` (+${toDisplay(pr.newMax - pr.previousMax, unit)} ${unit})`
                          : "";
                      return (
                        <View key={pr.exerciseId} style={styles.prRow}>
                          <Text style={{ fontSize: 16, marginRight: 8 }}>🏆</Text>
                          <Text
                            variant="body"
                            style={{ color: colors.onSurface, flex: 1 }}
                          >
                            {pr.exerciseName}
                          </Text>
                          <Text
                            variant="body"
                            style={{ color: colors.primary }}
                          >
                            {w} {unit}{delta}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}

                {/* NUTRITION */}
                {nutrition && (
                  <>
                    <Separator style={{ marginVertical: 12 }} />
                    <Text
                      variant="subtitle"
                      style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
                    >
                      NUTRITION ({nutrition.daysTracked}/7 days tracked)
                    </Text>
                    <StatRow
                      label="Avg calories"
                      value={`${formatNumber(nutrition.avgCalories)} / ${formatNumber(nutrition.calorieTarget)} target`}
                      colors={colors}
                    />
                    <StatRow
                      label={`Protein avg`}
                      value={`${nutrition.avgProtein}g / ${nutrition.proteinTarget}g target${nutrition.avgProtein >= nutrition.proteinTarget ? " ✓" : ""}`}
                      colors={colors}
                    />
                    <StatRow
                      label="Days on target"
                      value={`${nutrition.daysOnTarget}/${nutrition.daysTracked}`}
                      colors={colors}
                    />
                  </>
                )}

                {/* BODY */}
                {body && (
                  <>
                    <Separator style={{ marginVertical: 12 }} />
                    <Text
                      variant="subtitle"
                      style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
                    >
                      BODY
                    </Text>
                    {body.entryCount === 1 ? (
                      <StatRow
                        label="Weight"
                        value={`${toDisplay(body.startWeight!, unit)} ${unit}`}
                        colors={colors}
                      />
                    ) : (
                      <>
                        <StatRow
                          label="Weight"
                          value={(() => {
                            const s = toDisplay(body.startWeight!, unit);
                            const e = toDisplay(body.endWeight!, unit);
                            const d = Math.round((e - s) * 10) / 10;
                            const sign = d > 0 ? "+" : "";
                            return `${s} ${unit} → ${e} ${unit} (${sign}${d})`;
                          })()}
                          colors={colors}
                        />
                        {body.entryCount >= 3 && (
                          <Text
                            variant="caption"
                            style={{ color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: 2 }}
                          >
                            (3-day rolling avg)
                          </Text>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* STREAK */}
                {streak > 0 && (
                  <>
                    <Separator style={{ marginVertical: 12 }} />
                    <Text
                      variant="subtitle"
                      style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
                    >
                      STREAK
                    </Text>
                    <View style={styles.streakRow}>
                      <Text
                        variant="body"
                        style={{ color: colors.onSurface }}
                      >
                        Current: {streak} week{streak !== 1 ? "s" : ""}  🔥
                      </Text>
                    </View>
                    {weekOffset === 0 && (
                      <Text
                        variant="caption"
                        style={{ color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: 2 }}
                      >
                        (current week in progress)
                      </Text>
                    )}
                  </>
                )}

                {/* Share button */}
                <View style={styles.shareContainer}>
                  <Button
                    variant="outline"
                    icon={Share2}
                    onPress={handleShare}
                    accessibilityLabel="Share weekly summary"
                    accessibilityHint="Share your weekly training summary as text"
                    style={{ marginTop: 16 }}
                  >
                    Share Summary
                  </Button>
                </View>
              </View>
            </Animated.View>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── StatRow helper ────────────────────────────────────────────────

function StatRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: { onSurface: string; onSurfaceVariant: string };
}) {
  return (
    <View style={styles.statRow}>
      <Text variant="body" style={{ color: colors.onSurfaceVariant, flex: 1 }}>
        {label}
      </Text>
      <Text variant="body" style={{ color: colors.onSurface }}>
        {value}
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  navButton: {
    margin: 0,
    width: 48,
    height: 48,
  },
  toggleButton: {
    paddingVertical: 8,
    alignSelf: "flex-start",
    minHeight: 48,
    justifyContent: "center",
  },
  expandedContent: {
    paddingTop: 0,
  },
  sectionLabel: {
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  streakRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  shareContainer: {
    alignItems: "center",
    marginTop: 8,
  },
});
