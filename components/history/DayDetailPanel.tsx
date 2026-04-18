import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { formatDuration } from "@/lib/format";
import { spacing, radii } from "@/constants/design-tokens";
import RatingWidget from "@/components/RatingWidget";
import { Icon } from "@/components/ui/icon";
import { ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { SessionRow } from "@/hooks/useHistoryData";

type Props = {
  colors: ThemeColors;
  selected: string | null;
  year: number;
  month: number;
  dayDetailSessions: SessionRow[];
  selectedDayScheduleEntry: { template_name: string } | null;
  isSelectedDayFuture: boolean;
  dayDetailRef: React.RefObject<View | null>;
};

export default function DayDetailPanel({
  colors, selected, year, month, dayDetailSessions,
  selectedDayScheduleEntry, isSelectedDayFuture, dayDetailRef,
}: Props) {
  const router = useRouter();
  if (!selected) return null;

  const selectedDay = Number(selected.split("-")[2]);
  const dayLabel = new Date(year, month, selectedDay).toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <View ref={dayDetailRef} style={[styles.panel, { backgroundColor: colors.surfaceVariant }]}
      accessibilityLiveRegion="polite" accessibilityRole="summary" accessible>
      <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: spacing.xs }}>{dayLabel}</Text>
      {dayDetailSessions.length > 0 ? (
        dayDetailSessions.map((s) => (
          <Pressable key={s.id} onPress={() => router.push(`/session/detail/${s.id}`)}
            style={[styles.item, { backgroundColor: colors.surface }]}
            accessibilityRole="button"
            accessibilityLabel={`${s.name || "Untitled workout"}, ${formatDuration(s.duration_seconds)}, ${s.set_count} sets`}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body" numberOfLines={1} style={{ color: colors.onSurface }}>{s.name || "Untitled workout"}</Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{formatDuration(s.duration_seconds)} · {s.set_count} sets</Text>
            </View>
            {s.rating != null && s.rating > 0 && <RatingWidget value={s.rating} readOnly size="small" />}
            <Icon name={ChevronRight} size={20} color={colors.onSurfaceVariant} />
          </Pressable>
        ))
      ) : isSelectedDayFuture && selectedDayScheduleEntry ? (
        <Text variant="body" style={{ color: colors.onSurfaceVariant }}>Scheduled: {selectedDayScheduleEntry.template_name}</Text>
      ) : (
        <Text variant="body" style={{ color: colors.onSurfaceVariant }}>Rest day</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginTop: spacing.sm, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radii.lg, gap: spacing.xs },
  item: { flexDirection: "row", alignItems: "center", padding: spacing.sm, borderRadius: radii.md, gap: spacing.sm, marginTop: spacing.xxs },
});
