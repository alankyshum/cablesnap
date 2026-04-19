import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Progress } from "@/components/ui/progress";
import { radii } from "@/constants/design-tokens";

export function MacroRow({ label: name, value, target, unit, colors }: {
  label: string; value: number; target: number; unit?: string;
  colors: { onSurface: string; onSurfaceVariant: string };
}) {
  const u = unit ?? "";
  return (
    <View style={styles.macro}>
      <View style={styles.macroHeader}>
        <Text variant="caption" style={{ color: colors.onSurface }}>{name}</Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>{Math.round(value)}{u} / {Math.round(target)}{u}</Text>
      </View>
      <Progress value={target > 0 ? Math.min(value / target, 1) * 100 : 0} style={styles.bar} />
    </View>
  );
}

const styles = StyleSheet.create({
  macro: { marginBottom: 8 },
  macroHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  bar: { height: 6, borderRadius: radii.sm },
});
