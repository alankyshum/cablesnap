import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
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
import Masonry from "@/components/ui/Masonry";

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
  onImport: () => void;
  onExport: (id: string) => void;
};

export function buildMetaBadges(
  meta: (typeof STARTER_TEMPLATES)[number] | undefined,
  counts: Record<string, number>,
  durationEstimates: Record<string, number | null>,
  item: Pick<WorkoutTemplate, "id" | "source">
): MetaBadge[] {
  if (meta) {
    return [difficultyBadge(meta.difficulty), { icon: "clock-outline", label: meta.duration }, { icon: "dumbbell", label: t({ id: "home.templates.exerciseCount", message: `${meta.exercises.length} exercises` }) }];
  }
  const badges: MetaBadge[] = [];
  if (item.source === "coach") badges.push({ icon: "account-tie", label: t({ id: "home.templates.coach", message: "Coach" }) });
  const est = durationEstimates[item.id];
  if (est != null) badges.push({ icon: "clock-outline", label: formatDurationEstimate(est) });
  badges.push({ icon: "dumbbell", label: t({ id: "home.templates.exerciseCount", message: `${counts[item.id] ?? 0} exercises` }) });
  return badges;
}

export function buildMenuItems(
  isStarter: boolean,
  item: WorkoutTemplate,
  onOptions: (t: WorkoutTemplate) => void,
  onEdit: (id: string) => void,
  onDelete: (t: WorkoutTemplate) => void,
  onExport: (id: string) => void
): FlowCardMenuItem[] {
  // Starters can be duplicated and exported but not edited/deleted.
  if (isStarter) return [
     { label: t({ id: "home.templates.duplicate", message: "Duplicate" }), icon: "content-copy", onPress: () => onOptions(item) },
     { label: t({ id: "home.templates.export", message: "Export" }), icon: "export-variant", onPress: () => onExport(item.id) },
  ];
  // BLD-1000: curated templates (is_curated=1) are non-deletable/non-editable like starters.
  if (item.is_curated) return [{ label: t({ id: "home.templates.duplicate", message: "Duplicate" }), icon: "content-copy", onPress: () => onOptions(item) }];
  return [
     { label: t({ id: "home.templates.edit", message: "Edit" }), icon: "pencil", onPress: () => onEdit(item.id) },
     { label: t({ id: "home.templates.duplicate", message: "Duplicate" }), icon: "content-copy", onPress: () => onOptions(item) },
     { label: t({ id: "home.templates.export", message: "Export" }), icon: "export-variant", onPress: () => onExport(item.id) },
     { label: t({ id: "home.templates.delete", message: "Delete" }), icon: "trash-can-outline", onPress: () => onDelete(item), destructive: true },
  ];
}

export function TemplatesList({ colors, templates, counts, durationEstimates, starterMeta, templateReadiness, showReadiness, onStart, onDelete, onOptions, onEdit, onImport, onExport }: Props) {
  const router = useRouter();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>{t({ id: "home.templates.title", message: "Templates" })}</Text>
        <View style={styles.headerActions}>
          <Button variant="ghost" size="sm" onPress={onImport} accessibilityLabel={t({ id: "home.templates.importA11y", message: "Import template" })}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="file-import-outline" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: fontSizes.sm }}>{t({ id: "home.templates.import", message: "Import" })}</Text></View>
          </Button>
          <Button variant="ghost" size="sm" onPress={() => router.push("/template/create")} accessibilityLabel={t({ id: "home.templates.createA11y", message: "Create new template" })}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: fontSizes.sm }}>{t({ id: "home.templates.create", message: "Create" })}</Text></View>
          </Button>
        </View>
      </View>
      {templates.length === 0 ? (
        <View style={styles.empty}>
          <Text style={{ color: colors.onSurfaceVariant }}>{t({ id: "home.templates.empty", message: "Create your first workout template" })}</Text>
          <Button variant="outline" onPress={() => router.push("/template/create")} style={styles.emptyBtn} accessibilityLabel={t({ id: "home.templates.firstA11y", message: "Create your first template" })} label={t({ id: "home.templates.createTemplate", message: "Create Template" })} />
        </View>
      ) : (
        <Masonry gap={12}>
          {templates.map((item) => {
            const meta = starterMeta(item.id);
            const isStarter = !!meta || !!item.is_starter;
            const metaBadges = buildMetaBadges(meta, counts, durationEstimates, item);
            if (isStarter) metaBadges.push({ icon: "star-outline", label: t({ id: "home.templates.starter", message: "Starter" }) });
            const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
            if (meta?.recommended) badges.push({ label: t({ id: "home.templates.recommended", message: "RECOMMENDED" }), type: "recommended" });
            const readiness = !isStarter && showReadiness ? (templateReadiness[item.id]?.badge ?? null) : null;
            const displayName = meta?.name || item.name;
            const menuItems = buildMenuItems(isStarter, item, onOptions, onEdit, onDelete, onExport);
            const durationEst = !meta ? durationEstimates[item.id] : null;
            const spokenDuration = durationEst != null ? `, ${formatSpokenDuration(durationEst)}` : "";
            return (
              <FlowCard key={item.id} name={displayName} onPress={() => onStart(item)}
                accessibilityLabel={i18n._({ id: "home.templates.startA11y", message: "{kind}: {name}{duration}, {count, plural, one {# exercise} other {# exercises}}", values: { kind: isStarter ? "Starter template" : "Start workout from template", name: displayName, duration: spokenDuration, count: counts[item.id] ?? 0 } })}
                 accessibilityHint={t({ id: "home.templates.optionsHint", message: "Long press for options" })} badges={badges} readiness={readiness} meta={metaBadges}
                menuItems={menuItems} />
            );
          })}
        </Masonry>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: 20 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  empty: { alignItems: "center", paddingVertical: 16 },
  emptyBtn: { marginTop: 8 },
});
