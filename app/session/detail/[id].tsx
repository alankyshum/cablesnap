import { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Card, Divider, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useLocalSearchParams } from "expo-router";
import { getSessionById, getSessionPRs, getSessionSets } from "../../../lib/db";
import type { WorkoutSession, WorkoutSet } from "../../../lib/types";
import { TRAINING_MODE_LABELS } from "../../../lib/types";
import { rpeColor, rpeText } from "../../../lib/rpe";
import { formatDuration, formatDateShort } from "../../../lib/format";

type SetWithName = WorkoutSet & { exercise_name?: string; exercise_deleted?: boolean };

type ExerciseGroup = {
  exercise_id: string;
  name: string;
  sets: SetWithName[];
  link_id: string | null;
};

export default function SessionDetail() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [groups, setGroups] = useState<ExerciseGroup[]>([]);
  const [prs, setPrs] = useState<{ exercise_id: string; name: string; weight: number; previous_max: number }[]>([]);

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

      const [sets, prData] = await Promise.all([
        getSessionSets(id),
        getSessionPRs(id),
      ]);
      setPrs(prData);
      const map = new Map<string, ExerciseGroup>();
      for (const s of sets) {
        if (!map.has(s.exercise_id)) {
          map.set(s.exercise_id, {
            exercise_id: s.exercise_id,
            name: (s.exercise_name ?? "Unknown") + (s.exercise_deleted ? " (removed)" : ""),
            sets: [],
            link_id: s.link_id ?? null,
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
      <Stack.Screen options={{ title: session.name }} />
      <FlatList
        data={groups}
        keyExtractor={(group) => group.exercise_id}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
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
            {group.sets
              .filter((s) => s.completed)
              .map((set) => (
                <View key={set.id}>
                  <View style={styles.setRow}>
                    <Text
                      variant="bodyMedium"
                      style={[styles.setNum, { color: theme.colors.onSurface }]}
                    >
                      {set.round ? `R${set.round}` : `Set ${set.set_number}`}
                    </Text>
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
          session.notes ? (
            <View style={styles.notes}>
              <Text
                variant="labelLarge"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                Notes
              </Text>
              <Text
                variant="bodyMedium"
                style={[styles.noteText, { color: theme.colors.onSurface }]}
              >
                {session.notes}
              </Text>
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
    paddingBottom: 32,
  },
  summary: {
    marginBottom: 20,
  },
  prCard: {
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
});
