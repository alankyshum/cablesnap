import { t } from "@lingui/core/macro";
import { i18n } from "@lingui/core";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import type { Program } from "../../lib/types";
import { FlowCard, difficultyBadge, type MetaBadge, type FlowCardMenuItem } from "../FlowCard";
import type { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import Masonry from "@/components/ui/Masonry";

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  programs: Program[];
  dayCounts: Record<string, number>;
  onPress: (id: string) => void;
  onDelete: (p: Program) => void;
  onOptions: (p: Program) => void;
};

// BLD-1001: filter modes for the Programs surface chip row.
//   `all`     — every program (default).
//   `curated` — programs flagged is_starter=1 OR is_curated=1 (everything
//               that ships pre-seeded).
//   `mine`    — user-created programs (both flags 0).
// Selection is intentionally session-scoped (component-local `useState`):
// it resets to `all` on app restart, per the BLD-986 plan / AC3.
export type ProgramsFilter = "all" | "curated" | "mine";

export function ProgramsList({ colors, programs, dayCounts, onPress, onDelete, onOptions }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<ProgramsFilter>("all");

  const filtered = useMemo(() => {
    if (filter === "all") return programs;
    if (filter === "curated") {
      return programs.filter((p) => p.is_starter === true || p.is_curated === true);
    }
    // `mine`: user-created (both flags falsy).
    return programs.filter((p) => !p.is_starter && !p.is_curated);
  }, [programs, filter]);

  const renderChip = (value: ProgramsFilter, label: string) => {
    const selected = filter === value;
    return (
      <Chip
        key={value}
        compact
        selected={selected}
        onPress={() => setFilter(value)}
        // AC5/AC7: Chip uses selected={true} to apply background fill +
        // bold weight together (not hue alone). Border on unselected chips
        // gives the chip row visible structure on light themes.
        style={
          selected
            ? undefined
            : { borderWidth: 1, borderColor: colors.outline }
        }
         accessibilityLabel={i18n._({ id: "home.programs.filterOptionA11y", message: "{label} programs filter{selected, select, true {, selected} false {}}", values: { label, selected } })}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        {label}
      </Chip>
    );
  };

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="subtitle" style={{ color: colors.onBackground }}>{t({ id: "home.programs.title", message: "Programs" })}</Text>
        <Button variant="ghost" size="sm" onPress={() => router.push("/program/create")} accessibilityLabel={t({ id: "home.programs.createA11y", message: "Create new program" })}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}><MaterialCommunityIcons name="plus" size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: fontSizes.sm }}>{t({ id: "home.programs.create", message: "Create" })}</Text></View>
        </Button>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        accessibilityLabel={t({ id: "home.programs.filterA11y", message: "Programs filter" })}
      >
        {renderChip("all", t({ id: "home.programs.all", message: "All" }))}
        {renderChip("curated", t({ id: "home.programs.curated", message: "Curated" }))}
        {renderChip("mine", t({ id: "home.programs.mine", message: "Mine" }))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={styles.empty}>
          {filter === "curated" ? (
            // AC: degenerate empty path — curated rows are undeletable in v1.
            <Text
              style={{ color: colors.onSurfaceVariant }}
              accessibilityRole="text"
              accessibilityLabel={t({ id: "home.programs.noCuratedA11y", message: "No curated programs available. Future CableSnap updates may add more." })}
            >
              {t({ id: "home.programs.noCurated", message: "No curated programs available. Future CableSnap updates may add more." })}
            </Text>
          ) : filter === "mine" ? (
            <>
              <Text
                style={{ color: colors.onSurfaceVariant }}
                accessibilityRole="text"
                accessibilityLabel={t({ id: "home.programs.emptyA11y", message: "No programs yet. Create your first program." })}
              >
                {t({ id: "home.programs.first", message: "Create your first program" })}
              </Text>
              <Button variant="outline" onPress={() => router.push("/program/create")} style={styles.emptyBtn} accessibilityLabel={t({ id: "home.programs.firstA11y", message: "Create your first program" })} label={t({ id: "home.programs.createProgram", message: "Create Program" })} />
            </>
          ) : (
            <>
              <Text style={{ color: colors.onSurfaceVariant }} accessibilityRole="text" accessibilityLabel={t({ id: "home.programs.emptyA11y", message: "No programs yet. Create your first program." })}>{t({ id: "home.programs.first", message: "Create your first program" })}</Text>
              <Button variant="outline" onPress={() => router.push("/program/create")} style={styles.emptyBtn} accessibilityLabel={t({ id: "home.programs.firstA11y", message: "Create your first program" })} label={t({ id: "home.programs.createProgram", message: "Create Program" })} />
            </>
          )}
        </View>
      ) : (
        <Masonry gap={12}>
          {filtered.map((item) => {
            const badges: { label: string; type: "active" | "starter" | "recommended" }[] = [];
            if (item.is_active) badges.push({ label: t({ id: "home.programs.active", message: "ACTIVE" }), type: "active" });
            const isPreseeded = item.is_starter || item.is_curated;
            const metaBadges: MetaBadge[] = [
              isPreseeded ? difficultyBadge("intermediate") : { icon: "signal-cellular-2", label: t({ id: "home.programs.custom", message: "Custom" }) },
              { icon: "calendar-blank-outline", label: t({ id: "home.programs.dayCount", message: `${dayCounts[item.id] ?? 0} days` }) },
            ];
            if (item.is_starter) metaBadges.push({ icon: "star-outline", label: t({ id: "home.programs.starter", message: "Starter" }) });
            if (item.is_curated) metaBadges.push({ icon: "bookmark-outline", label: t({ id: "home.programs.curated", message: "Curated" }) });
            // BLD-1001: curated programs are undeletable in v1 (matches starter
            // behavior). Users hide them via the `Mine` filter chip above.
            const menuItems: FlowCardMenuItem[] = isPreseeded
              ? [{ label: t({ id: "home.programs.duplicate", message: "Duplicate" }), icon: "content-copy", onPress: () => onOptions(item) }]
              : [
                  { label: t({ id: "home.programs.duplicate", message: "Duplicate" }), icon: "content-copy", onPress: () => onOptions(item) },
                  { label: t({ id: "home.programs.delete", message: "Delete" }), icon: "trash-can-outline", onPress: () => onDelete(item), destructive: true },
                ];
            const kindLabel = item.is_curated ? "Curated program" : item.is_starter ? "Starter program" : "Program";
            const descSuffix = item.description ? `. ${item.description}` : "";
            return (
              <FlowCard key={item.id} name={item.name} onPress={() => onPress(item.id)}
                accessibilityLabel={i18n._({ id: "home.programs.itemA11y", message: "{kind}: {name}, {days} days{active, select, true {, active} false {}}{description}", values: { kind: kindLabel, name: item.name, days: dayCounts[item.id] ?? 0, active: item.is_active, description: descSuffix } })}
                accessibilityHint={t({ id: "home.programs.optionsHint", message: "Long press for options" })}
                badges={badges} meta={metaBadges}
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
  empty: { alignItems: "center", paddingVertical: 16 },
  emptyBtn: { marginTop: 8 },
  chipRow: { flexDirection: "row", gap: 8, paddingVertical: 6, paddingRight: 8 },
  chip: { borderWidth: 1 },
});
