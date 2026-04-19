import React from "react";
import { View } from "react-native";
import { Text } from "@/components/ui/text";
import { CardContent } from "@/components/ui/card";
import { CartesianChart, Line } from "victory-native";
import type { MuscleGroup } from "../../lib/types";
import { MUSCLE_LABELS } from "../../lib/types";
import type { TrendRow } from "../../hooks/useMuscleVolume";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  selected: MuscleGroup | null;
  trend: TrendRow[];
  hasEnoughTrend: boolean;
  chartWidth: number;
  reduced: boolean;
  colors: ThemeColors;
};

export default function VolumeTrendChart({
  selected,
  trend,
  hasEnoughTrend,
  chartWidth,
  reduced,
  colors,
}: Props) {
  return (
    <CardContent>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 4 }}>
        {selected ? `${MUSCLE_LABELS[selected]} — 8 Week Trend` : "Weekly Trend"}
      </Text>
      {hasEnoughTrend ? (
        <View style={{ width: chartWidth, height: 180 }}>
          <CartesianChart
            data={trend.map((t) => ({ week: t.week, sets: t.sets }))}
            xKey="week"
            yKeys={["sets"]}
            domainPadding={{ left: 10, right: 10 }}
          >
            {({ points }) => (
              <Line
                points={points.sets}
                color={colors.primary}
                strokeWidth={2}
                curveType={reduced ? "linear" : "natural"}
              />
            )}
          </CartesianChart>
        </View>
      ) : (
        <Text
          variant="body"
          style={{
            color: colors.onSurfaceVariant,
            textAlign: "center",
            padding: 24,
          }}
        >
          Keep training to see your trends
        </Text>
      )}
    </CardContent>
  );
}
