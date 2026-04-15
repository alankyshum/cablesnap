import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  Card,
  List,
  ProgressBar,
  RadioButton,
  Text,
  useTheme,
} from "react-native-paper";
import { Stack, useRouter } from "expo-router";
import { File } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import {
  parseStrongCSV,
  buildImportData,
  convertWeight,
  getSampleRows,
  getSampleSessions,
  shouldSkipSet,
} from "../../lib/import/strong-csv";
import type {
  ParseResult,
} from "../../lib/import/strong-csv";
import {
  matchAllExercises,
} from "../../lib/import/exercise-matcher";
import type { ExerciseMatch } from "../../lib/import/exercise-matcher";
import { getAllExercises, createCustomExercise } from "../../lib/db/exercises";
import { getBodySettings } from "../../lib/db/body";
import { getDatabase } from "../../lib/db/helpers";
import type { Exercise } from "../../lib/types";

// ---- Step 1: Select File & Unit ----

function StepSelectFile({
  onNext,
}: {
  onNext: (
    parsed: ParseResult,
    sourceUnit: "kg" | "lb",
    targetUnit: "kg" | "lb"
  ) => void;
}) {
  const theme = useTheme();
  const [sourceUnit, setSourceUnit] = useState<"kg" | "lb">("kg");
  const [targetUnit, setTargetUnit] = useState<"kg" | "lb">("kg");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/comma-separated-values", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;

      setLoading(true);
      setError(null);
      setParsed(null);

      const uri = result.assets[0].uri;
      const file = new File(uri);
      const raw = await file.text();

      const parseResult = parseStrongCSV(raw);

      if (
        parseResult.rows.length === 0 &&
        parseResult.errors.length > 0
      ) {
        setError(parseResult.errors[0].reason);
        setLoading(false);
        return;
      }

      setParsed(parseResult);

      // Auto-detect target unit from body settings
      try {
        const settings = await getBodySettings();
        setTargetUnit(settings.weight_unit);
      } catch {
        // Default to kg
      }
    } catch {
      setError("Failed to read file");
    } finally {
      setLoading(false);
    }
  };

  const sampleRows = parsed ? getSampleRows(parsed.rows, 3) : [];

  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      accessibilityRole="none"
    >
      <Text
        variant="headlineSmall"
        style={{ color: theme.colors.onBackground, marginBottom: 16 }}
        accessibilityRole="header"
      >
        Step 1: Select File & Unit
      </Text>

      <Button
        mode="contained"
        icon="file-upload-outline"
        onPress={handlePickFile}
        loading={loading}
        disabled={loading}
        accessibilityLabel="Select Strong CSV file"
        accessibilityRole="button"
        style={{ marginBottom: 16 }}
        contentStyle={{ paddingVertical: 8 }}
      >
        Select CSV File
      </Button>

      {error && (
        <Card
          style={[styles.card, { backgroundColor: theme.colors.errorContainer }]}
        >
          <Card.Content>
            <Text
              style={{ color: theme.colors.onErrorContainer }}
              accessibilityRole="alert"
            >
              {error}
            </Text>
          </Card.Content>
        </Card>
      )}

      {parsed && parsed.rows.length > 0 && (
        <>
          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Content>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface, marginBottom: 8 }}
              >
                File Summary
              </Text>
              <Text style={{ color: theme.colors.onSurfaceVariant }}>
                {parsed.sessions.length} session
                {parsed.sessions.length !== 1 ? "s" : ""},{" "}
                {parsed.exerciseNames.length} exercise
                {parsed.exerciseNames.length !== 1 ? "s" : ""},{" "}
                {parsed.rows.length} set{parsed.rows.length !== 1 ? "s" : ""}
              </Text>
              {parsed.errors.length > 0 && (
                <Text
                  style={{
                    color: theme.colors.error,
                    marginTop: 4,
                  }}
                >
                  {parsed.errors.length} row
                  {parsed.errors.length !== 1 ? "s" : ""} skipped (parse
                  errors)
                </Text>
              )}
            </Card.Content>
          </Card>

          <Card
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Card.Content>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface, marginBottom: 12 }}
              >
                What unit did you use in Strong?
              </Text>
              <RadioButton.Group
                value={sourceUnit}
                onValueChange={(val) => setSourceUnit(val as "kg" | "lb")}
              >
                <RadioButton.Item
                  label="Kilograms (kg)"
                  value="kg"
                  accessibilityLabel="Kilograms"
                />
                <RadioButton.Item
                  label="Pounds (lbs)"
                  value="lb"
                  accessibilityLabel="Pounds"
                />
              </RadioButton.Group>
            </Card.Content>
          </Card>

          {sampleRows.length > 0 && (
            <Card
              style={[styles.card, { backgroundColor: theme.colors.surface }]}
            >
              <Card.Content>
                <Text
                  variant="titleMedium"
                  style={{
                    color: theme.colors.onSurface,
                    marginBottom: 8,
                  }}
                >
                  Preview (with conversion)
                </Text>
                {sampleRows.length > 0 && (
                  <FlatList
                    data={sampleRows}
                    scrollEnabled={false}
                    keyExtractor={(_, i) => `sample-${i}`}
                    renderItem={({ item: row, index: i }) => {
                      const converted = convertWeight(
                        row.weight,
                        sourceUnit,
                        targetUnit
                      );
                      return (
                        <View style={styles.previewRow}>
                          <Text
                            style={{ color: theme.colors.onSurface }}
                            accessibilityLabel={`Sample row ${i + 1}: ${row.exerciseName}, ${converted ?? "bodyweight"} ${targetUnit}, ${row.reps ?? 0} reps`}
                          >
                            {row.exerciseName} —{" "}
                            {converted !== null
                              ? `${converted} ${targetUnit}`
                              : "Bodyweight"}{" "}
                            × {row.reps ?? 0} reps
                          </Text>
                        </View>
                      );
                    }}
                  />
                )}
              </Card.Content>
            </Card>
          )}

          <Button
            mode="contained"
            onPress={() => onNext(parsed, sourceUnit, targetUnit)}
            style={{ marginTop: 8 }}
            contentStyle={{ paddingVertical: 8 }}
            accessibilityLabel="Continue to exercise mapping"
            accessibilityRole="button"
          >
            Continue
          </Button>
        </>
      )}
    </ScrollView>
  );
}

// ---- Step 2: Review Exercise Mapping ----

type MatchState = ExerciseMatch & {
  userConfirmed: boolean;
  userOverrideExercise: Exercise | null;
};

function ExerciseMatchItem({
  match,
  onConfirm,
}: {
  match: MatchState;
  onConfirm: (strongName: string) => void;
}) {
  const theme = useTheme();

  const icon =
    match.confidence === "exact"
      ? "check-circle"
      : match.confidence === "possible"
        ? "help-circle"
        : "close-circle";

  const label =
    match.confidence === "exact"
      ? "Exact match"
      : match.confidence === "possible"
        ? match.userConfirmed
          ? "Confirmed"
          : "Possible match — tap to confirm"
        : "No match — will create";

  const iconColor =
    match.confidence === "exact"
      ? theme.colors.primary
      : match.confidence === "possible"
        ? theme.colors.tertiary
        : theme.colors.error;

  const displayedExercise =
    match.userOverrideExercise ?? match.matchedExercise;

  return (
    <List.Item
      title={match.strongName}
      description={
        displayedExercise
          ? `→ ${displayedExercise.name} (${label})`
          : label
      }
      left={(props) => (
        <List.Icon {...props} icon={icon} color={iconColor} />
      )}
      right={
        match.confidence === "possible" && !match.userConfirmed
          ? () => (
              <Button
                mode="text"
                compact
                onPress={() => onConfirm(match.strongName)}
                accessibilityLabel={`Confirm match for ${match.strongName}`}
                accessibilityRole="button"
              >
                Confirm
              </Button>
            )
          : undefined
      }
      accessibilityLabel={`${match.strongName}: ${label}${displayedExercise ? `, mapped to ${displayedExercise.name}` : ""}`}
    />
  );
}

function StepReviewMapping({
  exerciseNames,
  exercises,
  onNext,
  onBack,
}: {
  exerciseNames: string[];
  exercises: Exercise[];
  onNext: (
    matches: MatchState[]
  ) => void;
  onBack: () => void;
}) {
  const theme = useTheme();

  const initialMatches = useMemo(() => {
    const raw = matchAllExercises(exerciseNames, exercises);
    const result: MatchState[] = [];
    for (const m of raw) {
      result.push({
        ...m,
        userConfirmed: m.confidence === "exact",
        userOverrideExercise: null,
      });
    }
    return result;
  }, [exerciseNames, exercises]);

  const [matches, setMatches] = useState<MatchState[]>(initialMatches);

  const grouped = useMemo(() => {
    return {
      exact: matches.filter((m) => m.confidence === "exact"),
      possible: matches.filter((m) => m.confidence === "possible"),
      none: matches.filter((m) => m.confidence === "none"),
    };
  }, [matches]);

  const [exactCollapsed, setExactCollapsed] = useState(true);

  const handleConfirm = useCallback(
    (strongName: string) => {
      setMatches((prev) => {
        const next: MatchState[] = [];
        for (const m of prev) {
          next.push(
            m.strongName === strongName ? { ...m, userConfirmed: true } : m
          );
        }
        return next;
      });
    },
    []
  );

  const sections = useMemo(() => {
    const items: { type: "header" | "item"; data: MatchState | string; key: string }[] = [];

    if (grouped.exact.length > 0) {
      items.push({
        type: "header",
        data: `Exact Matches (${grouped.exact.length})`,
        key: "header-exact",
      });
      if (!exactCollapsed) {
        for (const m of grouped.exact) {
          items.push({ type: "item", data: m, key: `exact-${m.strongName}` });
        }
      }
    }

    if (grouped.possible.length > 0) {
      items.push({
        type: "header",
        data: `Possible Matches (${grouped.possible.length})`,
        key: "header-possible",
      });
      for (const m of grouped.possible) {
        items.push({ type: "item", data: m, key: `possible-${m.strongName}` });
      }
    }

    if (grouped.none.length > 0) {
      items.push({
        type: "header",
        data: `New Exercises (${grouped.none.length})`,
        key: "header-none",
      });
      for (const m of grouped.none) {
        items.push({ type: "item", data: m, key: `none-${m.strongName}` });
      }
    }

    return items;
  }, [grouped, exactCollapsed]);

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: "Import from Strong" }} />
      <View style={styles.stepHeader}>
        <Text
          variant="headlineSmall"
          style={{ color: theme.colors.onBackground }}
          accessibilityRole="header"
        >
          Step 2: Review Exercise Mapping
        </Text>
        <Text
          variant="bodySmall"
          style={{
            color: theme.colors.onSurfaceVariant,
            marginTop: 4,
          }}
        >
          {matches.length} exercise
          {matches.length !== 1 ? "s" : ""} found
        </Text>
      </View>

      <FlatList
        data={sections}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => {
          if (item.type === "header") {
            const title = item.data as string;
            const isExact = title.startsWith("Exact");
            return (
              <List.Item
                title={title}
                titleStyle={{
                  fontWeight: "bold",
                  color: theme.colors.onSurface,
                }}
                accessibilityRole="header"
                onPress={
                  isExact
                    ? () => setExactCollapsed((prev) => !prev)
                    : undefined
                }
                right={
                  isExact
                    ? (props) => (
                        <List.Icon
                          {...props}
                          icon={
                            exactCollapsed
                              ? "chevron-down"
                              : "chevron-up"
                          }
                        />
                      )
                    : undefined
                }
                accessibilityState={
                  isExact ? { expanded: !exactCollapsed } : undefined
                }
              />
            );
          }
          return (
            <ExerciseMatchItem
              match={item.data as MatchState}
              onConfirm={handleConfirm}
            />
          );
        }}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      <View style={styles.bottomBar}>
        <Button
          mode="outlined"
          onPress={onBack}
          contentStyle={{ paddingVertical: 8 }}
          accessibilityLabel="Go back to file selection"
          accessibilityRole="button"
        >
          Back
        </Button>
        <Button
          mode="contained"
          onPress={() => onNext(matches)}
          contentStyle={{ paddingVertical: 8 }}
          accessibilityLabel="Continue to import confirmation"
          accessibilityRole="button"
        >
          Continue
        </Button>
      </View>
    </View>
  );
}

// ---- Step 3: Confirm & Import ----

function StepConfirmImport({
  parsed,
  matches,
  sourceUnit,
  targetUnit,
  onBack,
  onComplete,
}: {
  parsed: ParseResult;
  matches: MatchState[];
  sourceUnit: "kg" | "lb";
  targetUnit: "kg" | "lb";
  onBack: () => void;
  onComplete: (result: {
    sessionsImported: number;
    exercisesCreated: number;
    setsImported: number;
    skippedTimed: number;
    skippedDistance: number;
  }) => void;
}) {
  const theme = useTheme();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  // Count stats
  const totalSets = parsed.rows.length;
  let skippedTimed = 0;
  let skippedDistance = 0;
  for (const row of parsed.rows) {
    const skip = shouldSkipSet(row);
    if (skip === "timed") skippedTimed++;
    if (skip === "distance") skippedDistance++;
  }
  const importableSets = totalSets - skippedTimed - skippedDistance;

  const newExercises = matches.filter(
    (m) => m.confidence === "none" && !m.userOverrideExercise
  );
  const sampleSessions = getSampleSessions(parsed.sessions, 3);

  // Check for duplicates
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
          if (existing) {
            dupes.push(`${session.workoutName} (${dateOnly})`);
          }
        }
        if (!cancelled) setDuplicates(dupes);
      } catch {
        // Duplicate check non-critical
      }
    })();
    return () => { cancelled = true; };
  }, [parsed.sessions]);

  const handleImport = async () => {
    Alert.alert(
      "Confirm Import",
      `This will add ${parsed.sessions.length} sessions to your workout history. Continue?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          onPress: async () => {
            setImporting(true);
            setProgress(0);

            try {
              const db = await getDatabase();

              // Build exercise map: strongName → exerciseId
              const exerciseMap = new Map<string, string>();

              // Map matched exercises
              for (const match of matches) {
                const mapped =
                  match.userOverrideExercise ?? match.matchedExercise;
                if (mapped) {
                  exerciseMap.set(match.strongName, mapped.id);
                }
              }

              // Create new exercises for unmatched
              let exercisesCreated = 0;
              for (const match of matches) {
                if (!exerciseMap.has(match.strongName)) {
                  const newEx = await createCustomExercise({
                    name: match.strongName,
                    category: "arms",
                    primary_muscles: ["full_body"],
                    secondary_muscles: [],
                    equipment: "other",
                    instructions: "",
                    difficulty: "intermediate",
                  });
                  exerciseMap.set(match.strongName, newEx.id);
                  exercisesCreated++;
                }
              }

              setProgress(0.2);

              // Build import data
              const { dbSessions, dbSets, skippedTimed: st, skippedDistance: sd } =
                buildImportData(
                  parsed.sessions,
                  exerciseMap,
                  sourceUnit,
                  targetUnit
                );

              setProgress(0.4);

              // Insert in a single transaction
              await db.withTransactionAsync(async () => {
                const BATCH_SIZE = 100;

                // Insert sessions
                for (let i = 0; i < dbSessions.length; i += BATCH_SIZE) {
                  const batch = dbSessions.slice(i, i + BATCH_SIZE);
                  for (const s of batch) {
                    await db.runAsync(
                      "INSERT OR IGNORE INTO workout_sessions (id, template_id, name, started_at, completed_at, duration_seconds, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
                      [
                        s.id,
                        s.template_id,
                        s.name,
                        s.started_at,
                        s.completed_at,
                        s.duration_seconds,
                        s.notes,
                      ]
                    );
                  }
                  setProgress(
                    0.4 +
                      (0.2 * Math.min(i + BATCH_SIZE, dbSessions.length)) /
                        dbSessions.length
                  );
                }

                // Insert sets
                for (let i = 0; i < dbSets.length; i += BATCH_SIZE) {
                  const batch = dbSets.slice(i, i + BATCH_SIZE);
                  for (const s of batch) {
                    await db.runAsync(
                      "INSERT OR IGNORE INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, rpe, notes, link_id, round, training_mode, tempo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                      [
                        s.id,
                        s.session_id,
                        s.exercise_id,
                        s.set_number,
                        s.weight,
                        s.reps,
                        s.completed,
                        s.completed_at,
                        s.rpe,
                        s.notes,
                        s.link_id,
                        s.round,
                        s.training_mode,
                        s.tempo,
                      ]
                    );
                  }
                  setProgress(
                    0.6 +
                      (0.4 * Math.min(i + BATCH_SIZE, dbSets.length)) /
                        Math.max(dbSets.length, 1)
                  );
                }
              });

              setProgress(1);
              onComplete({
                sessionsImported: dbSessions.length,
                exercisesCreated,
                setsImported: dbSets.length,
                skippedTimed: st,
                skippedDistance: sd,
              });
            } catch (err) {
              Alert.alert(
                "Import Failed",
                err instanceof Error
                  ? err.message
                  : "An unexpected error occurred"
              );
              setImporting(false);
            }
          },
        },
      ]
    );
  };

  const dateRange = parsed.sessions.length > 0
    ? {
        earliest: parsed.sessions[0].date,
        latest: parsed.sessions[parsed.sessions.length - 1].date,
      }
    : null;

  return (
    <ScrollView
      contentContainerStyle={styles.stepContainer}
      accessibilityRole="none"
    >
      <Text
        variant="headlineSmall"
        style={{ color: theme.colors.onBackground, marginBottom: 16 }}
        accessibilityRole="header"
      >
        Step 3: Confirm & Import
      </Text>

      <Card
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <Card.Content>
          <Text
            variant="titleMedium"
            style={{ color: theme.colors.onSurface, marginBottom: 8 }}
          >
            Import Summary
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {parsed.sessions.length} session
            {parsed.sessions.length !== 1 ? "s" : ""}
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {matches.length} exercise
            {matches.length !== 1 ? "s" : ""}{" "}
            ({newExercises.length} new)
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {importableSets} set{importableSets !== 1 ? "s" : ""}
          </Text>
          {dateRange && (
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              Date range: {dateRange.earliest} → {dateRange.latest}
            </Text>
          )}
          <Text
            style={{ color: theme.colors.onSurfaceVariant }}
            accessibilityLabel={`Import summary: ${parsed.sessions.length} sessions, ${matches.length} exercises, ${importableSets} sets`}
          >
            Unit conversion: {sourceUnit} → {targetUnit}
          </Text>
        </Card.Content>
      </Card>

      {sampleSessions.length > 0 && (
        <Card
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
        >
          <Card.Content>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurface, marginBottom: 8 }}
            >
              Sample Sessions
            </Text>
            <FlatList
              data={sampleSessions}
              scrollEnabled={false}
              keyExtractor={(_, i) => `session-${i}`}
              renderItem={({ item: s }) => (
                <Text
                  style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}
                  accessibilityLabel={`Sample session: ${s.name} on ${s.date}, ${s.setCount} sets`}
                >
                  {s.name} — {s.date} ({s.setCount} sets)
                </Text>
              )}
            />
          </Card.Content>
        </Card>
      )}

      {(skippedTimed > 0 || skippedDistance > 0) && (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.colors.tertiaryContainer },
          ]}
        >
          <Card.Content>
            <Text
              style={{ color: theme.colors.onTertiaryContainer }}
              accessibilityRole="alert"
            >
              ⚠️{" "}
              {skippedTimed + skippedDistance} timed/cardio set
              {skippedTimed + skippedDistance !== 1 ? "s" : ""} will be
              skipped (not supported yet)
            </Text>
          </Card.Content>
        </Card>
      )}

      {duplicates.length > 0 && (
        <Card
          style={[
            styles.card,
            { backgroundColor: theme.colors.errorContainer },
          ]}
        >
          <Card.Content>
            <Text
              variant="titleSmall"
              style={{
                color: theme.colors.onErrorContainer,
                marginBottom: 4,
              }}
            >
              Potential Duplicates
            </Text>
            <Text style={{ color: theme.colors.onErrorContainer }}>
              {duplicates.length} session
              {duplicates.length !== 1 ? "s" : ""} already exist with the
              same date and name. They will be skipped (INSERT OR IGNORE).
            </Text>
            <FlatList
              data={duplicates.slice(0, 5)}
              scrollEnabled={false}
              keyExtractor={(_, i) => `dup-${i}`}
              renderItem={({ item: d }) => (
                <Text
                  style={{
                    color: theme.colors.onErrorContainer,
                    fontSize: 12,
                    marginTop: 2,
                  }}
                >
                  • {d}
                </Text>
              )}
            />
            {duplicates.length > 5 && (
              <Text
                style={{
                  color: theme.colors.onErrorContainer,
                  fontSize: 12,
                  marginTop: 2,
                }}
              >
                ...and {duplicates.length - 5} more
              </Text>
            )}
          </Card.Content>
        </Card>
      )}

      {importing && (
        <View style={{ marginVertical: 16 }}>
          <ProgressBar
            progress={progress}
            color={theme.colors.primary}
            accessibilityLabel={`Import progress: ${Math.round(progress * 100)}%`}
          />
          <Text
            variant="bodySmall"
            style={{
              color: theme.colors.onSurfaceVariant,
              textAlign: "center",
              marginTop: 4,
            }}
          >
            Importing... {Math.round(progress * 100)}%
          </Text>
        </View>
      )}

      <View style={[styles.bottomBar, { paddingHorizontal: 0 }]}>
        <Button
          mode="outlined"
          onPress={onBack}
          disabled={importing}
          contentStyle={{ paddingVertical: 8 }}
          accessibilityLabel="Go back to exercise mapping"
          accessibilityRole="button"
        >
          Back
        </Button>
        <Button
          mode="contained"
          onPress={handleImport}
          loading={importing}
          disabled={importing}
          contentStyle={{ paddingVertical: 8 }}
          accessibilityLabel="Start import"
          accessibilityRole="button"
        >
          Import
        </Button>
      </View>
    </ScrollView>
  );
}

// ---- Import Complete ----

function ImportComplete({
  result,
  onDone,
}: {
  result: {
    sessionsImported: number;
    exercisesCreated: number;
    setsImported: number;
    skippedTimed: number;
    skippedDistance: number;
  };
  onDone: () => void;
}) {
  const theme = useTheme();

  return (
    <ScrollView contentContainerStyle={styles.stepContainer}>
      <Text
        variant="headlineSmall"
        style={{
          color: theme.colors.primary,
          marginBottom: 16,
          textAlign: "center",
        }}
        accessibilityRole="header"
      >
        Import Complete! ✓
      </Text>

      <Card
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
      >
        <Card.Content>
          <Text style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
            Sessions imported: {result.sessionsImported}
          </Text>
          <Text style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
            Exercises created: {result.exercisesCreated}
          </Text>
          <Text style={{ color: theme.colors.onSurface, marginBottom: 4 }}>
            Sets imported: {result.setsImported}
          </Text>
          {(result.skippedTimed > 0 || result.skippedDistance > 0) && (
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              Skipped: {result.skippedTimed} timed,{" "}
              {result.skippedDistance} distance
            </Text>
          )}
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={onDone}
        style={{ marginTop: 16 }}
        contentStyle={{ paddingVertical: 8 }}
        accessibilityLabel="Return to settings"
        accessibilityRole="button"
      >
        Done
      </Button>
    </ScrollView>
  );
}

// ---- Main Screen ----

export default function ImportStrongScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [sourceUnit, setSourceUnit] = useState<"kg" | "lb">("kg");
  const [targetUnit, setTargetUnit] = useState<"kg" | "lb">("kg");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [matches, setMatches] = useState<MatchState[] | null>(null);
  const [importResult, setImportResult] = useState<{
    sessionsImported: number;
    exercisesCreated: number;
    setsImported: number;
    skippedTimed: number;
    skippedDistance: number;
  } | null>(null);

  const handleStep1Complete = useCallback(
    async (
      p: ParseResult,
      sUnit: "kg" | "lb",
      tUnit: "kg" | "lb"
    ) => {
      setParsed(p);
      setSourceUnit(sUnit);
      setTargetUnit(tUnit);
      const allExercises = await getAllExercises();
      setExercises(allExercises);
      setStep(2);
    },
    []
  );

  const handleStep2Complete = useCallback(
    (m: MatchState[]) => {
      setMatches(m);
      setStep(3);
    },
    []
  );

  const handleImportComplete = useCallback(
    (result: {
      sessionsImported: number;
      exercisesCreated: number;
      setsImported: number;
      skippedTimed: number;
      skippedDistance: number;
    }) => {
      setImportResult(result);
      setStep(4);
    },
    []
  );

  return (
    <View
      style={[
        styles.flex,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <Stack.Screen options={{ title: "Import from Strong" }} />

      {step === 1 && (
        <StepSelectFile onNext={handleStep1Complete} />
      )}

      {step === 2 && parsed && (
        <StepReviewMapping
          exerciseNames={parsed.exerciseNames}
          exercises={exercises}
          onNext={handleStep2Complete}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && parsed && matches && (
        <StepConfirmImport
          parsed={parsed}
          matches={matches}
          sourceUnit={sourceUnit}
          targetUnit={targetUnit}
          onBack={() => setStep(2)}
          onComplete={handleImportComplete}
        />
      )}

      {step === 4 && importResult && (
        <ImportComplete
          result={importResult}
          onDone={() => router.back()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  stepContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  stepHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  previewRow: {
    paddingVertical: 4,
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    gap: 12,
  },
});
