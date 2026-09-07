import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import { initializeI18n } from "@/lib/i18n";
initializeI18n();
/**
 * BLD-1089: Read-only detail screen for a kind='day_session' workout_sessions row.
 * AC24 — never opens in the editable session UI; redirected here from /session/[id].
 */
import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useLayout } from "@/lib/layout";
import { getDatabase } from "@/lib/db/helpers";
import { useFloatingTabBarHeight } from "@/components/FloatingTabBar";

type SetRow = {
  id: string;
  reps: number | null;
  weight: number | null;
  completed_at: number | null;
  exercise_name: string;
};

type SessionMeta = {
  name: string;
  started_at: number;
  total_reps: number;
  set_count: number;
  exercise_name: string;
};

function formatTime(ms: number | null): string {
  if (!ms) return "--";
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function DaySessionDetail() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();
  const tabBarHeight = useFloatingTabBarHeight();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [sets, setSets] = useState<SetRow[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const db = await getDatabase();
      const session = await db.getFirstAsync<{
        name: string;
        started_at: number;
        day_session_exercise_id: string;
      }>(
        "SELECT name, started_at, day_session_exercise_id FROM workout_sessions WHERE id = ? AND kind = 'day_session'",
        [id]
      );

      if (!session) {
        router.back();
        return;
      }

      const exerciseRow = await db.getFirstAsync<{ name: string }>(
        "SELECT name FROM exercises WHERE id = ?",
        [session.day_session_exercise_id]
      );
      const exerciseName = exerciseRow?.name ?? t({ id: "daysession.id.deletedExercise", message: "Deleted Exercise" });

      const setRows = await db.getAllAsync<SetRow>(
        `SELECT ws.id, ws.reps, ws.weight, ws.completed_at, ? AS exercise_name
         FROM workout_sets ws
         WHERE ws.session_id = ? AND ws.completed = 1
         ORDER BY ws.completed_at ASC`,
        [exerciseName, id]
      );

      const totalReps = setRows.reduce((sum, s) => sum + (s.reps ?? 0), 0);

      setMeta({
        name: session.name,
        started_at: session.started_at,
        total_reps: totalReps,
        set_count: setRows.length,
        exercise_name: exerciseName,
      });
      setSets(setRows);
    })();
  }, [id, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: meta?.exercise_name ?? t({ id: "daysession.id.quickAddSets", message: "Quick-add sets" }),
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.onSurface,
        }}
      />
      {meta && (
        <View style={[styles.summary, { backgroundColor: colors.surfaceVariant }]}>
          <Text style={{ color: colors.onSurfaceVariant, fontSize: 13 }}>
            {new Date(meta.started_at).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          <Text variant="title" style={{ color: colors.onSurface, marginTop: 4 }}>
            {meta.exercise_name}
          </Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Text variant="title" style={{ color: colors.primary, fontSize: 28 }}>
                {meta.total_reps}
              </Text>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{t({ id: "daysession.id.str1", message: "total reps" })}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text variant="title" style={{ color: colors.primary, fontSize: 28 }}>
                {meta.set_count}
              </Text>
              <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>{t({ id: "daysession.id.str2", message: "sets" })}</Text>
            </View>
          </View>
        </View>
      )}
      <FlatList
        data={sets}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: layout.horizontalPadding,
          paddingTop: 16,
          paddingBottom: tabBarHeight + 16,
        }}
        renderItem={({ item, index }) => (
          <View style={[styles.setRow, { borderBottomColor: colors.outlineVariant }]}>
            <Text style={{ color: colors.onSurfaceVariant, width: 32 }}>#{index + 1}</Text>
            <Text style={{ color: colors.onSurface, flex: 1 }}>
              {i18n._({ id: "daysession.id.setSummary", message: "{reps} reps{hasWeight, select, true { @ {weight} kg} false {}}", values: { reps: item.reps ?? 0, hasWeight: !!item.weight, weight: item.weight ?? 0 } })}
            </Text>
            <Text style={{ color: colors.onSurfaceVariant, fontSize: 12 }}>
              {formatTime(item.completed_at)}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: colors.onSurfaceVariant, textAlign: "center", marginTop: 32 }}>{t({ id: "daysession.id.str3", message: "No sets logged" })}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  summary: {
    padding: 20,
    paddingBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 32,
    marginTop: 16,
  },
  summaryItem: {
    alignItems: "center",
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
});
