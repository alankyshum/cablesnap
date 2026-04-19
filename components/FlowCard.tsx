import React, { useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle, type GestureResponderEvent } from "react-native";
import { Text } from "@/components/ui/text";
import { Card } from "@/components/ui/card";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { flowCardStyle } from "./ui/FlowContainer";
import type { Difficulty } from "../lib/types";
import { DIFFICULTY_LABELS } from "../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { BadgeRow, MetaRow } from "./FlowCardBadges";
import { FlowCardMenu } from "./FlowCardMenu";
import { fontSizes } from "@/constants/design-tokens";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
export type MetaBadge = { icon: IconName; label: string; difficulty?: Difficulty };
export type FlowCardMenuItem = { label: string; icon: IconName; onPress: () => void; destructive?: boolean };

type Props = {
  name: string; onPress: () => void; onLongPress?: () => void; accessibilityLabel: string;
  badges?: { label: string; type: "active" | "starter" | "recommended" }[];
  readiness?: import("../lib/recovery-readiness").ReadinessBadge | null;
  meta: MetaBadge[]; action?: React.ReactNode; menuItems?: FlowCardMenuItem[]; accessibilityHint?: string;
};

export function FlowCard({ name, onPress, onLongPress, accessibilityLabel, badges, readiness, meta, action, menuItems, accessibilityHint }: Props) {
  const colors = useThemeColors();
  const isDark = useColorScheme() === "dark";
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const hasMenu = menuItems && menuItems.length > 0;

  const handleLongPress = (e: GestureResponderEvent) => {
    if (hasMenu) {
      setMenuPos({ x: e.nativeEvent.pageX, y: e.nativeEvent.pageY });
      setMenuOpen(true);
    } else if (onLongPress) {
      onLongPress();
    }
  };

  return (
    <Card style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface }]) as ViewStyle}>
      <View style={styles.content}>
        <Pressable onPress={onPress} onLongPress={handleLongPress} style={styles.body} accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint} accessibilityRole="button">
          <View style={styles.chipRow}>
            <Text variant="body" style={{ color: colors.onSurface, flexShrink: 1, fontWeight: "600", fontSize: fontSizes.sm }} numberOfLines={1}>{name}</Text>
            <BadgeRow badges={badges} readiness={readiness} isDark={isDark} colors={colors} />
          </View>
          <View style={styles.metaRow}><MetaRow meta={meta} colors={colors} /></View>
        </Pressable>
        {action ?? null}
      </View>
      {menuOpen && menuItems && <FlowCardMenu items={menuItems} isDark={isDark} colors={colors} anchorY={menuPos.y} anchorX={menuPos.x} onClose={() => setMenuOpen(false)} />}
    </Card>
  );
}

export function difficultyBadge(d: Difficulty): MetaBadge {
  return { icon: "signal-cellular-2", label: DIFFICULTY_LABELS[d], difficulty: d };
}

const styles = StyleSheet.create({
  card: { marginBottom: 8, ...flowCardStyle, flexGrow: 0, padding: 12 },
  content: { flexDirection: "row", alignItems: "center", gap: 8 },
  body: { flex: 1, gap: 6 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  metaRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
});
