import { Trans } from "@lingui/react/macro";
import { t } from "@lingui/core/macro";
import { TouchableOpacity, View, StyleSheet } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import SwipeToDelete from "@/components/SwipeToDelete";
import type { DailyLog } from "@/lib/types";

type Props = {
  item: DailyLog;
  colors: { surface: string; onSurface: string; onSurfaceVariant: string };
  onRemove: (log: DailyLog) => void;
};

export function FoodLogCard({ item, colors, onRemove }: Props) {
  return (
    <View style={styles.wrapper}>
      <SwipeToDelete onDelete={() => onRemove(item)}>
        <Card style={[styles.card, { backgroundColor: colors.surface }]}>
          <CardContent style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ color: colors.onSurface }}>
                 {item.food?.name ?? <Trans id="components.nutrition.foodLog.unknown">Unknown</Trans>}
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {item.servings !== 1 ? ` · ${item.servings}×` : ""}
                {" · "}
                {Math.round((item.food?.protein ?? 0) * item.servings)}p
                {" · "}
                {Math.round((item.food?.carbs ?? 0) * item.servings)}c
                {" · "}
                {Math.round((item.food?.fat ?? 0) * item.servings)}f
              </Text>
            </View>
             <TouchableOpacity onPress={() => onRemove(item)} accessibilityLabel={t({ id: "components.nutrition.foodLog.removeA11y", message: `Remove ${item.food?.name ?? "food"}` })} hitSlop={8} style={{ padding: 8 }}>
              <MaterialCommunityIcons name="delete-outline" size={20} color={colors.onSurface} />
            </TouchableOpacity>
          </CardContent>
        </Card>
      </SwipeToDelete>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 6 },
  card: { borderRadius: 8, elevation: 0, shadowOpacity: 0 },
  row: { flexDirection: "row", alignItems: "center" },
});
