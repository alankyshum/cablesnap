import { t } from "@lingui/core/macro";
import { Pressable, StyleSheet, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";

type TodaySchedule = { template_id: string; template_name: string; exercise_count: number } | null;
type AdherenceDay = { scheduled: boolean; completed: boolean };
type NextWorkout = {
  program: { name: string };
  day: { id: string; template_id?: string | null; template_name?: string | null; label?: string | null };
} | null;

type Props = {
  colors: ThemeColors;
  active: { id: string; name: string | null } | null;
  todaySchedule: TodaySchedule;
  todayDone: boolean;
  adherence: AdherenceDay[];
  nextWorkout: NextWorkout;
  onResumeSession: (id: string) => void;
  onStartFromSchedule: () => void;
  onStartNextWorkout: () => void;
};

/* eslint-disable complexity -- this component intentionally enumerates banner states. */
export default function HomeBanners({
  colors, active, todaySchedule, todayDone, adherence, nextWorkout,
  onResumeSession, onStartFromSchedule, onStartNextWorkout,
}: Props) {
  const hasSchedule = adherence.some((a) => a.scheduled);

  return (
    <>
      {active && (
        <Pressable
          style={[styles.banner, { backgroundColor: colors.primaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={() => onResumeSession(active.id)}
           accessibilityLabel={t({ id: "home.banners.resumeA11y", message: `Resume active workout: ${active.name}` })}
          accessibilityRole="button"
        >
           <Text variant="body" style={{ color: colors.onPrimaryContainer, fontWeight: "600" }}>{t({ id: "home.banners.active", message: `⏱ Active Workout: ${active.name}` })}</Text>
           <Text variant="caption" style={{ color: colors.onPrimaryContainer }}>{t({ id: "home.banners.tapResume", message: "Tap to resume" })}</Text>
        </Pressable>
      )}

      {todaySchedule && !todayDone && (
        <Pressable
          style={[styles.banner, { backgroundColor: colors.secondaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={onStartFromSchedule}
           accessibilityLabel={t({ id: "home.banners.todayA11y", message: `Today's workout: ${todaySchedule.template_name}. Tap to start.` })}
          accessibilityRole="button"
        >
          <View style={styles.content}>
            <MaterialCommunityIcons name="calendar-check" size={24} color={colors.onSecondaryContainer} />
            <View style={styles.text}>
               <Text variant="body" style={{ color: colors.onSecondaryContainer, fontWeight: "600" }}>{t({ id: "home.banners.today", message: `Today: ${todaySchedule.template_name}` })}</Text>
               <Text variant="caption" style={{ color: colors.onSecondaryContainer }}>{t({ id: "home.banners.todayExercises", message: `${todaySchedule.exercise_count} exercises · Tap to start` })}</Text>
            </View>
          </View>
        </Pressable>
      )}

      {todaySchedule && todayDone && (
        <Pressable
          style={[styles.banner, { backgroundColor: colors.primaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={onStartFromSchedule}
           accessibilityLabel={t({ id: "home.banners.completedA11y", message: `Completed: ${todaySchedule.template_name}. Tap to train again.` })}
          accessibilityRole="button"
        >
          <View style={styles.content}>
            <MaterialCommunityIcons name="check-circle" size={24} color={colors.onPrimaryContainer} />
            <View style={styles.text}>
               <Text variant="body" style={{ color: colors.onPrimaryContainer, fontWeight: "600" }}>{t({ id: "home.banners.completed", message: `✅ Completed: ${todaySchedule.template_name}` })}</Text>
              <Text variant="caption" style={{ color: colors.onPrimaryContainer }}>{t({ id: "home.banners.trainAgain", message: "Train again" })}</Text>
            </View>
          </View>
        </Pressable>
      )}

      {!todaySchedule && hasSchedule && (
        <View style={[styles.banner, { backgroundColor: colors.surface, borderRadius: 12, padding: 18 }]} accessibilityLabel={t({ id: "home.banners.restDayA11y", message: "Rest day. No workout scheduled." })}>
          <View style={styles.content}>
            <MaterialCommunityIcons name="bed" size={24} color={colors.onSurfaceVariant} />
            <View style={styles.text}>
              <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>{t({ id: "home.banners.restDay", message: "Rest Day" })}</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{t({ id: "home.banners.noWorkout", message: "No workout scheduled" })}</Text>
            </View>
          </View>
        </View>
      )}

      {nextWorkout && !todaySchedule && !hasSchedule && (
        <Pressable
          style={[styles.banner, { backgroundColor: colors.secondaryContainer, borderRadius: 12, padding: 18 }]}
          onPress={onStartNextWorkout}
           accessibilityLabel={t({ id: "home.banners.nextA11y", message: `Next workout: ${nextWorkout.day.label || nextWorkout.day.template_name || "workout"} from ${nextWorkout.program.name}` })}
          accessibilityRole="button"
        >
          <View style={styles.content}>
            <MaterialCommunityIcons name="play-circle" size={24} color={colors.onSecondaryContainer} />
            <View style={styles.text}>
               <Text variant="body" style={{ color: colors.onSecondaryContainer, fontWeight: "600" }}>{t({ id: "home.banners.next", message: `Next: ${nextWorkout.day.label || nextWorkout.day.template_name || "Workout"}` })}</Text>
               <Text variant="caption" style={{ color: colors.onSecondaryContainer }}>{t({ id: "home.banners.nextProgram", message: `${nextWorkout.program.name} · Tap to start` })}</Text>
            </View>
          </View>
        </Pressable>
      )}

      {nextWorkout && hasSchedule && (
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8, textAlign: "center" }} accessibilityLabel={t({ id: "home.banners.scheduleA11y", message: `Program ${nextWorkout.program.name}: Schedule active` })}>
          {t({ id: "home.banners.schedule", message: `${nextWorkout.program.name} (Schedule active)` })}
        </Text>
      )}
    </>
  );
}
/* eslint-enable complexity */

const styles = StyleSheet.create({
  banner: { marginBottom: 12 },
  content: { flexDirection: "row", alignItems: "center", gap: 12 },
  text: { flex: 1 },
});
