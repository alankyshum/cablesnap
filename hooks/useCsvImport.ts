/**
 * useCsvImport — orchestration hook for the CSV workout history import flow.
 * BLD-2463
 *
 * Responsibilities:
 * - Parse raw CSV text via parseCsvExport
 * - Run exercise matching via matchAllExercises
 * - Read-only overlap check (Path B — no engine dedupe)
 * - Manage import progress and result state
 * - Call importCsvSessions (DB logic stays in lib/db/csv-import.ts)
 *
 * Invariants:
 * - Weights converted exactly ONCE, before import (never in preview stat pass)
 * - Matcher Map passed straight through — do NOT re-key or rebuild
 */
import { useState, useCallback } from "react";
import { parseCsvExport, convertWeights } from "@/lib/csv-import";
import type { CsvParseResult, CsvParseError, ImportedSession } from "@/lib/csv-import";
import { matchAllExercises } from "@/lib/exercise-matcher";
import type { MatchResult } from "@/lib/exercise-matcher";
import { importCsvSessions } from "@/lib/db/csv-import";
import type { CsvImportProgress, CsvImportResult } from "@/lib/db/csv-import";
import { getAllExercises } from "@/lib/db";
import { getDatabase } from "@/lib/db/helpers";

export type WeightUnit = "kg" | "lbs";

export type CsvImportState =
  | { phase: "idle" }
  | { phase: "parsing" }
  | { phase: "error"; error: CsvParseError }
  | { phase: "unit_selection"; parsed: CsvParseResult }
  | { phase: "matching"; parsed: CsvParseResult; chosenUnit: WeightUnit }
  | {
      phase: "preview";
      parsed: CsvParseResult;
      sessions: ImportedSession[];
      matches: Map<string, MatchResult>;
      chosenUnit: WeightUnit | null;
      overlapWarning: { minDate: Date; maxDate: Date } | null;
    }
  | { phase: "importing"; progress: CsvImportProgress }
  | { phase: "done"; result: CsvImportResult };

export function useCsvImport() {
  const [state, setState] = useState<CsvImportState>({ phase: "idle" });

  /**
   * Build preview: match exercises, compute overlap warning, advance to preview.
   * Declared before the callbacks that call it to satisfy react-hooks/immutability.
   * @param parsed - raw parse result (weights not yet converted)
   * @param chosenUnit - the unit to convert from (or "kg" for no-op)
   */
  const buildPreview = useCallback(async (parsed: CsvParseResult, chosenUnit: WeightUnit) => {
    setState({ phase: "matching", parsed, chosenUnit });

    // Convert weights EXACTLY ONCE — never re-convert in the preview stat pass
    const sessions: ImportedSession[] =
      chosenUnit === "lbs"
        ? convertWeights(parsed.sessions, "lbs")
        : parsed.sessions;

    // Match exercises against the DB library
    const exercises = await getAllExercises();
    const matches = matchAllExercises(parsed.uniqueExercises, exercises);
    // CRITICAL: pass matches straight through — do NOT re-key or rebuild the Map

    // Path B overlap check: read-only, no engine dedupe
    const overlapWarning = await checkDateOverlap(sessions);

    setState({
      phase: "preview",
      parsed,
      sessions,
      matches,
      chosenUnit,
      overlapWarning,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Entry point: parse raw CSV text and advance the state machine.
   * - If detectedUnit===null → unit_selection phase
   * - Else → skip to matching/preview
   */
  const parseCsv = useCallback(async (rawCsv: string) => {
    setState({ phase: "parsing" });

    const parsed = parseCsvExport(rawCsv);
    if ("type" in parsed) {
      setState({ phase: "error", error: parsed });
      return;
    }

    if (parsed.detectedUnit === null) {
      // Ambiguous units — need user confirmation before we can match
      setState({ phase: "unit_selection", parsed });
    } else {
      // Unit detected — proceed straight to matching
      const chosenUnit: WeightUnit = parsed.detectedUnit === "lbs" ? "lbs" : "kg";
      await buildPreview(parsed, chosenUnit);
    }
  }, [buildPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Called from unit selection screen once the user picks kg or lbs.
   */
  const confirmUnit = useCallback(
    async (unit: WeightUnit) => {
      if (state.phase !== "unit_selection") return;
      setState({ phase: "matching", parsed: state.parsed, chosenUnit: unit });
      await buildPreview(state.parsed, unit);
    },
    [state, buildPreview], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /**
   * Perform the actual import — calls importCsvSessions with the matcher output
   * passed straight through.
   * On rejection, restores state to `preview` so the user can retry or dismiss.
   */
  const startImport = useCallback(async () => {
    if (state.phase !== "preview") return;
    // Capture preview state so we can restore it if the import is rejected
    const previewSnapshot = state;
    const { sessions, matches } = previewSnapshot;

    setState({
      phase: "importing",
      progress: { current: 0, total: sessions.length, phase: "inserting" },
    });

    try {
      const result = await importCsvSessions(
        sessions,
        matches, // passed straight through — do NOT re-key
        (progress) => {
          setState({ phase: "importing", progress });
        },
      );
      setState({ phase: "done", result });
    } catch (err) {
      // Restore to preview so the user has a recovery path (retry or dismiss)
      setState(previewSnapshot);
      throw err;
    }
  }, [state]);

  const reset = useCallback(() => {
    setState({ phase: "idle" });
  }, []);

  return { state, parseCsv, confirmUnit, startImport, reset };
}

// ---- Read-only overlap check (Path B) ----
// No engine changes — SELECT only

type OverlapWarning = { minDate: Date; maxDate: Date } | null;

async function checkDateOverlap(sessions: ImportedSession[]): Promise<OverlapWarning> {
  if (sessions.length === 0) return null;
  const timestamps = sessions.map((s) => s.date);
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt
       FROM workout_sessions
       WHERE import_batch_id IS NOT NULL
         AND started_at >= ?
         AND started_at <= ?`,
      [minTs, maxTs],
    );
    if ((row?.cnt ?? 0) > 0) {
      return { minDate: new Date(minTs), maxDate: new Date(maxTs) };
    }
  } catch {
    // Non-critical: if the check fails, suppress the warning rather than blocking
  }
  return null;
}
