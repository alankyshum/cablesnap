import { useCallback, useEffect, useMemo, useRef } from "react";
import { BackHandler, Pressable, Share, StyleSheet, TextInput, View, FlatList } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../../lib/layout";
import { toDisplay } from "../../../lib/units";
import { formatTime } from "../../../lib/format";
import { durationSpoken } from "../../../lib/session-display";
import { useSummaryData } from "../../../hooks/useSummaryData";
import { useSummaryActions } from "../../../hooks/useSummaryActions";
import RatingWidget from "../../../components/RatingWidget";
import ShareSheet from "../../../components/ShareSheet";
import AchievementsCard from "../../../components/session/summary/AchievementsCard";
import PRsCard from "../../../components/session/summary/PRsCard";
import WeightIncreasesCard from "../../../components/session/summary/WeightIncreasesCard";
import ComparisonCard from "../../../components/session/summary/ComparisonCard";
import SetsCard from "../../../components/session/summary/SetsCard";
import MusclesWorkedCard from "../../../components/session/summary/MusclesWorkedCard";
import SummaryFooter from "../../../components/session/summary/SummaryFooter";
import type { ShareCardExercise, ShareCardPR } from "../../../components/ShareCard";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

export default function Summary() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Intercept Android hardware back so post-workout summary always routes through
  // the same "Done" flow (tabs root) rather than going back into the live session
  // screen, which could confuse users or lose context (BLD-509).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        router.replace("/(tabs)");
        return true;
      });
      return () => sub.remove();
    }, [router])
  );

  const data = useSummaryData(id);
  const { session, completed, grouped, prs, repPrs, increases, comparison, unit, volume, setsBreakdown, newAchievements, completedSetCount, primaryMuscles, secondaryMuscles } = data;
  const actions = useSummaryActions(id);

  // Sync rating/notes when session loads
  const sessionRef = useRef(session);
  useEffect(() => {
    if (session && session !== sessionRef.current) {
      sessionRef.current = session;
      actions.setRating(session.rating ?? null);
      actions.setNotesText(session.notes ?? "");
      actions.setNotesExpanded(!!(session.notes && session.notes.length > 0));
    }
  }, [session, actions]);

  const duration = session?.duration_seconds ? formatTime(session.duration_seconds) : "0:00";
  const volumeDisplay = toDisplay(volume, unit);

  const sessionStartedAt = session?.started_at;
  const shareCardDate = useMemo(() => {
    if (!sessionStartedAt) return "";
    return new Date(sessionStartedAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }, [sessionStartedAt]);

  const shareCardPrs = useMemo((): ShareCardPR[] => {
    const items: ShareCardPR[] = prs.map((pr) => ({ name: pr.name, value: `${toDisplay(pr.weight, unit)} ${unit}` }));
    for (const pr of repPrs) items.push({ name: pr.name, value: `${pr.reps} reps` });
    return items;
  }, [prs, repPrs, unit]);

  const shareCardExercises = useMemo((): ShareCardExercise[] => {
    return grouped.map((g) => {
      const maxWeight = Math.max(...g.sets.map((s) => s.weight ?? 0));
      const typicalReps = g.sets.length > 0 ? (g.sets[0].reps ?? 0) : 0;
      return { name: g.name, sets: g.sets.length, reps: String(typicalReps), weight: maxWeight > 0 ? `${toDisplay(maxWeight, unit)} ${unit}` : undefined };
    });
  }, [grouped, unit]);

  const share = async () => {
    const lines = [`🏋️ ${session?.name ?? "Workout"} Complete!`, `Duration: ${duration}`, `Sets: ${completed.length}`, `Volume: ${volumeDisplay.toLocaleString()} ${unit}`];
    if (prs.length > 0) { lines.push("", "🏆 New PRs:"); for (const pr of prs) lines.push(`  ${pr.name}: ${toDisplay(pr.weight, unit)} ${unit}`); }
    if (repPrs.length > 0) { if (prs.length === 0) lines.push("", "🏆 New PRs:"); for (const pr of repPrs) lines.push(`  ${pr.name}: ${pr.reps} reps`); }
    try { await Share.share({ message: lines.join("\n") }); } catch { /* cancelled */ }
  };

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Summary" }} />
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <Text style={{ color: colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const allPrs = [...prs, ...repPrs];
  const listData = [
    ...(newAchievements.length > 0 ? [{ key: "achievements" }] : []),
    ...(allPrs.length > 0 ? [{ key: "prs" }] : []),
    ...(increases.length > 0 ? [{ key: "increases" }] : []),
    ...(comparison?.previous ? [{ key: "comparison" }] : []),
    ...((primaryMuscles.length > 0 || secondaryMuscles.length > 0) ? [{ key: "muscles" }] : []),
    ...(grouped.length > 0 ? [{ key: "sets" }] : []),
  ] as { key: string }[];

  return (
    <>
      <Stack.Screen options={{ title: "Workout Complete!" }} />
      <FlatList
        data={listData}
        keyExtractor={(s) => s.key}
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        ListHeaderComponent={
          <SummaryHeader
            colors={colors}
            session={session}
            duration={duration}
            durationSpokenText={durationSpoken(session.duration_seconds)}
            completedCount={completed.length}
            setsBreakdown={setsBreakdown}
            volumeDisplay={volumeDisplay}
            unit={unit}
            rating={actions.rating}
            onRatingChange={actions.handleRatingChange}
            notesExpanded={actions.notesExpanded}
            setNotesExpanded={actions.setNotesExpanded}
            notesText={actions.notesText}
            setNotesText={actions.setNotesText}
            onNotesSave={actions.handleNotesSave}
          />
        }
        renderItem={({ item }) => {
          if (item.key === "achievements") return <AchievementsCard achievements={newAchievements} colors={colors} />;
          if (item.key === "prs") return <PRsCard prs={prs} repPrs={repPrs} unit={unit} colors={colors} />;
          if (item.key === "increases") return <WeightIncreasesCard increases={increases} unit={unit} colors={colors} />;
          if (item.key === "comparison" && comparison?.previous) return <ComparisonCard comparison={comparison} colors={colors} />;
          if (item.key === "muscles") return <MusclesWorkedCard primaryMuscles={primaryMuscles} secondaryMuscles={secondaryMuscles} colors={colors} />;
          if (item.key === "sets") return <SetsCard grouped={grouped} colors={colors} />;
          return null;
        }}
        ListFooterComponent={
          <SummaryFooter
            colors={colors}
            session={session}
            completedSetCount={completedSetCount}
            templateModalVisible={actions.templateModalVisible}
            setTemplateModalVisible={actions.setTemplateModalVisible}
            templateName={actions.templateName}
            setTemplateName={actions.setTemplateName}
            saving={actions.saving}
            handleSaveAsTemplate={actions.handleSaveAsTemplate}
            onDone={() => router.replace("/(tabs)")}
            onViewDetails={() => router.replace(`/session/detail/${id}`)}
            onSharePress={actions.handleShareButtonPress}
            previewVisible={actions.previewVisible}
            setPreviewVisible={actions.setPreviewVisible}
            imageLoading={actions.imageLoading}
            setImageLoading={actions.setImageLoading}
            shareCardRef={actions.shareCardRef}
            handleCaptureAndShare={actions.handleCaptureAndShare}
            shareCardDate={shareCardDate}
            duration={duration}
            completedCount={completed.length}
            volumeDisplay={volumeDisplay.toLocaleString()}
            unit={unit}
            rating={actions.rating}
            shareCardPrs={shareCardPrs}
            shareCardExercises={shareCardExercises}
          />
        }
      />
      <ShareSheet
        sheetRef={actions.shareSheetRef}
        onShareText={share}
        onShareImage={actions.handleShareImage}
        imageDisabled={completedSetCount === 0}
        onDismiss={() => {}}
      />
    </>
  );
}

/* ── Header sub-component ── */

function SummaryHeader({ colors, session, duration, durationSpokenText, completedCount, setsBreakdown, volumeDisplay, unit, rating, onRatingChange, notesExpanded, setNotesExpanded, notesText, setNotesText, onNotesSave }: {
  colors: ReturnType<typeof useThemeColors>;
  session: { completed_at?: number | null; name?: string | null; duration_seconds?: number | null };
  duration: string;
  durationSpokenText: string;
  completedCount: number;
  setsBreakdown: string;
  volumeDisplay: number;
  unit: string;
  rating: number | null;
  onRatingChange: (r: number | null) => void;
  notesExpanded: boolean;
  setNotesExpanded: (v: boolean) => void;
  notesText: string;
  setNotesText: (v: string) => void;
  onNotesSave: () => void;
}) {
  return (
    <>
      <View style={styles.header}>
        <MaterialCommunityIcons name="check-circle" size={48} color={colors.primary} />
        <Text variant="heading" style={[styles.title, { color: colors.onBackground }]} accessibilityRole="header">Workout Complete!</Text>
        <Text variant="body" style={{ color: colors.onSurfaceVariant }} numberOfLines={1} ellipsizeMode="tail">{session.name}</Text>
      </View>
      <View style={styles.stats}>
        <Card style={StyleSheet.flatten([styles.stat, { backgroundColor: colors.surface }])} accessibilityLabel={`Duration: ${durationSpokenText}`}>
          <CardContent style={styles.statInner}>
            <Text variant="heading" style={{ color: colors.primary }}>{duration}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Duration</Text>
          </CardContent>
        </Card>
        <Card style={StyleSheet.flatten([styles.stat, { backgroundColor: colors.surface }])} accessibilityLabel={setsBreakdown ? `${completedCount} sets: ${setsBreakdown}` : `${completedCount} sets completed`}>
          <CardContent style={styles.statInner}>
            <Text variant="heading" style={{ color: colors.primary }}>{completedCount}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{setsBreakdown ? `Sets (${setsBreakdown})` : "Sets"}</Text>
          </CardContent>
        </Card>
        <Card style={StyleSheet.flatten([styles.stat, { backgroundColor: colors.surface }])} accessibilityLabel={`Total volume: ${volumeDisplay.toLocaleString()} ${unit}`}>
          <CardContent style={styles.statInner}>
            <Text variant="heading" style={{ color: colors.primary }}>{volumeDisplay.toLocaleString()}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Volume ({unit})</Text>
          </CardContent>
        </Card>
      </View>
      {session.completed_at && (
        <Card style={StyleSheet.flatten([styles.section, { backgroundColor: colors.surface }])}>
          <CardContent style={{ alignItems: "center" }}>
            <Text variant="title" style={{ color: colors.onSurface, marginBottom: 12, fontWeight: "600" }}>How was your workout?</Text>
            <RatingWidget value={rating} onChange={onRatingChange} size="large" />
          </CardContent>
        </Card>
      )}
      {session.completed_at && (
        <Card style={StyleSheet.flatten([styles.section, { backgroundColor: colors.surface }])}>
          <CardContent>
            <Pressable onPress={() => setNotesExpanded(!notesExpanded)} style={styles.notesHeader} accessibilityRole="button" accessibilityLabel="Session notes" accessibilityHint="Double tap to add notes about this workout" accessibilityState={{ expanded: notesExpanded }}>
              <MaterialCommunityIcons name="note-edit-outline" size={20} color={colors.primary} />
              <Text variant="subtitle" style={{ color: colors.onSurface, marginLeft: 8, flex: 1 }}>Session notes</Text>
              <MaterialCommunityIcons name={notesExpanded ? "chevron-up" : "chevron-down"} size={20} color={colors.onSurfaceVariant} />
            </Pressable>
            {notesExpanded && (
              <View style={{ marginTop: 8 }}>
                <TextInput value={notesText} onChangeText={(t) => setNotesText(t.slice(0, 500))} onBlur={onNotesSave} placeholder="Add notes about this workout..." placeholderTextColor={colors.onSurfaceDisabled} multiline maxLength={500} style={[styles.notesInput, { color: colors.onSurface, backgroundColor: colors.surfaceVariant, borderColor: colors.outline }]} accessibilityLabel="Session notes" />
                <Text variant="caption" style={{ color: colors.onSurfaceVariant, textAlign: "right", marginTop: 4 }}>{notesText.length}/500</Text>
              </View>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { alignItems: "center", marginBottom: 24, paddingTop: 8 },
  title: { fontWeight: "700", marginTop: 8, marginBottom: 4 },
  stats: { flexDirection: "row", gap: 8, marginBottom: 16 },
  stat: { flex: 1 },
  statInner: { alignItems: "center", paddingVertical: 8 },
  section: { marginBottom: 16 },
  notesHeader: { flexDirection: "row", alignItems: "center", minHeight: 48 },
  notesInput: { borderWidth: 1, borderRadius: 8, padding: 12, minHeight: 80, textAlignVertical: "top", fontSize: fontSizes.sm },
});
