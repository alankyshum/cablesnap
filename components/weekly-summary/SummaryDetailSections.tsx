/* eslint-disable max-lines-per-function, complexity */
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Share2 } from "lucide-react-native";

import type { WeeklySummaryData } from "@/lib/db";
import { formatDuration } from "@/lib/format";
import { toDisplay } from "@/lib/units";
import { formatNumber } from "@/hooks/useWeeklySummary";
import { fontSizes } from "@/constants/design-tokens";
import { Trans } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { plural } from "@lingui/core/macro";

// ─── Types ─────────────────────────────────────────────────────────

interface SummaryDetailSectionsProps {
  data: WeeklySummaryData;
  unit: "kg" | "lb";
  weekOffset: number;
  volChange: string | null;
  handleShare: () => void;
  colors: {
    onSurface: string;
    onSurfaceVariant: string;
    primary: string;
  };
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

// ─── Component ─────────────────────────────────────────────────────

export function SummaryDetailSections({
  data,
  unit,
  weekOffset,
  volChange,
  handleShare,
  colors,
}: SummaryDetailSectionsProps) {
  const { workouts, prs, nutrition, body, streak } = data;

  return (
    <>
      <Separator style={{ marginVertical: 12 }} />

      {/* WORKOUTS */}
      <Text
        variant="subtitle"
        style={[styles.sectionLabel, { color: colors.onSurfaceVariant }]}
      >
        <Trans id="components.weeklySummary.workouts">WORKOUTS</Trans>
      </Text>
      {workouts.scheduledCount !== null ? (
        <StatRow
          label={t({ id: "components.weeklySummary.completed", message: "Completed" })}
          value={`${workouts.sessionCount} of ${workouts.scheduledCount} scheduled (${Math.round((workouts.sessionCount / workouts.scheduledCount) * 100)}%)`}
          colors={colors}
        />
      ) : (
        <StatRow
          label={t({ id: "components.weeklySummary.completed", message: "Completed" })}
           value={t({ id: "components.weeklySummary.workoutCount", message: plural(workouts.sessionCount, { one: "# workout", other: "# workouts" }) })}
          colors={colors}
        />
      )}
      <StatRow
        label={t({ id: "components.weeklySummary.totalDuration", message: "Total duration" })}
        value={formatDuration(workouts.totalDurationSeconds)}
        colors={colors}
      />
      {workouts.sessionCount > 0 && (
        <StatRow
          label={t({ id: "components.weeklySummary.avgSession", message: "Avg session" })}
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
        <Trans id="components.weeklySummary.volume">VOLUME</Trans>
      </Text>
      <StatRow
        label={t({ id: "components.weeklySummary.total", message: "Total" })}
        value={`${formatNumber(Math.round(toDisplay(workouts.totalVolume, unit)))} ${unit}${volChange ? `  ▲ ${volChange} vs last` : ""}`}
        colors={colors}
      />
      {workouts.sessionCount > 0 && (
        <StatRow
          label={t({ id: "components.weeklySummary.avgPerSession", message: "Avg per session" })}
          value={`${formatNumber(Math.round(toDisplay(workouts.totalVolume / workouts.sessionCount, unit)))} ${unit}`}
          colors={colors}
        />
      )}
      {workouts.hasBodyweightOnly && (
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: 4 }}
        >
          <Trans id="components.weeklySummary.weightedOnly">Volume tracks weighted exercises only</Trans>
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
            <Trans id="components.weeklySummary.personalRecords">PERSONAL RECORDS</Trans>
          </Text>
          {prs.map((pr) => {
            const w = toDisplay(pr.newMax, unit);
            const delta =
              pr.previousMax !== null
                ? ` (+${toDisplay(pr.newMax - pr.previousMax, unit)} ${unit})`
                : "";
            return (
              <View key={pr.exerciseId} style={styles.prRow}>
                <Text style={{ fontSize: fontSizes.base, marginRight: 8 }}>🏆</Text>
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
            <Trans id="components.weeklySummary.nutrition">NUTRITION ({nutrition.daysTracked}/7 days tracked)</Trans>
          </Text>
          <StatRow
            label={t({ id: "components.weeklySummary.avgCalories", message: "Avg calories" })}
            value={`${formatNumber(nutrition.avgCalories)} / ${formatNumber(nutrition.calorieTarget)} target`}
            colors={colors}
          />
          <StatRow
            label={t({ id: "components.weeklySummary.proteinAvg", message: "Protein avg" })}
            value={`${nutrition.avgProtein}g / ${nutrition.proteinTarget}g target${nutrition.avgProtein >= nutrition.proteinTarget ? " ✓" : ""}`}
            colors={colors}
          />
          <StatRow
            label={t({ id: "components.weeklySummary.daysOnTarget", message: "Days on target" })}
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
            <Trans id="components.weeklySummary.body">BODY</Trans>
          </Text>
          {body.entryCount === 1 ? (
            <StatRow
              label={t({ id: "components.weeklySummary.weight", message: "Weight" })}
              value={`${toDisplay(body.startWeight!, unit)} ${unit}`}
              colors={colors}
            />
          ) : (
            <>
              <StatRow
                label={t({ id: "components.weeklySummary.weight", message: "Weight" })}
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
                  <Trans id="components.weeklySummary.rollingAverage">(3-day rolling avg)</Trans>
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
            <Trans id="components.weeklySummary.streak">STREAK</Trans>
          </Text>
          <View style={styles.streakRow}>
            <Text
              variant="body"
              style={{ color: colors.onSurface }}
            >
               {t({ id: "components.weeklySummary.currentStreak", message: `Current: ${plural(streak, { one: "# week", other: "# weeks" })} 🔥` })}
            </Text>
          </View>
          {weekOffset === 0 && (
            <Text
              variant="caption"
              style={{ color: colors.onSurfaceVariant, fontStyle: "italic", marginTop: 2 }}
            >
              <Trans id="components.weeklySummary.currentWeek">(current week in progress)</Trans>
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
          accessibilityLabel={t({ id: "components.weeklySummary.shareA11y", message: "Share weekly summary" })}
          accessibilityHint={t({ id: "components.weeklySummary.shareHint", message: "Share your weekly training summary as text" })}
          style={{ marginTop: 16 }}
        >
          <Trans id="components.weeklySummary.share">Share Summary</Trans>
        </Button>
      </View>
    </>
  );
}

// ─── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
