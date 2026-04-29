import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { CartesianChart, Line, Scatter } from "victory-native";
import { useFocusEffect } from "expo-router";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  getRecentSessionRPEs,
  getRecentSessionRatings,
} from "../../lib/db/e1rm-trends";
import type { SessionRPERow, SessionRatingRow } from "../../lib/db/e1rm-trends";

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
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={["y"]}
          domain={{ y: yDomain }}
          domainPadding={{ left: 10, right: 10 }}
        >
          {({ points }) => (
            <>
              <Line
                points={points.y}
                color={lineColor}
                strokeWidth={2}
                curveType="monotoneX"
              />
              {data.length === 1 && (
                <Scatter
                  points={points.y}
                  color={lineColor}
                  radius={5}
                  shape="circle"
                />
              )}
            </>
          )}
        </CartesianChart>
      </View>
    </Card>
  );
}

// ─── Self-Fetching RPE & Rating Cards ──────────────────────────────

type RPETrendCardProps = {
  chartWidth: number;
  style?: object;
};

export function RPETrendCard({ chartWidth, style }: RPETrendCardProps) {
  const colors = useThemeColors();
  const [rpeData, setRpeData] = useState<SessionRPERow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const rows = await getRecentSessionRPEs();
        setRpeData(rows);
      })();
    }, []),
  );

  const data = rpeData.map((d, i) => ({ x: i, y: d.avg_rpe }));

  return (
    <TrendLineCard
      title="Avg RPE per Session (1–10)"
      data={data}
      yDomain={[1, 10]}
      lineColor={colors.tertiary}
      emptyMessage="Log RPE on your sets to see trends here."
      chartWidth={chartWidth}
      style={style}
    />
  );
}

type RatingTrendCardProps = {
  chartWidth: number;
  style?: object;
};

export function RatingTrendCard({ chartWidth, style }: RatingTrendCardProps) {
  const colors = useThemeColors();
  const [ratingData, setRatingData] = useState<SessionRatingRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const rows = await getRecentSessionRatings();
        setRatingData(rows);
      })();
    }, []),
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
