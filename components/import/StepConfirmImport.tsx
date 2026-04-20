/* eslint-disable complexity */
import { useEffect, useState } from "react";
import { Alert, FlatList, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { buildImportData, getSampleSessions, shouldSkipSet } from "@/lib/import/strong-csv";
import type { ParseResult } from "@/lib/import/strong-csv";
import { createCustomExercise } from "@/lib/db/exercises";
import { getDatabase } from "@/lib/db/helpers";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { MatchState, ImportResult } from "./types";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  parsed: ParseResult;
  matches: MatchState[];
  sourceUnit: "kg" | "lb";
  targetUnit: "kg" | "lb";
  onBack: () => void;
  onComplete: (result: ImportResult) => void;
};

export default function StepConfirmImport({ parsed, matches, sourceUnit, targetUnit, onBack, onComplete }: Props) {
  const colors = useThemeColors();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const totalSets = parsed.rows.length;
  let skippedTimed = 0;
  let skippedDistance = 0;
  for (const row of parsed.rows) {
    const skip = shouldSkipSet(row);
    if (skip === "timed") skippedTimed++;
    if (skip === "distance") skippedDistance++;
  }
  const importableSets = totalSets - skippedTimed - skippedDistance;
  const newExercises = matches.filter((m) => m.confidence === "none" && !m.userOverrideExercise);
  const sampleSessions = getSampleSessions(parsed.sessions, 3);

  const [duplicates, setDuplicates] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDatabase();
        const dupes: string[] = [];
        for (const session of parsed.sessions) {
          const dateStr = session.date.trim().replace(" ", "T");
          const d = new Date(dateStr);
          const dateOnly = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          const existing = await db.getFirstAsync<{ id: string }>(
            "SELECT id FROM workout_sessions WHERE date(started_at/1000, 'unixepoch') = ? AND name = ?",
            [dateOnly, session.workoutName]
          );
          if (existing) dupes.push(`${session.workoutName} (${dateOnly})`);
        }
        if (!cancelled) setDuplicates(dupes);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [parsed.sessions]);

  const handleImport = async () => {
    Alert.alert("Confirm Import", `This will add ${parsed.sessions.length} sessions to your workout history. Continue?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Import", onPress: async () => {
        setImporting(true); setProgress(0);
        try {
          const db = await getDatabase();
          const exerciseMap = new Map<string, string>();
          for (const match of matches) {
            const mapped = match.userOverrideExercise ?? match.matchedExercise;
            if (mapped) exerciseMap.set(match.strongName, mapped.id);
          }
          let exercisesCreated = 0;
          for (const match of matches) {
            if (!exerciseMap.has(match.strongName)) {
              const newEx = await createCustomExercise({ name: match.strongName, category: "arms", primary_muscles: ["full_body"], secondary_muscles: [], equipment: "other", instructions: "", difficulty: "intermediate" });
              exerciseMap.set(match.strongName, newEx.id);
              exercisesCreated++;
            }
          }
          setProgress(0.2);
          const { dbSessions, dbSets, skippedTimed: st, skippedDistance: sd } = buildImportData(parsed.sessions, exerciseMap, sourceUnit, targetUnit);
          setProgress(0.4);
          await db.withTransactionAsync(async () => {
            const BATCH_SIZE = 100;
            for (let i = 0; i < dbSessions.length; i += BATCH_SIZE) {
              for (const s of dbSessions.slice(i, i + BATCH_SIZE)) {
                await db.runAsync("INSERT OR IGNORE INTO workout_sessions (id, template_id, name, started_at, completed_at, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", [s.id, s.template_id, s.name, s.started_at, s.completed_at, s.duration_seconds, s.notes]);
              }
              setProgress(0.4 + (0.2 * Math.min(i + BATCH_SIZE, dbSessions.length)) / dbSessions.length);
            }
            for (let i = 0; i < dbSets.length; i += BATCH_SIZE) {
              for (const s of dbSets.slice(i, i + BATCH_SIZE)) {
                await db.runAsync("INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round, training_mode, tempo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [s.id, s.session_id, s.exercise_id, s.set_number, s.weight, s.reps, s.completed, s.completed_at, s.rpe, s.notes, s.link_id, s.round, s.training_mode, s.tempo]);
              }
              setProgress(0.6 + (0.4 * Math.min(i + BATCH_SIZE, dbSets.length)) / Math.max(dbSets.length, 1));
            }
          });
          setProgress(1);
          onComplete({ sessionsImported: dbSessions.length, exercisesCreated, setsImported: dbSets.length, skippedTimed: st, skippedDistance: sd });
        } catch (err) {
          Alert.alert("Import Failed", err instanceof Error ? err.message : "An unexpected error occurred");
          setImporting(false);
        }
      }},
    ]);
  };

  const dateRange = parsed.sessions.length > 0 ? { earliest: parsed.sessions[0].date, latest: parsed.sessions[parsed.sessions.length - 1].date } : null;

  return (
    <ScrollView contentContainerStyle={styles.stepContainer} accessibilityRole="none">
      <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }} accessibilityRole="header">Step 3: Confirm & Import</Text>

      <Card style={{ ...styles.card, backgroundColor: colors.surface }}><CardContent>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>Import Summary</Text>
        <Text style={{ color: colors.onSurfaceVariant }}>{parsed.sessions.length} session{parsed.sessions.length !== 1 ? "s" : ""}</Text>
        <Text style={{ color: colors.onSurfaceVariant }}>{matches.length} exercise{matches.length !== 1 ? "s" : ""} ({newExercises.length} new)</Text>
        <Text style={{ color: colors.onSurfaceVariant }}>{importableSets} set{importableSets !== 1 ? "s" : ""}</Text>
        {dateRange && <Text style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>Date range: {dateRange.earliest} → {dateRange.latest}</Text>}
        <Text style={{ color: colors.onSurfaceVariant }} accessibilityLabel={`Import summary: ${parsed.sessions.length} sessions, ${matches.length} exercises, ${importableSets} sets`}>Unit conversion: {sourceUnit} → {targetUnit}</Text>
      </CardContent></Card>

      {sampleSessions.length > 0 && (<Card style={{ ...styles.card, backgroundColor: colors.surface }}><CardContent>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>Sample Sessions</Text>
        <FlatList data={sampleSessions} scrollEnabled={false} keyExtractor={(_, i) => `session-${i}`} renderItem={({ item: s }) => (
          <Text style={{ color: colors.onSurfaceVariant, marginBottom: 4 }} accessibilityLabel={`Sample session: ${s.name} on ${s.date}, ${s.setCount} sets`}>{s.name} — {s.date} ({s.setCount} sets)</Text>
        )} />
      </CardContent></Card>)}

      {(skippedTimed > 0 || skippedDistance > 0) && (<Card style={{ ...styles.card, backgroundColor: colors.tertiaryContainer }}><CardContent>
        <Text style={{ color: colors.onTertiaryContainer }} accessibilityRole="alert">⚠️ {skippedTimed + skippedDistance} timed/cardio set{skippedTimed + skippedDistance !== 1 ? "s" : ""} will be skipped (not supported yet)</Text>
      </CardContent></Card>)}

      {duplicates.length > 0 && (<Card style={{ ...styles.card, backgroundColor: colors.errorContainer }}><CardContent>
        <Text variant="subtitle" style={{ color: colors.onErrorContainer, marginBottom: 4 }}>Potential Duplicates</Text>
        <Text style={{ color: colors.onErrorContainer }}>{duplicates.length} session{duplicates.length !== 1 ? "s" : ""} already exist with the same date and name. They will be skipped (INSERT OR IGNORE).</Text>
        <FlatList data={duplicates.slice(0, 5)} scrollEnabled={false} keyExtractor={(_, i) => `dup-${i}`} renderItem={({ item: d }) => (<Text style={{ color: colors.onErrorContainer, fontSize: fontSizes.xs, marginTop: 2 }}>• {d}</Text>)} />
        {duplicates.length > 5 && <Text style={{ color: colors.onErrorContainer, fontSize: fontSizes.xs, marginTop: 2 }}>...and {duplicates.length - 5} more</Text>}
      </CardContent></Card>)}

      {importing && (<View style={{ marginVertical: 16 }}>
        <Progress value={progress * 100} height={4} />
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 4 }}>Importing... {Math.round(progress * 100)}%</Text>
      </View>)}

      <View style={[styles.bottomBar, { paddingHorizontal: 0 }]}>
        <Button variant="outline" onPress={onBack} disabled={importing} accessibilityLabel="Go back to exercise mapping" accessibilityRole="button">Back</Button>
        <Button variant="default" onPress={handleImport} loading={importing} disabled={importing} accessibilityLabel="Start import" accessibilityRole="button">Import</Button>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stepContainer: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 12, borderRadius: 12 },
  bottomBar: { flexDirection: "row", justifyContent: "space-between", padding: 16, gap: 12 },
});
