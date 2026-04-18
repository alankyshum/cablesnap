import { StyleSheet, View } from "react-native";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Text } from "@/components/ui/text";
import { CartesianChart, Bar } from "victory-native";
import { formatDuration, formatDateShort } from "../../lib/format";
import { useThemeColors } from "@/hooks/useThemeColors";

type PR = { exercise_id: string; name: string; max_weight: number };
type SessionRow = {
  id: string;
  name: string;
  started_at: number;
  duration_seconds: number | null;
  set_count: number;
};

type ChartCardProps = {
  title: string;
  data: { x: string; y: number }[];
  xKey: string;
  yKey: string;
  chartWidth: number;
  style?: object;
};

export function WorkoutChartCard({ title, data, chartWidth, style }: ChartCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={[styles.card, style]}>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
        {title}
      </Text>
      <View style={{ width: chartWidth, height: 180 }}>
        <CartesianChart
          data={data}
          xKey="x"
          yKeys={["y"]}
          domainPadding={{ left: 20, right: 20 }}
        >
          {({ points, chartBounds }) => (
            <Bar
              points={points.y}
              chartBounds={chartBounds}
              color={colors.primary}
              roundedCorners={{ topLeft: 4, topRight: 4 }}
            />
          )}
        </CartesianChart>
      </View>
    </Card>
  );
}

type PRCardProps = {
  prs: PR[];
  style?: object;
};

export function PRCard({ prs, style }: PRCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={[styles.card, style]}>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
        Personal Records
      </Text>
      {prs.length === 0 ? (
        <Text style={{ color: colors.onSurfaceVariant }}>
          No records yet — start lifting!
        </Text>
      ) : (
        prs.map((pr) => (
          <View
            key={pr.exercise_id}
            style={[styles.prRow, { borderBottomColor: colors.outlineVariant }]}
          >
            <Text style={{ color: colors.onSurface, flex: 1 }}>{pr.name}</Text>
            <Text variant="body" style={{ color: colors.primary, fontWeight: "600" }}>
              {pr.max_weight} kg
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

type SessionsCardProps = {
  sessions: SessionRow[];
  style?: object;
};

export function SessionsCard({ sessions, style }: SessionsCardProps) {
  const colors = useThemeColors();

  return (
    <Card style={[styles.card, style]}>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 12 }}>
        Recent Sessions
      </Text>
      {sessions.map((s, i) => (
        <View key={s.id}>
          <View style={styles.sessionRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.onSurface }}>{s.name}</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {formatDateShort(s.started_at)} · {formatDuration(s.duration_seconds)} · {s.set_count} sets
              </Text>
            </View>
          </View>
          {i < sessions.length - 1 && (
            <Separator style={{ marginVertical: 6 }} />
          )}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
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
