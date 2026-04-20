import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import { useThemeMode, type ThemeMode } from "@/lib/theme-preference";
import type { ThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ThemeColors;
};

export default function AppearanceCard({ colors }: Props) {
  const { themeMode, setThemeMode } = useThemeMode();

  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>Appearance</Text>
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>Theme</Text>
          <View style={styles.themeToggle}>
            <SegmentedControl
              value={themeMode}
              onValueChange={(val) => setThemeMode(val as ThemeMode)}
              buttons={[
                { value: "system", label: "Auto" },
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
            />
          </View>
        </View>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
          Auto follows your device system setting.
        </Text>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  themeToggle: { width: 200, flexShrink: 0 },
});
