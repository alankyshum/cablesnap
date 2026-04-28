import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { fontSizes, spacing } from '@/constants/design-tokens';
import { useThemeColors } from '@/hooks/useThemeColors';
import {
  BACKUP_CATEGORY_LABELS,
  type BackupCategoryName,
} from '@/lib/db';

const EMPTY_COUNTS: Partial<Record<BackupCategoryName, number>> = {};

type Props = {
  visible: boolean;
  mode: 'import' | 'export';
  categories: BackupCategoryName[];
  initialSelected: BackupCategoryName[];
  counts?: Partial<Record<BackupCategoryName, number>>;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (selected: BackupCategoryName[]) => void;
};

export default function BackupCategorySheet({
  visible,
  mode,
  categories,
  initialSelected,
  counts = EMPTY_COUNTS,
  loading = false,
  onClose,
  onConfirm,
}: Props) {
  const colors = useThemeColors();
  const [draftSelected, setDraftSelected] = useState<Set<BackupCategoryName> | null>(null);
  const selected = draftSelected ?? new Set(initialSelected);

  const selectedCount = selected.size;
  const title = mode === 'import' ? 'Choose what to import' : 'Choose what to export';
  const confirmLabel = mode === 'import' ? 'Import Selected' : 'Export Selected';
  const helperText = mode === 'import'
    ? 'Only checked categories will be imported. Unchecked categories in your current app data will be left untouched.'
    : 'Only checked categories will be included in the backup file.';

  const orderedSelected = useMemo(
    () => categories.filter((category) => selected.has(category)),
    [categories, selected],
  );

  const toggleCategory = (category: BackupCategoryName) => {
    setDraftSelected((prev) => {
      const next = new Set(prev ?? initialSelected);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const selectAll = () => setDraftSelected(new Set(categories));
  const clearAll = () => setDraftSelected(new Set());
  const handleClose = () => {
    setDraftSelected(null);
    onClose();
  };
  const handleConfirm = () => {
    onConfirm(orderedSelected);
    setDraftSelected(null);
  };

  return (
    <BottomSheet
      isVisible={visible}
      onClose={handleClose}
      title={title}
      snapPoints={[0.62, 0.85]}
    >
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: spacing.md }}>
        {helperText}
      </Text>

      <View style={styles.bulkActions}>
        <Button
          variant="ghost"
          size="sm"
          onPress={selectAll}
          disabled={loading || categories.length === 0}
          accessibilityLabel="Select all backup categories"
        >
          Select all
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={clearAll}
          disabled={loading || categories.length === 0}
          accessibilityLabel="Clear all backup categories"
        >
          Clear all
        </Button>
      </View>

      <View style={styles.list}>
        {categories.map((category) => {
          const count = counts[category] ?? 0;
          const checked = selected.has(category);
          const countLabel = count > 0 ? `${count} record${count === 1 ? '' : 's'}` : 'No records';

          return (
            <Pressable
              key={category}
              style={[
                styles.row,
                {
                  backgroundColor: colors.surfaceVariant,
                  borderColor: checked ? colors.primary : colors.outlineVariant,
                },
              ]}
              onPress={() => toggleCategory(category)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`${BACKUP_CATEGORY_LABELS[category]}${mode === 'import' ? `, ${countLabel} in file` : ''}`}
            >
              <Checkbox checked={checked} onCheckedChange={() => toggleCategory(category)} />
              <View style={styles.rowText}>
                <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm, fontWeight: '600' }}>
                  {BACKUP_CATEGORY_LABELS[category]}
                </Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {mode === 'import' ? countLabel : 'Include in backup'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Button
          variant="outline"
          onPress={handleClose}
          disabled={loading}
          style={styles.footerButton}
          accessibilityLabel={`Cancel ${mode}`}
        >
          Cancel
        </Button>
        <Button
          variant="default"
          onPress={handleConfirm}
          disabled={loading || selectedCount === 0}
          loading={loading}
          style={styles.footerButton}
          accessibilityLabel={confirmLabel}
        >
          {confirmLabel}
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bulkActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  footerButton: {
    flex: 1,
  },
});
