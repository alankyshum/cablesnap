import { StyleSheet, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { fontSizes } from "@/constants/design-tokens";
import { useThemeMode, type ThemeMode } from "@/lib/theme-preference";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { useLingui } from "@lingui/react/macro";

type Props = {
  colors: ThemeColors;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function AppearanceCard({ colors, bareContent = false }: Props) {
  const { themeMode, setThemeMode } = useThemeMode();
  const { t } = useLingui();

  const content = (
    <>
      <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>{t({ id: "settings.appearance.title", message: "Appearance" })}</Text>
      <View style={styles.row}>
        <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>{t({ id: "settings.appearance.theme", message: "Theme" })}</Text>
        <View style={styles.themeToggle}>
          <SegmentedControl
            value={themeMode}
            onValueChange={(val) => setThemeMode(val as ThemeMode)}
            buttons={[
              { value: "system", label: t({ id: "settings.appearance.auto", message: "Auto" }) },
              { value: "light", label: t({ id: "settings.appearance.light", message: "Light" }) },
              { value: "dark", label: t({ id: "settings.appearance.dark", message: "Dark" }) },
            ]}
          />
        </View>
      </View>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
        {t({ id: "settings.appearance.autoHint", message: "Auto follows your device system setting." })}
      </Text>
    </>
  );

  if (bareContent) return <View>{content}</View>;

  return (
    <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  themeToggle: { width: 200, flexShrink: 0 },
});
