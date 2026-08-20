import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Text } from '@/components/ui/text';
import { fontSizes, spacing } from '@/constants/design-tokens';
import { useThemeColors } from '@/hooks/useThemeColors';
import { type BackupCategoryName } from '@/lib/db';
import { useLingui } from '@lingui/react/macro';
import { i18n } from '@lingui/core';

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
  const { t } = useLingui();
  const [draftSelected, setDraftSelected] = useState<Set<BackupCategoryName> | null>(null);
  const selected = useMemo(
    () => draftSelected ?? new Set(initialSelected),
    [draftSelected, initialSelected],
  );

  const selectedCount = selected.size;
  const categoryLabel = (category: BackupCategoryName) => {
    switch (category) {
      case 'workout_templates': return t({ id: 'settings.backup.category.workoutTemplates', message: 'Workout templates' });
      case 'workout_history': return t({ id: 'settings.backup.category.workoutHistory', message: 'Workout session history' });
      case 'exercises': return t({ id: 'settings.backup.category.exercises', message: 'Exercises' });
      case 'nutrition': return t({ id: 'settings.backup.category.nutrition', message: 'Nutrition' });
      case 'body_metrics': return t({ id: 'settings.backup.category.bodyMetrics', message: 'Body metrics' });
      case 'programs': return t({ id: 'settings.backup.category.programs', message: 'Programs' });
      case 'plate_calculator_settings': return t({ id: 'settings.backup.category.plateCalculator', message: 'Plate calculator settings' });
      case 'rest_timer_settings': return t({ id: 'settings.backup.category.restTimer', message: 'Rest timer settings' });
      case 'app_preferences': return t({ id: 'settings.backup.category.appPreferences', message: 'App preferences' });
      case 'achievements': return t({ id: 'settings.backup.category.achievements', message: 'Achievements' });
    }
  };
  const title = mode === 'import'
    ? t({ id: 'settings.backup.chooseImport', message: 'Choose what to import' })
    : t({ id: 'settings.backup.chooseExport', message: 'Choose what to export' });
  const confirmLabel = mode === 'import'
    ? t({ id: 'settings.backup.importSelected', message: 'Import Selected' })
    : t({ id: 'settings.backup.exportSelected', message: 'Export Selected' });
  const helperText = mode === 'import'
    ? t({ id: 'settings.backup.importHelper', message: 'Only checked categories will be imported. Unchecked categories in your current app data will be left untouched.' })
    : t({ id: 'settings.backup.exportHelper', message: 'Only checked categories will be included in the backup file.' });

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
          accessibilityLabel={t({ id: "settings.backup.selectAllA11y", message: "Select all backup categories" })}
        >
          {t({ id: 'settings.backup.selectAll', message: 'Select all' })}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onPress={clearAll}
          disabled={loading || categories.length === 0}
          accessibilityLabel={t({ id: "settings.backup.clearAllA11y", message: "Clear all backup categories" })}
        >
          {t({ id: 'settings.backup.clearAll', message: 'Clear all' })}
        </Button>
      </View>

      <View style={styles.list}>
        {categories.map((category) => {
          const count = counts[category] ?? 0;
          const checked = selected.has(category);
          const countLabel = count > 0
            ? i18n._({ id: 'settings.backup.recordCount', message: '{count, plural, one {# record} other {# records}}', values: { count } })
            : t({ id: 'settings.backup.noRecords', message: 'No records' });

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
              accessibilityLabel={mode === 'import'
                ? i18n._({ id: 'settings.backup.categoryInFileA11y', message: '{category}, {countLabel} in file', values: { category: categoryLabel(category), countLabel } })
                : categoryLabel(category)}
            >
              <Checkbox checked={checked} onCheckedChange={() => toggleCategory(category)} />
              <View style={styles.rowText}>
                <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm, fontWeight: '600' }}>
                  {categoryLabel(category)}
                </Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {mode === 'import' ? countLabel : t({ id: 'settings.backup.include', message: 'Include in backup' })}
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
          accessibilityLabel={mode === 'import'
            ? t({ id: 'settings.backup.cancelImportA11y', message: 'Cancel import' })
            : t({ id: 'settings.backup.cancelExportA11y', message: 'Cancel export' })}
        >
          {t({ id: 'common.cancel', message: 'Cancel' })}
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
