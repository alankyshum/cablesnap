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
          accessibilityLabel={`${item.name || "Untitled workout"}, ${date}, ${formatDuration(item.duration_seconds)}, ${item.set_count} sets${item.rating ? `, rated ${item.rating} out of 5` : ""}`}
          accessibilityRole="button"
        >
          <Card style={{ ...styles.card, backgroundColor: colors.surface }}>
            <CardContent>
              <View style={styles.cardHeader}>
                <Text variant="subtitle" style={{ color: colors.onSurface, flex: 1, minWidth: 0 }} numberOfLines={1}>
                  {item.name || "Untitled workout"}
                </Text>
                {item.edited_at != null && <EditedPill editedAt={item.edited_at} colors={colors} size="compact" />}
                {item.rating != null && item.rating > 0 && <RatingWidget value={item.rating} readOnly size="small" />}
              </View>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {date} · {formatDuration(item.duration_seconds)} · {item.set_count} sets
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
