import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import {
  getDaySessionDetails,
  getDayMuscleGroups,
  type DayDetail,
} from "@/lib/db/calendar";
import { formatDuration } from "@/lib/format";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  dateStr: string;
};

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "loaded"; sessions: DayDetail[]; muscles: string[] };

function useDayData(dateStr: string): LoadState {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [currentDate, setCurrentDate] = useState(dateStr);

  // Reset to loading when dateStr changes
  if (dateStr !== currentDate) {
    setCurrentDate(dateStr);
    setState({ status: "loading" });
  }

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [s, m] = await Promise.all([
          getDaySessionDetails(dateStr),
          getDayMuscleGroups(dateStr),
        ]);
        if (!cancelled) {
          setState({ status: "loaded", sessions: s, muscles: m });
        }
      } catch {
        if (!cancelled) {
          setState({ status: "error" });
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [dateStr]);

  return state;
}

export default function CalendarDayDetail({ dateStr }: Props) {
  const colors = useThemeColors();
  const state = useDayData(dateStr);

  const displayDate = formatDisplayDate(dateStr);

  if (state.status === "loading") {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.surface }]}
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  if (state.status === "error") {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.surface }]}
        accessibilityLiveRegion="polite"
      >
        <Text style={{ color: colors.error }}>
          Could not load workout details
        </Text>
      </View>
    );
  }

  const { sessions, muscles } = state;

  if (sessions.length === 0) {
    return (
      <View
        style={[styles.container, { backgroundColor: colors.surface }]}
        accessibilityLiveRegion="polite"
      >
        <Text variant="subtitle" style={{ color: colors.onSurface }}>
          {displayDate}
        </Text>
        <Text
          variant="caption"
          style={{ color: colors.onSurfaceVariant, marginTop: 4 }}
        >
          No workouts
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: colors.surface }]}
      accessibilityLiveRegion="polite"
    >
      <Text variant="subtitle" style={{ color: colors.onSurface }}>
        {displayDate}
      </Text>

      {sessions.map((session) => (
        <View key={session.id} style={styles.sessionRow}>
          <Text style={[styles.sessionName, { color: colors.onSurface }]}>
            {session.name}
          </Text>
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, marginTop: 2 }}
          >
            {formatDuration(session.duration_seconds)} · {session.exercise_count}{" "}
            exercise{session.exercise_count !== 1 ? "s" : ""} · {session.set_count}{" "}
            set{session.set_count !== 1 ? "s" : ""}
          </Text>
        </View>
      ))}

      {muscles.length > 0 && (
        <View style={styles.muscleRow}>
          <Text
            variant="caption"
            style={{ color: colors.primary, fontWeight: "600" }}
          >
            {muscles.join(", ")}
          </Text>
        </View>
      )}
    </View>
  );
}

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  sessionRow: {
    marginTop: 8,
  },
  sessionName: {
    fontSize: fontSizes.base,
    fontWeight: "600",
  },
  muscleRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128,128,128,0.2)",
  },
});
