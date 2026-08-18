import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { LineChart } from "@/components/charts";
import { useFocusEffect } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  getRecentSessionRPEs,
  getRecentSessionRatings,
} from "../../lib/db/e1rm-trends";
import type { SessionRPERow, SessionRatingRow } from "../../lib/db/e1rm-trends";
import { rpeToRir } from "@/lib/intensity";
import { useIntensityMode } from "@/hooks/useIntensityMode";

type TrendLineCardProps = {
  title: string;
  data: { x: number; y: number }[];
  yDomain: [number, number];
  lineColor: string;
  emptyMessage: string;
  chartWidth: number;
  style?: object;
};

export function TrendLineCard({
  title,
  data,
  yDomain,
  lineColor,
  emptyMessage,
  chartWidth,
  style,
}: TrendLineCardProps) {
  const colors = useThemeColors();

  if (data.length === 0) {
    return (
      <Card style={[styles.card, style]}>
        <Text
          variant="subtitle"
          style={{ color: colors.onSurface, marginBottom: 8 }}
        >
          {title}
        </Text>
        <View style={styles.emptyContainer}>
          <Text style={{ color: colors.onSurfaceVariant, textAlign: "center" }}>
            {emptyMessage}
          </Text>
        </View>
      </Card>
    );
  }

  const latest = data[data.length - 1];
  const accessibilityLabel = `${title}: latest value ${latest.y.toFixed(1)}, ${data.length} session${data.length === 1 ? "" : "s"}`;

  return (
    <Card style={[styles.card, style]}>
      <Text
        variant="subtitle"
        style={{ color: colors.onSurface, marginBottom: 12 }}
      >
        {title}
      </Text>
      <View
        style={{ width: chartWidth, height: 180 }}
        accessibilityRole="image"
        accessibilityLabel={accessibilityLabel}
      >
        <LineChart
          labels={data.map(({ x }) => String(x))}
          series={[{
            key: "y",
            values: data.map(({ y }) => y),
            color: lineColor,
            strokeWidth: 2,
            curve: "monotoneX",
            showPoints: data.length === 1,
            pointRadius: 5,
          }]}
          yDomain={yDomain}
          padding={{ left: 10, right: 10 }}
          height={180}
          width={chartWidth}
        />
      </View>
    </Card>
  );
}

// ─── Self-Fetching RPE & Rating Cards ──────────────────────────────

type RPETrendCardProps = {
  chartWidth: number;
  gymId?: string | null;
  style?: object;
};

export function RPETrendCard({ chartWidth, gymId, style }: RPETrendCardProps) {
  const colors = useThemeColors();
  const [rpeData, setRpeData] = useState<SessionRPERow[]>([]);
  // BLD-2701: Q3 decision — NO axis inversion. Chart stays canonical RPE.
  // In RIR mode, show a labeled RIR readout below the chart.
  const intensityMode = useIntensityMode();

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const rows = await getRecentSessionRPEs(Date.now(), gymId);
        setRpeData(rows);
      })();
    }, [gymId]),
  );

  const data = rpeData.map((d, i) => ({ x: i, y: d.avg_rpe }));
  const latestRpe = rpeData.length > 0 ? rpeData[rpeData.length - 1].avg_rpe : null;

  return (
    <View style={style}>
      <TrendLineCard
        title="Avg RPE per Session (1–10)"
        data={data}
        yDomain={[1, 10]}
        lineColor={colors.tertiary}
        emptyMessage="Log RPE on your sets to see trends here."
        chartWidth={chartWidth}
      />
      {intensityMode === "rir" && latestRpe != null && (
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, marginTop: -8, marginBottom: 8, textAlign: "right" }}
          accessibilityLabel={`Latest session avg RIR: ${Math.round(rpeToRir(latestRpe) * 10) / 10}`}
        >
          Latest avg: {Math.round(rpeToRir(latestRpe) * 10) / 10} RIR
        </Text>
      )}
    </View>
  );
}

type RatingTrendCardProps = {
  chartWidth: number;
  gymId?: string | null;
  style?: object;
};

export function RatingTrendCard({ chartWidth, gymId, style }: RatingTrendCardProps) {
  const colors = useThemeColors();
  const [ratingData, setRatingData] = useState<SessionRatingRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const rows = await getRecentSessionRatings(Date.now(), gymId);
        setRatingData(rows);
      })();
    }, [gymId]),
  );

  const data = ratingData.map((d, i) => ({ x: i, y: d.rating }));

  return (
    <TrendLineCard
      title="Session Ratings (1–5)"
      data={data}
      yDomain={[1, 5]}
      lineColor={colors.secondary}
      emptyMessage="Rate your sessions to see trends here."
      chartWidth={chartWidth}
      style={style}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  emptyContainer: {
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
});
