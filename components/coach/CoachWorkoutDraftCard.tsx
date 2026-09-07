import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Clock3, History, Play } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii, spacing } from "@/constants/design-tokens";
import { t } from "@/lib/i18n";
import { CoachDraftRevisionSheet } from "./CoachDraftRevisionSheet";
import { CoachWorkoutDraftReasons } from "./CoachWorkoutDraftReasons";

type Draft = { name?: string; estimatedMinutes?: number; targetMinutes?: number; exercises?: Array<{ exercise_id: string; name?: string; sets: number; reps?: number | string | null; rest_seconds?: number | null; restSeconds?: number | null; weight?: number | null; load?: { kind?: string; value?: number; instruction?: string } }> };
type RestoredDraft = { draft: Draft; revision: number; reasons?: unknown[] };
export function CoachWorkoutDraftCard({ draft, equipment = [], revision, reasons = [], revisions = [], onStart, onRestore }: {
  draft: Draft; equipment?: Array<{ label: string; confidence?: number; uncertainty?: string }>; revision: number; reasons?: unknown[];
  revisions?: Array<{ version: number; change_reason: string; created_at: number }>; onStart: () => Promise<void> | void; onRestore?: (version: number) => Promise<RestoredDraft | void> | RestoredDraft | void;
}) {
  const colors = useThemeColors(); const starting = useRef(false); const [historyOpen, setHistoryOpen] = useState(false); const [busy, setBusy] = useState(false); const [startError, setStartError] = useState<string | null>(null); const [shown, setShown] = useState<{ draft: Draft; revision: number; reasons: unknown[] }>({ draft, revision, reasons });
  const incomingKey = JSON.stringify({ draft, revision, reasons });
  const shownKey = useRef(incomingKey);
  useEffect(() => {
    if (busy || starting.current) return;
    if (shownKey.current === incomingKey) return;
    shownKey.current = incomingKey;
    setShown({ draft, revision, reasons });
  }, [incomingKey, busy, draft, revision, reasons]);
  const start = async () => { if (starting.current || busy) return; starting.current = true; setBusy(true); setStartError(null); try { await onStart(); } catch (error) { setStartError(error instanceof Error ? error.message : t({ id: "components.coach.startDraftError", message: "This workout could not be started. Please try again." })); } finally { starting.current = false; setBusy(false); } };
  return <View testID="coach-workout-draft-card" accessibilityRole="summary" style={[styles.card, { backgroundColor: colors.surfaceVariant, borderColor: colors.outlineVariant }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={shown.draft.name || t({ id: "components.coach.draftFallbackName", message: "Workout draft" })} accessibilityHint={t({ id: "components.coach.startDraftHint", message: "Creates one workout session and opens it" })} disabled={busy} onPress={() => void start()} style={styles.header}><View style={styles.titleCopy}><Text variant="title" style={{ color: colors.onSurface }}>{shown.draft.name || t({ id: "components.coach.draftFallbackName", message: "Workout draft" })}</Text><Text style={{ color: colors.onSurfaceVariant }}>{t({ id: "components.coach.draftSavedRevision", message: "Saved · revision {revision}" }, { revision: shown.revision })}</Text></View><Clock3 size={18} color={colors.primary} /><Text style={{ color: colors.onSurface }}>{shown.draft.estimatedMinutes ?? shown.draft.targetMinutes ?? "—"} min</Text></Pressable>
    <View accessibilityRole="list" style={styles.chips}>{equipment.map((item) => <View key={item.label} style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.outlineVariant }]}><Text style={{ color: colors.onSurface }}>{item.label}{item.confidence != null && item.confidence < 0.8 ? " · ?" : ""}</Text></View>)}</View>
    <View style={styles.exercises}>{(shown.draft.exercises ?? []).map((exercise) => <View key={exercise.exercise_id} style={styles.exercise}><Text style={[styles.exerciseName, { color: colors.onSurface }]}>{exercise.name || exercise.exercise_id}</Text><Text style={{ color: colors.onSurfaceVariant }}>{exercise.sets} × {exercise.reps ?? "—"} · {exercise.rest_seconds ?? exercise.restSeconds ?? "—"}s {exercise.weight != null ? `· ${exercise.weight}` : exercise.load?.kind === "conservative" ? `· ${t({ id: "components.coach.startLightGuidance", message: "Start light and adjust after a controlled first set" })}` : ""}</Text></View>)}</View>
    {startError && <Text accessibilityRole="alert" style={{ color: colors.error }}>{startError}</Text>}
    <View style={styles.actions}><Pressable testID="coach-workout-draft-start" accessibilityRole="button" accessibilityLabel={t({ id: "components.coach.startDraftA11y", message: "Start this workout" })} accessibilityHint={t({ id: "components.coach.startDraftHint", message: "Creates one workout session and opens it" })} disabled={busy} onPress={() => void start()} style={[styles.action, { backgroundColor: colors.primary }]}><Play size={16} color={colors.onPrimary} /><Text style={{ color: colors.onPrimary }}>{busy ? t({ id: "components.coach.startingDraft", message: "Starting…" }) : t({ id: "components.coach.startDraft", message: "Start workout" })}</Text></Pressable>{revisions.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel={t({ id: "components.coach.openRevisionHistoryA11y", message: "Open workout revision history" })} onPress={() => setHistoryOpen(true)} style={styles.secondary}><History size={16} color={colors.primary} /><Text style={{ color: colors.primary }}>{t({ id: "components.coach.revisionHistory", message: "History" })}</Text></Pressable>}</View>
    <CoachWorkoutDraftReasons reasons={shown.reasons ?? []} />
    <CoachDraftRevisionSheet visible={historyOpen} revisions={revisions} currentVersion={shown.revision} restoring={busy} onClose={() => setHistoryOpen(false)} onRestore={async (version) => { if (!onRestore) return; setBusy(true); setStartError(null); try { const restored = await onRestore(version); if (restored) setShown({ ...restored, reasons: restored.reasons ?? [] }); setHistoryOpen(false); } catch (error) { setStartError(error instanceof Error ? error.message : t({ id: "components.coach.restoreRevisionError", message: "This revision could not be restored. Please try again." })); } finally { setBusy(false); } }} />
  </View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: radii.lg, padding: spacing.md, gap: spacing.md, marginVertical: spacing.xs }, header: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, titleCopy: { flex: 1, gap: spacing.xs }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }, chip: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, exercises: { gap: spacing.sm }, exercise: { gap: spacing.xs }, exerciseName: { fontSize: fontSizes.sm, fontWeight: "700" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, action: { minHeight: 44, borderRadius: radii.pill, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.xs }, secondary: { minHeight: 44, paddingHorizontal: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs }, });
