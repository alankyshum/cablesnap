import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { toDisplay } from "@/lib/units";
import { percentageTable } from "@/lib/rm";
import type { ExerciseRecords } from "@/lib/db";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ThemeColors;
  records: ExerciseRecords | null;
  recordsLoading: boolean;
  recordsError: boolean;
  best: { weight: number; reps: number } | null;
  bw: boolean;
  unit: "kg" | "lb";
  exerciseId: string | undefined;
  loadRecords: (id: string) => void;
  style?: object;
  /**
   * BLD-788: when true, the "no data" empty state shows the variant-filter-
   * specific message and CTA instead of the generic onboarding text.
   */
  variantFilterActive?: boolean;
};

function RecordsEmptyState({ colors, variantFilterActive }: { colors: ThemeColors; variantFilterActive?: boolean }) {
  if (variantFilterActive) {
    return (
      <View accessibilityLabel="No sets logged with this variant yet. Log this variant in your next session.">
        <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
          No sets logged with this variant yet
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          Log this variant in your next session.
        </Text>
      </View>
    );
  }
  return (
    <Text variant="body" style={{ color: colors.onSurfaceVariant }}>No workout data yet — start a session to build your history</Text>
  );
}

// BLD-541 (pre-existing) + BLD-788 empty-state branch tip complexity over 15.
// eslint-disable-next-line complexity
export default function ExerciseRecordsCard({
  colors, records, recordsLoading, recordsError, best, bw, unit,
  exerciseId, loadRecords, style, variantFilterActive,
}: Props) {
  const router = useRouter();

  return (
    <Card style={[styles.card, style, { backgroundColor: colors.surface }]}>
      <CardContent>
        <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12 }}>Personal Records</Text>
        {recordsLoading ? (
          <ActivityIndicator style={styles.loader} />
        ) : recordsError ? (
          <View style={styles.errorBox}>
            <Text style={{ color: colors.error }}>Failed to load records</Text>
            <Button variant="ghost" onPress={() => exerciseId && loadRecords(exerciseId)} label="Retry" />
          </View>
        ) : records && records.total_sessions === 0 ? (
          <RecordsEmptyState colors={colors} variantFilterActive={variantFilterActive} />
        ) : records ? (
          <>
            <View style={styles.statsRow}>
              {bw ? (
                <>
                  <Stat colors={colors} value={records.max_reps ?? "—"} label="Max Reps" a11y={`Maximum reps: ${records.max_reps ?? 0}`} />
                  <Stat colors={colors} value={records.total_sessions} label="Sessions" a11y={`Total sessions: ${records.total_sessions}`} />
                  <Stat colors={colors} value={records.max_volume != null ? Math.round(records.max_volume) : "—"} label="Best Vol" a11y={`Best volume: ${records.max_volume ?? 0}`} />
                </>
              ) : (
                <>
                  <Stat colors={colors} value={records.max_weight != null ? toDisplay(records.max_weight, unit) : "—"} label={`Max ${unit}`} a11y={`Maximum weight: ${records.max_weight != null ? toDisplay(records.max_weight, unit) : 0} ${unit}`} />
                  <Stat colors={colors} value={records.max_reps ?? "—"} label="Max Reps" a11y={`Maximum reps: ${records.max_reps ?? 0}`} />
                  <Stat colors={colors} value={records.est_1rm != null ? toDisplay(records.est_1rm, unit) : "—"} label={best && best.reps === 1 ? "Tested 1RM" : "Est 1RM"} a11y={`Estimated one rep max: ${records.est_1rm != null ? toDisplay(records.est_1rm, unit) : 0} ${unit}`} />
                  <Stat colors={colors} value={records.total_sessions} label="Sessions" a11y={`Total sessions: ${records.total_sessions}`} />
                </>
              )}
            </View>

            {!bw && records.est_1rm != null && (() => {
              const tested = best != null && best.reps === 1;
              const orm = toDisplay(records.est_1rm!, unit);
              const table = percentageTable(orm);
              const source = best ? `Based on: ${toDisplay(best.weight, unit)}${unit} × ${best.reps} reps` : "";
              return (
                <View style={[styles.pctSection, { borderTopColor: colors.outlineVariant }]}>
                  <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
                    {tested ? "Tested 1RM" : "Estimated 1RM"}: {orm} {unit}
                  </Text>
                  {source ? <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>{source} · Epley</Text> : null}
                  <View style={styles.pctTable}>
                    <View style={styles.pctRow}>
                      <Text variant="caption" style={[styles.pctCol, { color: colors.onSurfaceVariant }]}>% 1RM</Text>
                      <Text variant="caption" style={[styles.pctCol, { color: colors.onSurfaceVariant }]}>Weight</Text>
                      <Text variant="caption" style={[styles.pctCol, { color: colors.onSurfaceVariant }]}>Reps</Text>
                    </View>
                    {table.map((row) => (
                      <Pressable key={row.pct} onPress={() => router.push(`/tools/plates?weight=${row.weight}`)} accessibilityLabel={`${row.pct} percent of one rep max, ${row.weight} ${unit === "kg" ? "kilograms" : "pounds"}, ${row.reps} reps`} accessibilityRole="button"
                        style={[styles.pctRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.outlineVariant }]}
                        accessibilityHint="Opens plate calculator with this weight">
                        <Text variant="caption" style={[styles.pctCol, { color: colors.onSurface }]}>{row.pct}%</Text>
                        <Text variant="caption" style={[styles.pctCol, { color: colors.onSurface }]}>{row.weight} {unit}</Text>
                        <Text variant="caption" style={[styles.pctCol, { color: colors.onSurface }]}>{row.reps}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Button variant="ghost" size="sm" onPress={() => router.push("/tools/rm")} style={{ alignSelf: "flex-start", marginTop: 4 }} accessibilityLabel="Open 1RM calculator" label="1RM Calculator" />
                </View>
              );
            })()}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ colors, value, label, a11y }: { colors: ThemeColors; value: string | number; label: string; a11y: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={a11y}>
      <Text variant="heading" style={{ color: colors.primary }}>{String(value)}</Text>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16, borderRadius: 12 },
  loader: { paddingVertical: 24 },
  errorBox: { alignItems: "center", paddingVertical: 12 },
  statsRow: { flexDirection: "row", justifyContent: "space-around" },
  stat: { alignItems: "center" },
  pctSection: { marginTop: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  pctTable: { borderRadius: 8, overflow: "hidden" },
  pctRow: { flexDirection: "row", paddingVertical: 6, paddingHorizontal: 4 },
  pctCol: { flex: 1, textAlign: "center" },
});
