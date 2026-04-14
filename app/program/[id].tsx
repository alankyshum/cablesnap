import { useCallback, useState } from "react";
import {
  Alert,
  StyleSheet,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import {
  Button,
  Card,
  Chip,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import {
  getProgramById,
  getProgramDays,
  getProgramCycleCount,
  getProgramHistory,
  activateProgram,
  deactivateProgram,
  softDeleteProgram,
  removeProgramDay,
  reorderProgramDays,
} from "../../lib/programs";
import { duplicateProgram } from "../../lib/db";
import type { Program, ProgramDay } from "../../lib/types";

export default function ProgramDetail() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [program, setProgram] = useState<Program | null>(null);
  const [days, setDays] = useState<ProgramDay[]>([]);
  const [cycle, setCycle] = useState(0);
  const [history, setHistory] = useState<{ session_id: string; day_label: string; template_name: string | null; completed_at: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [prog, d, c, h] = await Promise.all([
        getProgramById(id),
        getProgramDays(id),
        getProgramCycleCount(id),
        getProgramHistory(id, 10),
      ]);
      setProgram(prog);
      setDays(d);
      setCycle(c);
      setHistory(h);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggle = async () => {
    if (!program) return;
    try {
      setLoading(true);
      if (program.is_active) {
        await deactivateProgram(program.id);
      } else {
        if (days.length === 0) {
          Alert.alert("Cannot Activate", "Add at least one day to this program.");
          return;
        }
        await activateProgram(program.id);
      }
      await load();
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = () => {
    if (!program) return;
    Alert.alert(
      "Delete Program",
      `Delete "${program.name}"? Past workout data will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await softDeleteProgram(program.id);
            router.back();
          },
        },
      ]
    );
  };

  const remove = async (dayId: string) => {
    await removeProgramDay(dayId);
    await load();
  };

  const move = async (index: number, dir: -1 | 1) => {
    if (!program) return;
    const target = index + dir;
    if (target < 0 || target >= days.length) return;
    const ids = days.map((d) => d.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await reorderProgramDays(program.id, ids);
    await load();
  };

  const dateStr = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const dayName = (day: ProgramDay) =>
    day.label || day.template_name || "Deleted Template";

  if (!program) {
    return (
      <>
        <Stack.Screen options={{ title: "Program" }} />
        <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>Loading...</Text>
        </View>
      </>
    );
  }

  const currentIdx = days.findIndex((d) => d.id === program.current_day_id);
  const starter = program.is_starter;

  const handleDuplicate = async () => {
    const newId = await duplicateProgram(program.id);
    router.replace(`/program/${newId}`);
  };

  return (
    <>
      <Stack.Screen options={{ title: program.name }} />
      <FlashList
        style={StyleSheet.flatten([styles.container, { backgroundColor: theme.colors.background }])}
        data={days}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <>
            {starter && (
              <Chip
                mode="flat"
                compact
                style={styles.starterChip}
                accessibilityLabel="Starter program, read-only. Duplicate to edit."
              >
                STARTER
              </Chip>
            )}

            {program.description ? (
              <Text
                variant="bodyMedium"
                style={[styles.desc, { color: theme.colors.onSurfaceVariant }]}
              >
                {program.description}
              </Text>
            ) : null}

            <View style={styles.meta}>
              <Text variant="bodyMedium" style={{ color: theme.colors.onBackground }}>
                {days.length} day{days.length !== 1 ? "s" : ""} · {cycle} cycle{cycle !== 1 ? "s" : ""} completed
              </Text>
              {program.is_active && currentIdx >= 0 && (
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.primary, fontWeight: "600" }}
                  accessibilityLabel={`Currently on day ${currentIdx + 1} of ${days.length}: ${dayName(days[currentIdx])}`}
                >
                  Current: Day {currentIdx + 1} — {dayName(days[currentIdx])}
                </Text>
              )}
            </View>

            {starter ? (
              <View style={styles.actions}>
                <Button
                  mode={program.is_active ? "outlined" : "contained"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? "Deactivate program" : "Set program as active"}
                >
                  {program.is_active ? "Deactivate" : "Set Active"}
                </Button>
                <Button
                  mode="outlined"
                  icon="content-copy"
                  onPress={handleDuplicate}
                  style={styles.actionBtn}
                  accessibilityLabel="Duplicate to edit"
                >
                  Duplicate to Edit
                </Button>
              </View>
            ) : (
              <View style={styles.actions}>
                <Button
                  mode={program.is_active ? "outlined" : "contained"}
                  onPress={toggle}
                  disabled={loading}
                  style={styles.actionBtn}
                  accessibilityLabel={program.is_active ? "Deactivate program" : "Set program as active"}
                >
                  {program.is_active ? "Deactivate" : "Set Active"}
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => router.push(`/program/create?programId=${program.id}`)}
                  style={styles.actionBtn}
                  accessibilityLabel="Edit program"
                >
                  Edit
                </Button>
                <IconButton
                  icon="delete"
                  onPress={confirmDelete}
                  accessibilityLabel="Delete program"
                />
              </View>
            )}

            <View style={styles.sectionHeader}>
              <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
                Workout Days ({days.length})
              </Text>
              {!starter && (
                <Button
                  mode="text"
                  icon="plus"
                  compact
                  onPress={() => router.push(`/program/pick-template?programId=${program.id}`)}
                  accessibilityLabel="Add workout day"
                >
                  Add Day
                </Button>
              )}
            </View>
          </>
        }
        renderItem={({ item, index }: { item: ProgramDay; index: number }) => (
          <Card
            style={[
              styles.card,
              { backgroundColor: theme.colors.surface },
              item.id === program.current_day_id && {
                borderColor: theme.colors.primary,
                borderWidth: 2,
              },
            ]}
            accessibilityLabel={`Day ${index + 1}: ${dayName(item)}${item.id === program.current_day_id ? ", current day" : ""}`}
          >
            <Card.Content style={styles.cardContent}>
              <View style={styles.cardInfo}>
                <Text variant="titleSmall" style={{ color: theme.colors.onSurface }}>
                  Day {index + 1}: {dayName(item)}
                </Text>
                {item.template_id === null && (
                  <Text variant="bodySmall" style={{ color: theme.colors.error }}>
                    Deleted Template
                  </Text>
                )}
                {item.label && item.template_name && item.label !== item.template_name && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.template_name}
                  </Text>
                )}
              </View>
              {!starter && (
                <View style={styles.cardActions}>
                  <IconButton
                    icon="arrow-up"
                    size={18}
                    onPress={() => move(index, -1)}
                    disabled={index === 0}
                    accessibilityLabel={`Move ${dayName(item)} up`}
                    accessibilityHint="Reorders workout day"
                  />
                  <IconButton
                    icon="arrow-down"
                    size={18}
                    onPress={() => move(index, 1)}
                    disabled={index === days.length - 1}
                    accessibilityLabel={`Move ${dayName(item)} down`}
                    accessibilityHint="Reorders workout day"
                  />
                  <IconButton
                    icon="close"
                  size={18}
                  onPress={() => remove(item.id)}
                  accessibilityLabel={`Remove ${dayName(item)}`}
                />
              </View>
              )}
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
              accessibilityRole="text"
              accessibilityLabel="No workout days added yet"
            >
              No workout days yet. Add templates above.
            </Text>
          </View>
        }
        ListFooterComponent={
          history.length > 0 ? (
            <View style={styles.history}>
              <Text variant="titleMedium" style={[styles.historyTitle, { color: theme.colors.onBackground }]}>
                History
              </Text>
              {history.map((h) => (
                <Card
                  key={h.session_id}
                  style={[styles.historyCard, { backgroundColor: theme.colors.surface }]}
                  onPress={() => router.push(`/session/detail/${h.session_id}`)}
                  accessibilityLabel={`Completed ${h.day_label || h.template_name || "workout"} on ${dateStr(h.completed_at)}`}
                  accessibilityRole="button"
                >
                  <Card.Content style={styles.historyRow}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
                      {h.day_label || h.template_name || "Workout"}
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {dateStr(h.completed_at)}
                    </Text>
                  </Card.Content>
                </Card>
              ))}
            </View>
          ) : null
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
    paddingBottom: 48,
  },
  desc: {
    marginBottom: 12,
  },
  starterChip: {
    alignSelf: "flex-start",
    marginBottom: 12,
  },
  meta: {
    marginBottom: 16,
    gap: 4,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  actionBtn: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  card: {
    marginBottom: 8,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardInfo: {
    flex: 1,
  },
  cardActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 24,
  },
  history: {
    marginTop: 24,
  },
  historyTitle: {
    marginBottom: 8,
  },
  historyCard: {
    marginBottom: 4,
    minHeight: 48,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
  },
});
