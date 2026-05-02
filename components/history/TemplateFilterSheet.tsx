import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Check } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { TemplateOption } from "@/lib/db";

type TemplateFilterSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  options: TemplateOption[];
  selectedTemplateId: string | null;
  onSelect: (templateId: string | null) => void;
};

/**
 * Bottom-sheet for the Template filter (BLD-938). Single-select.
 *
 *  - Filtering keys by stable `template_id` (deleted templates show
 *    "(deleted)" suffix; renames auto-update the displayed name).
 *  - Search field to handle users with many templates.
 *  - Tap an item → applies and closes; "Clear" button removes the filter.
 */
export function TemplateFilterSheet({
  isVisible,
  onClose,
  options,
  selectedTemplateId,
  onSelect,
}: TemplateFilterSheetProps) {
  const colors = useThemeColors();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.template_name.toLowerCase().includes(q));
  }, [options, search]);

  const handleSelect = (templateId: string) => {
    onSelect(templateId);
    onClose();
  };

  const handleClear = () => {
    onSelect(null);
    onClose();
  };

  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title="Filter by template"
      snapPoints={[0.6, 0.9]}
    >
      <View style={styles.header}>
        <Pressable
          onPress={handleClear}
          style={styles.clearButton}
          accessibilityLabel="Clear template filter"
          accessibilityRole="button"
        >
          <Text variant="body" style={{ color: colors.primary }}>
            Clear
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search templates"
        placeholderTextColor={colors.onSurfaceVariant}
        style={[
          styles.search,
          {
            backgroundColor: colors.surfaceVariant,
            color: colors.onSurface,
            borderColor: colors.outline,
          },
        ]}
        accessibilityLabel="Search templates"
      />

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="body" style={{ color: colors.onSurfaceVariant }}>
              {options.length === 0 ? "No templates yet" : "No matches"}
            </Text>
          </View>
        ) : (
          filtered.map((opt) => {
            const isSelected = opt.template_id === selectedTemplateId;
            return (
              <Pressable
                key={opt.template_id}
                onPress={() => handleSelect(opt.template_id)}
                style={[
                  styles.row,
                  isSelected && { backgroundColor: colors.primaryContainer },
                ]}
                accessibilityLabel={`${opt.template_name}${
                  opt.is_deleted ? " (deleted)" : ""
                }, ${opt.count} sessions${isSelected ? ", selected" : ""}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <View style={styles.rowText}>
                  <Text
                    variant="body"
                    style={{ color: colors.onSurface }}
                    numberOfLines={1}
                  >
                    {opt.template_name}
                    {opt.is_deleted ? (
                      <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                        {"  "}(deleted)
                      </Text>
                    ) : null}
                  </Text>
                  <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                    {opt.count} {opt.count === 1 ? "session" : "sessions"}
                  </Text>
                </View>
                {isSelected ? <Check size={18} color={colors.primary} /> : null}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  clearButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
  },
  search: {
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 12,
    fontSize: 14,
  },
  list: {
    maxHeight: 480,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  rowText: {
    flex: 1,
    marginRight: 8,
  },
  empty: {
    paddingVertical: 32,
    alignItems: "center",
  },
});
