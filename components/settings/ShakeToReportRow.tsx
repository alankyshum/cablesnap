import { t } from "@lingui/core/macro";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, Switch, View } from "react-native";
import { Text } from "@/components/ui/text";
import type { ThemeColors } from "@/hooks/useThemeColors";
import { getShakeToReportEnabled, setShakeToReportEnabled } from "@/lib/shake-to-report";
import { spacing } from "@/constants/design-tokens";

export function ShakeToReportRow({ colors }: { colors: ThemeColors }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    getShakeToReportEnabled().then(setEnabled).catch(() => setEnabled(true));
  }, []);

  const update = async (value: boolean) => {
    setEnabled(value);
    try {
      await setShakeToReportEnabled(value);
    } catch {
      setEnabled(!value);
    }
  };

  return (
    <View style={styles.row} testID="shake-to-report-row">
      <View style={styles.copy}>
        <Text variant="body" style={{ color: colors.onSurface }}>
          {t({ id: "settings.feedback.shake", message: "Shake to report" })}
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          {t({ id: "settings.feedback.shakeHint", message: "Shake your phone to open feedback with a screenshot." })}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={update}
        disabled={Platform.OS === "web"}
        accessibilityRole="switch"
        accessibilityLabel={t({ id: "settings.feedback.shakeA11y", message: "Shake to report" })}
        accessibilityHint={t({ id: "settings.feedback.shakeA11yHint", message: "Opens feedback and captures the current screen when you shake your phone" })}
        testID="shake-to-report-switch"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md },
  copy: { flex: 1 },
});
