import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  View,
  type ListRenderItemInfo,
} from "react-native";
import {
  Button,
  Card,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { useFocusEffect, useRouter } from "expo-router";
import {
  deleteTemplate,
  getActiveSession,
  getRecentSessions,
  getSessionSetCount,
  getTemplateExerciseCount,
  getTemplates,
  startSession,
} from "../../lib/db";
import type { WorkoutSession, WorkoutTemplate } from "../../lib/types";

export default function Workouts() {
  const theme = useTheme();
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [setCounts2, setSetCounts] = useState<Record<string, number>>({});
  const [active, setActive] = useState<WorkoutSession | null>(null);

  const load = useCallback(async () => {
    const [tpls, sess, act] = await Promise.all([
      getTemplates(),
      getRecentSessions(5),
      getActiveSession(),
    ]);
    setTemplates(tpls);
    setSessions(sess);
    setActive(act);

    const c: Record<string, number> = {};
    for (const t of tpls) {
      c[t.id] = await getTemplateExerciseCount(t.id);
    }
    setCounts(c);

    const sc: Record<string, number> = {};
    for (const s of sess) {
      sc[s.id] = await getSessionSetCount(s.id);
    }
    setSetCounts(sc);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const quickStart = async () => {
    const session = await startSession(null, "Quick Workout");
    router.push(`/session/${session.id}`);
  };

  const startFromTemplate = async (tpl: WorkoutTemplate) => {
    const session = await startSession(tpl.id, tpl.name);
    router.push(`/session/${session.id}?templateId=${tpl.id}`);
  };

  const confirmDelete = (tpl: WorkoutTemplate) => {
    Alert.alert(
      "Delete Template",
      `Delete "${tpl.name}"? Past workout data will be preserved.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTemplate(tpl.id);
            await load();
          },
        },
      ]
    );
  };

  const duration = (seconds: number | null) => {
    if (!seconds) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const dateStr = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };

  return (
    <View
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Resume active session banner */}
      {active && (
        <Card
          style={[styles.banner, { backgroundColor: theme.colors.primaryContainer }]}
          onPress={() => router.push(`/session/${active.id}`)}
          accessibilityLabel={`Resume active workout: ${active.name}`}
          accessibilityRole="button"
        >
          <Card.Content>
            <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer }}>
              ⏱ Active Workout: {active.name}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
              Tap to resume
            </Text>
          </Card.Content>
        </Card>
      )}

      {/* Quick Start */}
      <Button
        mode="contained"
        icon="flash"
        onPress={quickStart}
        style={styles.quickStart}
        contentStyle={styles.quickStartContent}
        accessibilityLabel="Quick start workout"
      >
        Quick Start
      </Button>

      {/* Templates */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text variant="titleMedium" style={{ color: theme.colors.onBackground }}>
            My Templates
          </Text>
          <Button
            mode="text"
            icon="plus"
            compact
            onPress={() => router.push("/template/create")}
            accessibilityLabel="Create new template"
          >
            Create
          </Button>
        </View>
        {templates.length === 0 ? (
          <View style={styles.empty}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              Create your first workout template
            </Text>
            <Button
              mode="outlined"
              onPress={() => router.push("/template/create")}
              style={styles.emptyBtn}
              accessibilityLabel="Create your first template"
            >
              Create Template
            </Button>
          </View>
        ) : (
          <FlatList
            data={templates}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }: ListRenderItemInfo<WorkoutTemplate>) => (
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
                onPress={() => startFromTemplate(item)}
                onLongPress={() => confirmDelete(item)}
                accessibilityLabel={`Start workout from template: ${item.name}, ${counts[item.id] ?? 0} exercises`}
                accessibilityRole="button"
              >
                <Card.Content style={styles.cardContent}>
                  <View style={styles.cardInfo}>
                    <Text
                      variant="titleSmall"
                      style={{ color: theme.colors.onSurface }}
                    >
                      {item.name}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {counts[item.id] ?? 0} exercises
                    </Text>
                  </View>
                  <IconButton
                    icon="pencil"
                    size={20}
                    onPress={() => router.push(`/template/${item.id}`)}
                    accessibilityLabel={`Edit template ${item.name}`}
                  />
                </Card.Content>
              </Card>
            )}
          />
        )}
      </View>

      {/* Recent Workouts */}
      <View style={styles.section}>
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: theme.colors.onBackground }]}
        >
          Recent Workouts
        </Text>
        {sessions.length === 0 ? (
          <View style={styles.empty}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              No workouts yet. Start one above!
            </Text>
          </View>
        ) : (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }: ListRenderItemInfo<WorkoutSession>) => (
              <Card
                style={[styles.card, { backgroundColor: theme.colors.surface }]}
                onPress={() =>
                  router.push(`/session/detail/${item.id}`)
                }
                accessibilityLabel={`View workout: ${item.name}, ${dateStr(item.started_at)}, ${duration(item.duration_seconds)}, ${setCounts2[item.id] ?? 0} sets`}
                accessibilityRole="button"
              >
                <Card.Content>
                  <Text
                    variant="titleSmall"
                    style={{ color: theme.colors.onSurface }}
                  >
                    {item.name}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {dateStr(item.started_at)} · {duration(item.duration_seconds)} ·{" "}
                    {setCounts2[item.id] ?? 0} sets
                  </Text>
                </Card.Content>
              </Card>
            )}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  banner: {
    marginBottom: 12,
  },
  quickStart: {
    marginBottom: 20,
  },
  quickStartContent: {
    paddingVertical: 8,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  sectionTitle: {
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
  empty: {
    alignItems: "center",
    paddingVertical: 16,
  },
  emptyBtn: {
    marginTop: 8,
  },
});
