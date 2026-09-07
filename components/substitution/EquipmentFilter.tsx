import React from "react";
import { StyleSheet, View } from "react-native";
import { Chip } from "@/components/ui/chip";
import type { Equipment } from "../../lib/types";
import { EQUIPMENT_LABELS } from "../../lib/types";
import { t } from "@lingui/core/macro";

type Props = {
  availableEquipment: Equipment[];
  equipmentFilter: Equipment | null;
  onFilterChange: (filter: Equipment | null) => void;
};

export function EquipmentFilter({ availableEquipment, equipmentFilter, onFilterChange }: Props) {
  if (availableEquipment.length <= 1) return null;

  return (
    <View style={styles.filterRow} accessibilityRole="toolbar" accessibilityLabel={t({ id: "components.substitution.equipment-filter.label", message: "Equipment filter" })}>
      <Chip
        selected={equipmentFilter === null}
        onPress={() => onFilterChange(null)}
        compact
        style={styles.filterChip}
        accessibilityLabel={t({ id: "components.substitution.equipment-filter.all-a11y", message: "Show all equipment" })}
      >
        All
      </Chip>
      {availableEquipment.map((eq) => (
        <Chip
          key={eq}
          selected={equipmentFilter === eq}
          onPress={() =>
            onFilterChange(equipmentFilter === eq ? null : eq)
          }
          compact
          style={styles.filterChip}
          accessibilityLabel={`Filter by ${EQUIPMENT_LABELS[eq]}`}
        >
          {EQUIPMENT_LABELS[eq]}
        </Chip>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  filterChip: {
    marginBottom: 2,
  },
});
