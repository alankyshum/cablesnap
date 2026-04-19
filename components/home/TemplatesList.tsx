import React from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import type { WorkoutTemplate } from "../../lib/types";
import { STARTER_TEMPLATES } from "../../lib/starter-templates";
import { FlowCard, difficultyBadge, type MetaBadge, type FlowCardMenuItem } from "../FlowCard";
import type { TemplateReadiness } from "../../lib/recovery-readiness";
import type { useThemeColors } from "@/hooks/useThemeColors";

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  templates: WorkoutTemplate[];
  counts: Record<string, number>;
  starterMeta: (id: string) => (typeof STARTER_TEMPLATES)[number] | undefined;
  templateReadiness: Record<string, TemplateReadiness>;
  showReadiness: boolean;
  onStart: (t: WorkoutTemplate) => void;
  onDelete: (t: WorkoutTemplate) => void;
  onOptions: (t: WorkoutTemplate) => void;
  onEdit: (id: string) => void;
};

export function TemplatesList({ colors, templates, counts, starterMeta, templateReadiness, showReadiness, onStart, onDelete, onOptions, onEdit }: Props) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>Templates</Text>
        <Button variant="ghost" size="sm" onPress={() => router.push("/template/create")} accessibilityLabel="Create new template">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: 14 }}>Create</Text></View>
        </Button>
      </View>
      {templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.onSurfaceVariant }}>Create your first workout template</Text>
          <Button variant="outline" onPress={() => router.push("/template/create")} style={styles.emptyBtn} accessibilityLabel="Create your first template" label="Create Template" />
        </View>
      ) : (
        <FlatList data={templates} keyExtractor={(i) => i.id} scrollEnabled={false} contentContainerStyle={styles.flowList} renderItem={({ item }) => {
          const meta = starterMeta(item.id);
          const isStarter = !!meta || item.is_starter;
          const metaBadges: MetaBadge[] = meta ? [difficultyBadge(meta.difficulty), { icon: "clock-outline", label: meta.duration }, { icon: "dumbbell", label: `${meta.exercises.length} exercises` }] : [{ icon: "dumbbell", label: `${counts[item.id] ?? 0} exercises` }];
          if (isStarter) metaBadges.push({ icon: "star-outline", label: "Starter" });
          const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
          if (meta?.recommended) badges.push({ label: "RECOMMENDED", type: "recommended" });
          const readiness = !isStarter && showReadiness ? (templateReadiness[item.id]?.badge ?? null) : null;
          const displayName = meta?.name || item.name;
          const menuItems: FlowCardMenuItem[] = isStarter
            ? [{ label: "Duplicate", icon: "content-copy", onPress: () => onOptions(item) }]
            : [
                { label: "Edit", icon: "pencil", onPress: () => onEdit(item.id) },
                { label: "Duplicate", icon: "content-copy", onPress: () => onOptions(item) },
                { label: "Delete", icon: "trash-can-outline", onPress: () => onDelete(item), destructive: true },
              ];
          return (
            <FlowCard key={item.id} name={displayName} onPress={() => onStart(item)}
              accessibilityLabel={`${isStarter ? "Starter template" : "Start workout from template"}: ${displayName}, ${counts[item.id] ?? 0} exercises`}
              accessibilityHint="Long press for options" badges={badges} readiness={readiness} meta={metaBadges}
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
