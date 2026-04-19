import React from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import type { Program } from "../../lib/types";
import { FlowCard, difficultyBadge, type MetaBadge, type FlowCardMenuItem } from "../FlowCard";
import type { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  programs: Program[];
  dayCounts: Record<string, number>;
  onPress: (id: string) => void;
  onDelete: (p: Program) => void;
  onOptions: (p: Program) => void;
};

export function ProgramsList({ colors, programs, dayCounts, onPress, onDelete, onOptions }: Props) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>Programs</Text>
        <Button variant="ghost" size="sm" onPress={() => router.push("/program/create")} accessibilityLabel="Create new program">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: fontSizes.sm }}>Create</Text></View>
        </Button>
      </View>
      {programs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.onSurfaceVariant }} accessibilityRole="text" accessibilityLabel="No programs yet. Create your first program.">Create your first program</Text>
          <Button variant="outline" onPress={() => router.push("/program/create")} style={styles.emptyBtn} accessibilityLabel="Create your first program" label="Create Program" />
        </View>
      ) : (
        <FlatList data={programs} keyExtractor={(i) => i.id} scrollEnabled={false} contentContainerStyle={styles.flowList} renderItem={({ item }) => {
          const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
          if (item.is_active) badges.push({ label: "ACTIVE", type: "active" });
          const metaBadges: MetaBadge[] = [item.is_starter ? difficultyBadge("intermediate") : { icon: "signal-cellular-2", label: "Custom" }, { icon: "calendar-blank-outline", label: `${dayCounts[item.id] ?? 0} days` }];
          if (item.is_starter) metaBadges.push({ icon: "star-outline", label: "Starter" });
          const menuItems: FlowCardMenuItem[] = item.is_starter
            ? [{ label: "Duplicate", icon: "content-copy", onPress: () => onOptions(item) }]
            : [
                { label: "Duplicate", icon: "content-copy", onPress: () => onOptions(item) },
                { label: "Delete", icon: "trash-can-outline", onPress: () => onDelete(item), destructive: true },
              ];
          return (
            <FlowCard key={item.id} name={item.name} onPress={() => onPress(item.id)}
              accessibilityLabel={`${item.is_starter ? "Starter program" : "Program"}: ${item.name}, ${dayCounts[item.id] ?? 0} days${item.is_active ? ", active" : ""}`}
              accessibilityHint="Long press for options"
              badges={badges} meta={metaBadges}
              menuItems={menuItems} />
          );
        }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flowList: { flexDirection: "row", flexWrap: "wrap", gap: 12, alignItems: "flex-start" },
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  empty: { alignItems: "center", paddingVertical: 16 },
  emptyBtn: { marginTop: 8 },
});
