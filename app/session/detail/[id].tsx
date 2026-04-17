import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button, Card, Divider, IconButton, Snackbar, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useLayout } from "../../../lib/layout";
import {
  createTemplateFromSession,
  getActiveSession,
  getSessionById,
  getSessionPRs,
  getSessionSetCount,
  getSessionSets,
  startSession,
  updateSession,
} from "../../../lib/db";
import type { WorkoutSession, WorkoutSet } from "../../../lib/types";
import { TRAINING_MODE_LABELS, SET_TYPE_LABELS } from "../../../lib/types";
import { rpeColor, rpeText } from "../../../lib/rpe";
import { formatDuration, formatDateShort } from "../../../lib/format";
import RatingWidget from "../../../components/RatingWidget";

type SetWithName = WorkoutSet & { exercise_name?: string; exercise_deleted?: boolean; swapped_from_name?: string };

type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithName[];
  link_id: string | null;
  swapped_from_name: string | null;
};

export default function SessionDetail() {
  const theme = useTheme();
  const layout = useLayout();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [prs, setPrs] = useState<{ exercise_id: string; name: string; weight: number; previous_max: number }[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [snackbar, setSnackbar] = useState<{ message: string; action?: { label: string; onPress: () => void } } | null>(null);
  const [completedSetCount, setCompletedSetCount] = useState(0);
  const [saving, setSaving] = useState(false);

  const linkIds = useMemo(() => {
    const ids: string[] = [];
    for (const g of groups) {
      if (g.link_id && !ids.includes(g.link_id)) ids.push(g.link_id);
    }
    return ids;
  }, [groups]);

  const palette = useMemo(
    () => [theme.colors.tertiary, theme.colors.secondary, theme.colors.primary, theme.colors.error, theme.colors.inversePrimary],
    [theme],
  );

  useEffect(() => {
    if (!id) return;
    (async () => {
      const sess = await getSessionById(id);
      if (!sess) return;
      setSession(sess);
      setRating(sess.rating ?? null);
      setNotesText(sess.notes ?? "");
      setNotesExpanded(!!(sess.notes && sess.notes.length > 0));

      const [sets, prData, setCount] = await Promise.all([
        getSessionSets(id),
        getSessionPRs(id),
        getSessionSetCount(id),
      ]);
      setPrs(prData);
      setCompletedSetCount(setCount);
      const map = new Map<string, ExerciseGroup>();
      for (const s of sets) {
        if (!map.has(s.exercise_id)) {
          map.set(s.exercise_id, {
            exercise_id: s.exercise_id,
            name: (s.exercise_name ?? "Unknown") + (s.exercise_deleted ? " (removed)" : ""),
            sets: [],
            link_id: s.link_id ?? null,
            swapped_from_name: (s as SetWithName).swapped_from_name ?? null,
          });
        }
        map.get(s.exercise_id)!.sets.push(s);
      }
      setGroups([...map.values()]);
    })();
  }, [id]);

  const volume = () => {
    let total = 0;
    for (const g of groups) {
      for (const s of g.sets) {
        if (s.completed && s.weight && s.reps) {
          total += s.weight * s.reps;
        }
      }
    }
    return total;
  };

  const completedSets = () => {
    let count = 0;
    for (const g of groups) {
      for (const s of g.sets) {
        if (s.completed) count++;
      }
    }
    return count;
  };

  const handleRatingChange = useCallback(async (newRating: number | null) => {
    if (!id) return;
    const previousRating = rating;
    setRating(newRating);
    try {
      await updateSession(id, { rating: newRating });
    } catch {
      setRating(previousRating);
      setSnackbar({ message: "Failed to save rating" });
    }
  }, [id, rating]);

  const handleNotesSave = useCallback(async () => {
    if (!id) return;
    try {
      await updateSession(id, { notes: notesText });
    } catch {
      setSnackbar({ message: "Failed to save notes" });
    }
  }, [id, notesText]);

  const handleSaveAsTemplate = useCallback(async () => {
    if (!id || saving) return;
    setSaving(true);
    try {
      const truncatedName = templateName.slice(0, 100).trim() || "Untitled Template";
      const newId = await createTemplateFromSession(id, truncatedName);
      setTemplateModalVisible(false);
      setSnackbar({
        message: "Template saved!",
        action: {
          label: "View",
          onPress: () => router.push(`/template/${newId}`),
        },
      });
    } catch {
      setSnackbar({ message: "Failed to save template" });
    } finally {
      setSaving(false);
    }
  }, [id, templateName, saving, router]);

  const handleRepeatWorkout = useCallback(() => {
    if (!id || !session) return;
    const doRepeat = async () => {
      try {
        const active = await getActiveSession();
        if (active) {
          Alert.alert(
            "Active Workout",
            "You have an active workout. Finish or cancel it first."
          );
          return;
        }
        const newSession = await startSession(null, session.name);
        router.push(`/session/${newSession.id}?sourceSessionId=${id}`);
      } catch {
        setSnackbar({ message: "Failed to start repeated workout" });
      }
    };

    Alert.alert(
      "Repeat Workout?",
      `Start a new session with the same exercises and target weights from ${session.name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Repeat", style: "default", onPress: doRepeat },
      ]
    );
  }, [id, session, router]);

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: "Workout" }} />
        <View
          style={[
            styles.center,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            Loading...
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: session.name,
          headerRight: session.completed_at
            ? () => (
                <IconButton
                  icon="content-save-outline"
                  onPress={() => {
                    setTemplateName((session.name ?? "").slice(0, 100));
                    setTemplateModalVisible(true);
                  }}
                  disabled={completedSetCount === 0}
                  accessibilityLabel="Save as template"
                  accessibilityHint={completedSetCount === 0 ? "No exercises to save" : "Save this workout as a reusable template"}
                />
              )
            : undefined,
        }}
      />
      <FlashList
        data={groups}
        keyExtractor={(group) => group.exercise_id}
        style={StyleSheet.flatten([styles.container, { backgroundColor: theme.colors.background }])}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding, paddingVertical: 16, paddingBottom: 48 }}
        ListHeaderComponent={
          <>
            {/* Summary */}
            <Card
              style={[styles.summary, { backgroundColor: theme.colors.surface }]}
            >
              <Card.Content>
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  {formatDateShort(session.started_at)}
                </Text>
                <View style={styles.stats}>
                  <View style={styles.stat}>
                    <Text
                      variant="headlineSmall"
                      style={{ color: theme.colors.primary }}
                    >
                      {formatDuration(session.duration_seconds)}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Duration
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text
                      variant="headlineSmall"
                      style={{ color: theme.colors.primary }}
                    >
                      {completedSets()}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Sets
                    </Text>
                  </View>
                  <View style={styles.stat}>
                    <Text
                      variant="headlineSmall"
                      style={{ color: theme.colors.primary }}
                    >
                      {volume().toLocaleString()}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Volume
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>

            {/* Rating & Notes */}
            {session.completed_at && (
              <Card style={[styles.summary, { backgroundColor: theme.colors.surface }]}>
                <Card.Content style={{ alignItems: "center" }}>
                  <Text
                    variant="titleSmall"
                    style={{ color: theme.colors.onSurface, marginBottom: 8 }}
                  >
                    Rating
                  </Text>
                  <RatingWidget value={rating} onChange={handleRatingChange} />
                </Card.Content>
              </Card>
            )}

            {session.completed_at && (
              <Card style={[styles.summary, { backgroundColor: theme.colors.surface }]}>
                <Card.Content>
                  <Pressable
                    onPress={() => setNotesExpanded(!notesExpanded)}
                    style={styles.notesHeader}
                    accessibilityRole="button"
                    accessibilityLabel="Session notes"
                    accessibilityState={{ expanded: notesExpanded }}
                  >
                    <MaterialCommunityIcons
                      name="note-edit-outline"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text
                      variant="titleSmall"
                      style={{ color: theme.colors.onSurface, marginLeft: 8, flex: 1 }}
                    >
                      Session notes
                    </Text>
                    <MaterialCommunityIcons
                      name={notesExpanded ? "chevron-up" : "chevron-down"}
                      size={20}
                      color={theme.colors.onSurfaceVariant}
                    />
                  </Pressable>
                  {notesExpanded && (
                    <View style={{ marginTop: 8 }}>
                      <TextInput
                        value={notesText}
                        onChangeText={(t) => setNotesText(t.slice(0, 500))}
                        onBlur={handleNotesSave}
                        placeholder="Add notes about this workout..."
                        placeholderTextColor={theme.colors.onSurfaceDisabled}
                        multiline
                        maxLength={500}
                        style={[
                          styles.notesInput,
                          {
                            color: theme.colors.onSurface,
                            backgroundColor: theme.colors.surfaceVariant,
                            borderColor: theme.colors.outline,
                          },
                        ]}
                        accessibilityLabel="Session notes"
                      />
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant, textAlign: "right", marginTop: 4 }}
                      >
                        {notesText.length}/500
                      </Text>
                    </View>
                  )}
                </Card.Content>
              </Card>
            )}

            {/* Personal Records */}
            {prs.length > 0 && (
              <Card
                style={[styles.prCard, { backgroundColor: theme.colors.tertiaryContainer }]}
                accessibilityLabel={`${prs.length} new personal record${prs.length > 1 ? "s" : ""} achieved in this workout`}
              >
                <Card.Content>
                  <View style={styles.prHeader}>
                    <MaterialCommunityIcons name="trophy" size={20} color={theme.colors.onTertiaryContainer} />
                    <Text
                      variant="titleMedium"
                      style={{ color: theme.colors.onTertiaryContainer, marginLeft: 8, fontWeight: "700" }}
                    >
                      {prs.length} New PR{prs.length > 1 ? "s" : ""}
                    </Text>
                  </View>
                  {prs.map((pr) => (
                    <View key={pr.exercise_id} style={styles.prRow}>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onTertiaryContainer, flex: 1 }}
                        accessibilityLabel={`New personal record: ${pr.name}, ${pr.previous_max} to ${pr.weight}`}
                      >
                        {pr.name}
                      </Text>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onTertiaryContainer }}
                      >
                        {pr.previous_max} → {pr.weight}
                      </Text>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            )}

            {/* Repeat Workout */}
            {session.completed_at && (
              <Button
                mode="outlined"
                icon={({ size, color }) => (
                  <MaterialCommunityIcons name="repeat" size={size} color={color} />
                )}
                onPress={handleRepeatWorkout}
                disabled={completedSetCount === 0}
                style={styles.repeatButton}
                contentStyle={{ paddingVertical: 8 }}
                accessibilityLabel="Repeat workout"
                accessibilityHint="Start a new session with the same exercises and weights"
                accessibilityRole="button"
              >
                Repeat Workout
              </Button>
            )}
          </>
        }
        renderItem={({ item: group }) => {
          const linked = group.link_id ? groups.filter((g) => g.link_id === group.link_id) : [];
          const isFirst = group.link_id ? linked[0]?.exercise_id === group.exercise_id : false;
          const isLast = group.link_id ? linked[linked.length - 1]?.exercise_id === group.exercise_id : false;
          const tag = group.link_id
            ? linked.length >= 3 ? "Circuit" : "Superset"
            : "";
          const groupColorIdx = group.link_id ? linkIds.indexOf(group.link_id) : -1;
          const groupColor = groupColorIdx >= 0 ? palette[groupColorIdx % palette.length] : undefined;

          return (
          <View style={styles.group}>
            {isFirst && group.link_id && (
              <View
                style={[styles.linkHeader, { borderLeftColor: groupColor }]}
                accessibilityLabel={`${tag}: ${linked.map((g) => g.name).join(" and ")}`}
              >
                <Text variant="labelMedium" style={{ color: groupColor, fontWeight: "700" }}>
                  {tag}
                </Text>
              </View>
            )}
            <View style={group.link_id ? { borderLeftWidth: 4, borderLeftColor: groupColor, paddingLeft: 8 } : undefined}>
            <Text
              variant="titleMedium"
              style={[styles.groupTitle, { color: theme.colors.primary }]}
            >
              {group.name}
            </Text>
            {group.swapped_from_name && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, fontStyle: "italic", marginBottom: 4, marginTop: -2 }}
                accessibilityLabel={`Swapped from ${group.swapped_from_name}`}
              >
                Swapped from {group.swapped_from_name}
              </Text>
            )}
            {group.sets
              .filter((s) => s.completed)
              .map((set) => (
                <View key={set.id}>
                  <View style={[styles.setRow, (() => {
                    const st = set.set_type ?? (set.is_warmup ? "warmup" : "normal");
                    if (st === "warmup") return { borderLeftWidth: 3, borderLeftColor: theme.colors.surfaceVariant, paddingLeft: 5 };
                    if (st === "dropset") return { borderLeftWidth: 3, borderLeftColor: theme.colors.tertiaryContainer, paddingLeft: 5 };
                    if (st === "failure") return { borderLeftWidth: 3, borderLeftColor: theme.colors.errorContainer, paddingLeft: 5 };
                    return {};
                  })()]}>
                    {(() => {
                      const st = set.set_type ?? (set.is_warmup ? "warmup" : "normal");
                      const label = SET_TYPE_LABELS[st];
                      if (label.short) {
                        const chipColors = st === "warmup"
                          ? { bg: theme.colors.surfaceVariant, fg: theme.colors.onSurfaceVariant }
                          : st === "dropset"
                          ? { bg: theme.colors.tertiaryContainer, fg: theme.colors.onTertiaryContainer }
                          : { bg: theme.colors.errorContainer, fg: theme.colors.onErrorContainer };
                        return (
                          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: chipColors.bg, justifyContent: "center", alignItems: "center", marginRight: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: chipColors.fg }}>{label.short}</Text>
                          </View>
                        );
                      }
                      return (
                        <Text
                          variant="bodyMedium"
                          style={[styles.setNum, { color: theme.colors.onSurface }]}
                        >
                          {set.round ? `R${set.round}` : `Set ${set.set_number}`}
                        </Text>
                      );
                    })()}
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurface }}
                    >
                      {set.weight ?? 0} × {set.reps ?? 0}
                    </Text>
                    {set.training_mode && set.training_mode !== "weight" && (
                      <View style={[styles.modeBadge, { backgroundColor: theme.colors.secondaryContainer }]}>
                        <Text style={{ color: theme.colors.onSecondaryContainer, fontSize: 12, fontWeight: "700" }}>
                          {TRAINING_MODE_LABELS[set.training_mode]?.short ?? set.training_mode}
                        </Text>
                      </View>
                    )}
                    {set.tempo && (
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}
                      >
                        ♩ {set.tempo}
                      </Text>
                    )}
                    {set.rpe != null && (
                      <View style={[styles.rpeBadge, { backgroundColor: rpeColor(set.rpe) }]}>
                        <Text style={{ color: rpeText(set.rpe), fontSize: 12, fontWeight: "600" }}>
                          RPE {set.rpe}
                        </Text>
                      </View>
                    )}
                  </View>
                  {set.notes ? (
                    <Text
                      variant="bodySmall"
                      style={[styles.setNote, { color: theme.colors.onSurfaceVariant }]}
                    >
                      {set.notes}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
            {isLast && group.link_id && (
              <View style={{ height: 4, backgroundColor: groupColor, borderRadius: 2 }} />
            )}
            <Divider style={styles.divider} />
          </View>
          );
        }}
        ListFooterComponent={
          <>
            {/* Save as Template Modal */}
            <Modal
              visible={templateModalVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setTemplateModalVisible(false)}
            >
              <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, { backgroundColor: theme.colors.surface }]}>
                  <Text
                    variant="titleMedium"
                    style={{ color: theme.colors.onSurface, marginBottom: 16 }}
                  >
                    Save as Template
                  </Text>
                  <TextInput
                    value={templateName}
                    onChangeText={(t) => setTemplateName(t.slice(0, 100))}
                    placeholder="Template name"
                    placeholderTextColor={theme.colors.onSurfaceDisabled}
                    maxLength={100}
                    style={[
                      styles.modalInput,
                      {
                        color: theme.colors.onSurface,
                        backgroundColor: theme.colors.surfaceVariant,
                        borderColor: theme.colors.outline,
                      },
                    ]}
                    autoFocus
                    accessibilityLabel="Template name"
                  />
                  <View style={styles.modalActions}>
                    <Button
                      mode="text"
                      onPress={() => setTemplateModalVisible(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      mode="contained"
                      onPress={handleSaveAsTemplate}
                      loading={saving}
                      disabled={saving || !templateName.trim()}
                      contentStyle={{ paddingVertical: 8 }}
                    >
                      Save
                    </Button>
                  </View>
                </View>
              </View>
            </Modal>

            {/* Snackbar */}
            <Snackbar
              visible={!!snackbar}
              onDismiss={() => setSnackbar(null)}
              duration={4000}
              action={snackbar?.action}
            >
              {snackbar?.message ?? ""}
            </Snackbar>
          </>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  summary: {
    marginBottom: 20,
  },
  prCard: {
    marginBottom: 20,
  },
  repeatButton: {
    marginBottom: 20,
  },
  prHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 12,
  },
  stat: {
    alignItems: "center",
  },
  group: {
    marginBottom: 8,
  },
  groupTitle: {
    marginBottom: 8,
    fontWeight: "700",
  },
  setRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  setNum: {
    width: 60,
  },
  rpeBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  modeBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  setNote: {
    fontStyle: "italic",
    paddingHorizontal: 8,
    paddingBottom: 4,
    fontSize: 12,
  },
  divider: {
    marginTop: 8,
    marginBottom: 12,
  },
  linkHeader: {
    borderLeftWidth: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 4,
  },
  notes: {
    marginTop: 8,
  },
  noteText: {
    marginTop: 4,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
});
