import { StyleSheet, Switch, View } from "react-native";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { flowCardStyle } from "@/components/ui/FlowContainer";
import { fontSizes } from "@/constants/design-tokens";
import { setAppSetting } from "@/lib/db";
import { setEnabled as setAudioEnabled } from "@/lib/audio";
import type { ThemeColors } from "@/hooks/useThemeColors";
import type { useToast } from "@/components/ui/bna-toast";

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;
  children?: React.ReactNode;
};

export default function PreferencesCard({
  colors, toast,
  soundEnabled, setSoundEnabled,
  children,
}: Props) {
  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text variant="body" style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}>Preferences</Text>

        {children}

        <View style={[styles.row, { marginTop: 16 }]}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>Timer Sound</Text>
          <Switch
            value={soundEnabled}
            onValueChange={async (val) => {
              setSoundEnabled(val);
              setAudioEnabled(val);
              try { await setAppSetting("timer_sound_enabled", val ? "true" : "false"); }
              catch { toast.error("Failed to save timer sound setting"); }
            }}
            accessibilityLabel="Timer Sound"
            accessibilityRole="switch"
            accessibilityHint="Enable or disable audio cues for workout timers"
          />
        </View>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>Audio cues for interval timers and rest countdowns.</Text>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
});
