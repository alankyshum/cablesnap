import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import { useCallback } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import RatingWidget from "@/components/RatingWidget";
import { EditedPill } from "@/components/session/EditedPill";
import { formatDuration } from "@/lib/format";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { SessionRow } from "@/hooks/useHistoryData";

type Props = {
  colors: ThemeColors;
};

export function useSessionRenderer({ colors }: Props) {
  const router = useRouter();

  return useCallback(({ item }: { item: SessionRow }) => {
    const date = new Date(item.started_at).toLocaleDateString(undefined, {
      weekday: "short", month: "short", day: "numeric",
    });
    return (
      <Animated.View entering={FadeIn.duration(200)}>
        <Pressable
          onPress={() => router.push(`/session/detail/${item.id}`)}
          accessibilityLabel={i18n._({ id: "history.session.a11y", message: "{name}, {date}, {duration}, {count} sets{hasRating, select, true {, rated {rating} out of 5} false {}}", values: { name: item.name || "Untitled workout", date, duration: formatDuration(item.duration_seconds), count: item.set_count, hasRating: !!item.rating, rating: item.rating ?? 0 } })}
          accessibilityRole="button"
        >
          <Card style={{ ...styles.card, backgroundColor: colors.surface }}>
            <CardContent>
              <View style={styles.cardHeader}>
                <Text variant="subtitle" style={{ color: colors.onSurface, flex: 1, minWidth: 0 }} numberOfLines={1}>
                  {item.name || t({ id: "history.session.untitled", message: "Untitled workout" })}
                </Text>
                {item.edited_at != null && <EditedPill editedAt={item.edited_at} colors={colors} size="compact" />}
                {item.rating != null && item.rating > 0 && <RatingWidget value={item.rating} readOnly size="small" />}
              </View>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {t({ id: "history.session.summary", message: `${date} · ${formatDuration(item.duration_seconds)} · ${item.set_count} sets` })}
              </Text>
            </CardContent>
          </Card>
        </Pressable>
      </Animated.View>
    );
  }, [colors, router]);
}

const styles = StyleSheet.create({
  card: { marginBottom: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
