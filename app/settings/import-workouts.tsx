/**
 * Import Workouts screen — preview + import CSV workout history.
 * BLD-2463
 *
 * Mirrors import-backup.tsx structure.
 * State machine is owned by hooks/useCsvImport.ts.
 *
 * Phases: parsing → unit_selection → matching → preview → importing → done
 *
 * Route params:
 *   filePath: string — local file URI from DocumentPicker (or E2E seam)
 */
import { useState, useEffect, useCallback } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "@/lib/layout";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useCsvImport } from "@/hooks/useCsvImport";
import type { CsvParseResult } from "@/lib/csv-import";
import type { MatchResult } from "@/lib/exercise-matcher";
import type { CsvImportProgress, CsvImportResult } from "@/lib/db/csv-import";
import type { WeightUnit } from "@/hooks/useCsvImport";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/bna-toast";

// ---- Unit toggle buttons ----

const UNIT_BUTTONS = [
  { value: "kg", label: "kg", accessibilityLabel: "Weights in kilograms" },
  { value: "lbs", label: "lbs", accessibilityLabel: "Weights in pounds" },
];

// ---- Exercise match confidence badge label ----

function confidenceBadgeLabel(confidence: MatchResult["bestMatch"] extends null | undefined ? never : NonNullable<MatchResult["bestMatch"]>["confidence"]): string {
  switch (confidence) {
    case "high": return "high match";
    case "medium": return "medium match";
    case "low": return "low match";
  }
}

function confidenceColor(confidence: "high" | "medium" | "low", colors: ReturnType<typeof useThemeColors>): string {
  switch (confidence) {
    case "high": return colors.primary;
    case "medium": return colors.secondary ?? colors.onSurfaceVariant;
    case "low": return colors.error;
  }
}

// ---- Overlap warning banner ----

function OverlapWarningBanner({
  minDate,
  maxDate,
  colors,
}: {
  minDate: Date;
  maxDate: Date;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const minStr = minDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const maxStr = maxDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <Card
      style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surfaceVariant ?? colors.surface, borderColor: colors.outline ?? colors.onSurfaceVariant }])}
      testID="import-workouts-overlap-warning"
    >
      <CardContent>
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant }}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`Warning: You may have already imported workouts in the date range ${minStr} to ${maxStr}. Importing again will add them as duplicates.`}
        >
          {`You may have already imported workouts in this date range (${minStr} – ${maxStr}). Importing again will add them as duplicates.`}
        </Text>
      </CardContent>
    </Card>
  );
}

// ---- Unit selection phase ----

function UnitSelectionView({
  parsed,
  onConfirm,
  colors,
  layout,
}: {
  parsed: CsvParseResult;
  onConfirm: (unit: WeightUnit) => void;
  colors: ReturnType<typeof useThemeColors>;
  layout: ReturnType<typeof useLayout>;
}) {
  const [unit, setUnit] = useState<WeightUnit>("kg");

  return (
    <FlatList
      data={[]}
      keyExtractor={() => "placeholder"}
      renderItem={null}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
      ListHeaderComponent={
        <>
          <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }}>
            Weight Units
          </Text>
          <Card style={styles.card}>
            <CardContent>
              <Text variant="body" style={{ color: colors.onSurface, marginBottom: 12 }}>
                {`This CSV uses ambiguous weight units. Select the units used in your ${parsed.formatLabel}.`}
              </Text>
              <SegmentedControl
                value={unit}
                onValueChange={(v) => setUnit(v as WeightUnit)}
                buttons={UNIT_BUTTONS}
                style={{ marginBottom: 16 }}
              />
              <Button
                variant="default"
                onPress={() => onConfirm(unit)}
                testID="import-workouts-confirm-unit-btn"
                accessibilityLabel={`Confirm weight unit ${unit}`}
                accessibilityRole="button"
              >
                {`Continue with ${unit}`}
              </Button>
            </CardContent>
          </Card>
        </>
      }
    />
  );
}

// ---- Preview phase ----

function PreviewView({
  parsed,
  matches,
  overlapWarning,
  onImport,
  onCancel,
  colors,
  layout,
}: {
  parsed: CsvParseResult;
  matches: Map<string, MatchResult>;
  overlapWarning: { minDate: Date; maxDate: Date } | null;
  onImport: () => void;
  onCancel: () => void;
  colors: ReturnType<typeof useThemeColors>;
  layout: ReturnType<typeof useLayout>;
}) {
  const matchEntries = Array.from(matches.values());
  // Sort: will-be-created first, then low, medium, high
  const sortedMatches = [...matchEntries].sort((a, b) => {
    const order = (r: MatchResult) => {
      if (!r.bestMatch || r.bestMatch.confidence === "low") return 0;
      if (r.bestMatch.confidence === "medium") return 1;
      return 2;
    };
    return order(a) - order(b);
  });

  const workoutCount = parsed.sessions.length;
  const setCount = parsed.sessions.reduce((sum, s) => sum + s.sets.length, 0);
  const exerciseCount = parsed.uniqueExercises.length;
  const skippedRows = parsed.skippedRows;

  return (
    <FlatList
      data={sortedMatches}
      keyExtractor={(item) => item.rawName}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
      ListHeaderComponent={
        <>
          <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }}>
            Import Preview
          </Text>

          {overlapWarning && (
            <>
              <OverlapWarningBanner
                minDate={overlapWarning.minDate}
                maxDate={overlapWarning.maxDate}
                colors={colors}
              />
              <View style={{ height: 12 }} />
            </>
          )}

          <Card style={styles.card}>
            <CardContent>
              <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }} testID="import-workouts-format-label">
                {parsed.formatLabel}
              </Text>
              <Text
                variant="body"
                style={{ color: colors.onSurfaceVariant }}
                testID="import-workouts-summary-line"
                accessibilityLabel={`${workoutCount} workouts, ${setCount} sets, ${exerciseCount} exercises${skippedRows > 0 ? `, ${skippedRows} rows skipped` : ""}`}
              >
                {`${workoutCount} workout${workoutCount !== 1 ? "s" : ""} · ${setCount} set${setCount !== 1 ? "s" : ""} · ${exerciseCount} exercise${exerciseCount !== 1 ? "s" : ""}${skippedRows > 0 ? ` · ${skippedRows} row${skippedRows !== 1 ? "s" : ""} skipped` : ""}`}
              </Text>
            </CardContent>
          </Card>

          <Card style={styles.card}>
            <CardContent>
              <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
                Exercise Matching
              </Text>
              <View style={{ flexDirection: "row", paddingVertical: 8 }}>
                <Text variant="caption" style={{ flex: 1, color: colors.onSurfaceVariant }}>Exercise</Text>
                <Text variant="caption" style={{ width: 100, textAlign: "right", color: colors.onSurfaceVariant }}>Match</Text>
              </View>
              <Separator />
            </CardContent>
          </Card>
        </>
      }
      renderItem={({ item: matchResult }) => {
        const hasGoodMatch = matchResult.bestMatch && matchResult.bestMatch.confidence !== "low";
        const badgeLabel = hasGoodMatch
          ? confidenceBadgeLabel(matchResult.bestMatch!.confidence)
          : "will be created";
        const badgeColor = hasGoodMatch
          ? confidenceColor(matchResult.bestMatch!.confidence, colors)
          : colors.onSurfaceVariant;

        return (
          <View style={{ paddingHorizontal: 0 }}>
            <View
              style={{ flexDirection: "row", paddingVertical: 10, alignItems: "center" }}
              accessibilityLabel={`${matchResult.rawName}: ${hasGoodMatch ? `matched to ${matchResult.bestMatch?.exercise.name}, ${badgeLabel}` : "will be created"}`}
              testID={`import-workouts-exercise-row-${matchResult.rawName}`}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text variant="body" style={{ color: colors.onSurface }}>
                  {matchResult.rawName}
                </Text>
                {hasGoodMatch && (
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                    {`→ ${matchResult.bestMatch!.exercise.name}`}
                  </Text>
                )}
              </View>
              <Text
                variant="caption"
                style={{ width: 100, textAlign: "right", color: badgeColor }}
                accessibilityLabel={badgeLabel}
                testID={`import-workouts-confidence-${matchResult.rawName}`}
              >
                {badgeLabel}
              </Text>
            </View>
            <Separator />
          </View>
        );
      }}
      ListFooterComponent={
        <View style={styles.actions}>
          <Button
            variant="outline"
            onPress={onCancel}
            style={styles.actionBtn}
            testID="import-workouts-cancel-btn"
            accessibilityLabel="Cancel import"
            accessibilityRole="button"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onPress={onImport}
            style={styles.actionBtn}
            testID="import-workouts-import-btn"
            accessibilityLabel={`Import ${workoutCount} workout${workoutCount !== 1 ? "s" : ""}`}
            accessibilityRole="button"
          >
            {`Import ${workoutCount} Workout${workoutCount !== 1 ? "s" : ""}`}
          </Button>
        </View>
      }
    />
  );
}

// ---- Importing phase ----

function ImportingView({
  progress,
  colors,
  layout,
}: {
  progress: CsvImportProgress;
  colors: ReturnType<typeof useThemeColors>;
  layout: ReturnType<typeof useLayout>;
}) {
  const pct = progress.total > 0 ? progress.current / progress.total : 0;
  const pctInt = Math.round(pct * 100);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: layout.horizontalPadding }]}>
      <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 24 }}>
        Importing…
      </Text>
      {/* Determinate progress bar */}
      <View
        style={[styles.progressTrack, { backgroundColor: colors.surfaceVariant ?? colors.outline ?? colors.onSurfaceVariant }]}
        accessibilityRole="progressbar"
        accessibilityLabel="Import progress"
        accessibilityValue={{ min: 0, max: 100, now: pctInt }}
        testID="import-workouts-progress-bar"
      >
        <View
          style={[styles.progressFill, { width: `${pctInt}%` as `${number}%`, backgroundColor: colors.primary }]}
        />
      </View>
      <Text
        variant="caption"
        style={{ color: colors.onSurfaceVariant, marginTop: 8, textAlign: "center" }}
        accessibilityLiveRegion="polite"
      >
        {`${progress.current} / ${progress.total} workouts`}
      </Text>
    </View>
  );
}

// ---- Done/summary phase ----

function DoneView({
  result,
  onDone,
  colors,
  layout,
}: {
  result: CsvImportResult;
  onDone: () => void;
  colors: ReturnType<typeof useThemeColors>;
  layout: ReturnType<typeof useLayout>;
}) {
  return (
    <FlatList
      data={[]}
      keyExtractor={() => "placeholder"}
      renderItem={null}
      contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
      ListHeaderComponent={
        <>
          <Text variant="heading" style={{ color: colors.onBackground, marginBottom: 16 }}>
            Import Complete
          </Text>
          <Card style={styles.card} testID="import-workouts-summary-card">
            <CardContent>
              {/* Neutral counts only — no motivational/identity framing */}
              <Text
                variant="body"
                style={{ color: colors.onSurface, marginBottom: 4 }}
                accessibilityLabel={`Imported ${result.sessionsInserted} workout${result.sessionsInserted !== 1 ? "s" : ""}`}
                testID="import-workouts-sessions-count"
              >
                {`${result.sessionsInserted} workout${result.sessionsInserted !== 1 ? "s" : ""} imported`}
              </Text>
              <Text
                variant="body"
                style={{ color: colors.onSurface, marginBottom: 4 }}
                testID="import-workouts-sets-count"
              >
                {`${result.setsInserted} set${result.setsInserted !== 1 ? "s" : ""} imported`}
              </Text>
              {result.exercisesCreated > 0 && (
                <Text
                  variant="body"
                  style={{ color: colors.onSurface, marginBottom: 4 }}
                  testID="import-workouts-exercises-created-count"
                >
                  {`${result.exercisesCreated} new exercise${result.exercisesCreated !== 1 ? "s" : ""} created`}
                </Text>
              )}
              {result.skippedSets > 0 && (
                <Text
                  variant="body"
                  style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}
                  testID="import-workouts-skipped-count"
                >
                  {`${result.skippedSets} set${result.skippedSets !== 1 ? "s" : ""} skipped`}
                </Text>
              )}
            </CardContent>
          </Card>
          <Button
            variant="default"
            onPress={onDone}
            style={{ marginTop: 16 }}
            testID="import-workouts-done-btn"
            accessibilityLabel="Done, return to settings"
            accessibilityRole="button"
          >
            Done
          </Button>
        </>
      }
    />
  );
}

// ---- Main screen ----

export default function ImportWorkouts() {
  const colors = useThemeColors();
  const router = useRouter();
  const layout = useLayout();
  const toast = useToast();
  const { filePath } = useLocalSearchParams<{ filePath?: string }>();
  const { state, parseCsv, confirmUnit, startImport, reset } = useCsvImport();

  // Load and parse the file on mount (or when E2E fixture param changes)
  useEffect(() => {
    if (!filePath) return;
    let mounted = true;

    (async () => {
      try {
        const { File } = await import("expo-file-system");
        const file = new File(filePath);
        const raw = await file.text();
        if (mounted) {
          await parseCsv(raw);
        }
      } catch {
        if (mounted) {
          // Treat unreadable files as a parse error
          await parseCsv(""); // triggers empty_file error
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = useCallback(async () => {
    try {
      await startImport();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      toast.error(message);
    }
  }, [startImport, toast]);

  const handleDone = useCallback(() => {
    reset();
    router.back();
  }, [reset, router]);

  // Loading / no file
  if (!filePath) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="body" style={{ color: colors.onBackground }}>No file selected.</Text>
        <Button
          variant="default"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
          testID="import-workouts-back-btn"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          Go Back
        </Button>
      </View>
    );
  }

  if (state.phase === "idle" || state.phase === "parsing" || state.phase === "matching") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}>
        <Text variant="body" style={{ color: colors.onBackground }} testID="import-workouts-loading">
          {state.phase === "matching" ? "Matching exercises…" : "Reading file…"}
        </Text>
      </View>
    );
  }

  if (state.phase === "error") {
    const errorMessages: Record<typeof state.error.type, string> = {
      empty_file: "This file is empty.",
      no_data: "No workout rows found in this file.",
      unrecognized_format:
        "This CSV does not match a Strong, Hevy, FitNotes, or CableSnap export. Check that you exported your workout history (not settings).",
      parse_error: "Could not read this file. Make sure it is the CSV your app exported.",
    };
    return (
      <View
        style={[styles.container, { backgroundColor: colors.background, padding: 24 }]}
        testID="import-workouts-error-view"
      >
        <Text
          variant="heading"
          style={{ color: colors.onBackground, marginBottom: 16 }}
        >
          Could Not Import
        </Text>
        <Text
          variant="body"
          style={{ color: colors.error }}
          testID="import-workouts-error-message"
        >
          {errorMessages[state.error.type] ?? state.error.message}
        </Text>
        <Button
          variant="default"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
          testID="import-workouts-back-btn"
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          Go Back
        </Button>
      </View>
    );
  }

  if (state.phase === "unit_selection") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <UnitSelectionView
          parsed={state.parsed}
          onConfirm={confirmUnit}
          colors={colors}
          layout={layout}
        />
      </View>
    );
  }

  if (state.phase === "preview") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <PreviewView
          parsed={state.parsed}
          matches={state.matches}
          overlapWarning={state.overlapWarning}
          onImport={handleImport}
          onCancel={() => router.back()}
          colors={colors}
          layout={layout}
        />
      </View>
    );
  }

  if (state.phase === "importing") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ImportingView progress={state.progress} colors={colors} layout={layout} />
      </View>
    );
  }

  if (state.phase === "done") {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <DoneView result={state.result} onDone={handleDone} colors={colors} layout={layout} />
      </View>
    );
  }

  // Unreachable — TypeScript exhaustiveness
  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 48,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 16,
    marginBottom: 8,
  },
  actionBtn: {
    minWidth: 120,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
  },
});
