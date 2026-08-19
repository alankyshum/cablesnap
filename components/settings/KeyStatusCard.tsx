import { Pressable, StyleSheet, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { fontSizes, spacing } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useKeyStatus } from "@/hooks/useKeyStatus";

function formatAmount(value: number | null): string {
  return value === null ? "Unavailable" : `$${value.toFixed(2)}`;
}

export default function KeyStatusCard() {
  const colors = useThemeColors();
  const status = useKeyStatus();

  return (
    <Card variant="outline">
      <CardHeader>
        <CardTitle>OpenRouter key status</CardTitle>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <Text variant="caption">Loading key-scoped usage…</Text>
        ) : status.data?.kind === "missing_key" ? (
          <Text variant="caption">Add an OpenRouter key to view its usage.</Text>
        ) : status.isError ? (
          <View>
            <Text variant="caption">Key-scoped usage is unavailable right now.</Text>
            <Pressable onPress={() => void status.refetch()} accessibilityRole="button" style={styles.refresh}>
              <Text variant="link">Refresh</Text>
            </Pressable>
          </View>
        ) : status.data?.kind === "available" ? (
          <>
            <View style={styles.grid}>
              <Metric label="Remaining limit" value={formatAmount(status.data.limitRemaining)} colors={colors} />
              <Metric label="Used today" value={formatAmount(status.data.usageDaily)} colors={colors} />
              <Metric label="Used this month" value={formatAmount(status.data.usageMonthly)} colors={colors} />
            </View>
            <Text variant="caption" style={styles.note}>
              These figures are scoped to this key, not your whole OpenRouter account. Account-wide credits require a management key, which this app never holds.
            </Text>
            <Pressable onPress={() => void status.refetch()} accessibilityRole="button" style={styles.refresh}>
              <Text variant="link">Refresh</Text>
            </Pressable>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useThemeColors> }) {
  return (
    <View style={styles.metric}>
      <Text variant="caption">{label}</Text>
      <Text style={{ color: colors.onSurface, fontSize: fontSizes.lg, fontWeight: "700" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.md },
  metric: { gap: spacing.xs },
  note: { marginTop: spacing.md, lineHeight: 18 },
  refresh: { alignSelf: "flex-start", marginTop: spacing.md },
});
