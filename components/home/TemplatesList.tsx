import React from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import type { WorkoutTemplate } from "../../lib/types";
import { STARTER_TEMPLATES } from "../../lib/starter-templates";
import { FlowCard, difficultyBadge, type MetaBadge, type FlowCardMenuItem } from "../FlowCard";
import type { TemplateReadiness } from "../../lib/recovery-readiness";
import type { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";

import { formatDurationEstimate, formatSpokenDuration } from "../../lib/format";

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  templates: WorkoutTemplate[];
  counts: Record<string, number>;
  durationEstimates: Record<string, number | null>;
  starterMeta: (id: string) => (typeof STARTER_TEMPLATES)[number] | undefined;
  templateReadiness: Record<string, TemplateReadiness>;
  showReadiness: boolean;
  onStart: (t: WorkoutTemplate) => void;
  onDelete: (t: WorkoutTemplate) => void;
  onOptions: (t: WorkoutTemplate) => void;
  onEdit: (id: string) => void;
};

function buildMetaBadges(
  meta: (typeof STARTER_TEMPLATES)[number] | undefined,
  counts: Record<string, number>,
  durationEstimates: Record<string, number | null>,
  itemId: string
): MetaBadge[] {
  if (meta) {
    return [difficultyBadge(meta.difficulty), { icon: "clock-outline", label: meta.duration }, { icon: "dumbbell", label: `${meta.exercises.length} exercises` }];
  }
  const badges: MetaBadge[] = [];
  const est = durationEstimates[itemId];
  if (est != null) badges.push({ icon: "clock-outline", label: formatDurationEstimate(est) });
  badges.push({ icon: "dumbbell", label: `${counts[itemId] ?? 0} exercises` });
  return badges;
}

function buildMenuItems(
  isStarter: boolean,
  item: WorkoutTemplate,
  onOptions: (t: WorkoutTemplate) => void,
  onEdit: (id: string) => void,
  onDelete: (t: WorkoutTemplate) => void
): FlowCardMenuItem[] {
  if (isStarter) return [{ label: "Duplicate", icon: "content-copy", onPress: () => onOptions(item) }];
  return [
    { label: "Edit", icon: "pencil", onPress: () => onEdit(item.id) },
    { label: "Duplicate", icon: "content-copy", onPress: () => onOptions(item) },
    { label: "Delete", icon: "trash-can-outline", onPress: () => onDelete(item), destructive: true },
  ];
}

export function TemplatesList({ colors, templates, counts, durationEstimates, starterMeta, templateReadiness, showReadiness, onStart, onDelete, onOptions, onEdit }: Props) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>Templates</Text>
        <Button variant="ghost" size="sm" onPress={() => router.push("/template/create")} accessibilityLabel="Create new template">
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: fontSizes.sm }}>Create</Text></View>
        </Button>
      </View>
      {templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.onSurfaceVariant }}>Create your first workout template</Text>
          <Button variant="outline" onPress={() => router.push("/template/create")} style={styles.emptyBtn} accessibilityLabel="Create your first template" label="Create Template" />
        </View>
      ) : (
        <View style={styles.flowList}>
          {templates.map((item) => {
            const meta = starterMeta(item.id);
            const isStarter = !!meta || !!item.is_starter;
            const metaBadges = buildMetaBadges(meta, counts, durationEstimates, item.id);
            if (isStarter) metaBadges.push({ icon: "star-outline", label: "Starter" });
            const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
            if (meta?.recommended) badges.push({ label: "RECOMMENDED", type: "recommended" });
            const readiness = !isStarter && showReadiness ? (templateReadiness[item.id]?.badge ?? null) : null;
            const displayName = meta?.name || item.name;
            const menuItems = buildMenuItems(isStarter, item, onOptions, onEdit, onDelete);
            const durationEst = !meta ? durationEstimates[item.id] : null;
            const spokenDuration = durationEst != null ? `, ${formatSpokenDuration(durationEst)}` : "";
            return (
              <FlowCard key={item.id} name={displayName} onPress={() => onStart(item)}
                accessibilityLabel={`${isStarter ? "Starter template" : "Start workout from template"}: ${displayName}${spokenDuration}, ${counts[item.id] ?? 0} exercises`}
                accessibilityHint="Long press for options" badges={badges} readiness={readiness} meta={metaBadges}
                menuItems={menuItems} />
            );
          })}
        </View>
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
