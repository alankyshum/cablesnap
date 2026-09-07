import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { fontSizes } from '@/constants/design-tokens';
import { updateBodySettings, getAppSetting, setAppSetting } from '@/lib/db';
import { getValidSteps, resolveStep } from '@/lib/weightStep';
import type { ThemeColors } from '@/hooks/useThemeColors';
import type { useToast } from '@/components/ui/bna-toast';
import { t } from '@/lib/i18n';

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  weightUnit: 'kg' | 'lb';
  setWeightUnit: (v: 'kg' | 'lb') => void;
  measureUnit: 'cm' | 'in';
  setMeasureUnit: (v: 'cm' | 'in') => void;
  weightGoal: number | null;
  fatGoal: number | null;
  /**
   * When `true`, omit the outer Card wrapper so this component can be
   * composed inside a parent SettingsTile without nesting cards (BLD-2031).
   */
  bareContent?: boolean;
};

export default function UnitsCard({
  colors,
  toast,
  weightUnit,
  setWeightUnit,
  measureUnit,
  setMeasureUnit,
  weightGoal,
  fatGoal,
  bareContent = false,
}: Props) {
  const [weightStep, setWeightStepState] = useState<string>('2.5');

  useEffect(() => {
    let cancelled = false;
    getAppSetting('session.weightStep').then((val) => {
      if (cancelled) return;
      const resolved = resolveStep(val, weightUnit);
      setWeightStepState(String(resolved));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [weightUnit]);

  const updateWeightStep = async (newStepStr: string) => {
    setWeightStepState(newStepStr);
    try {
      await setAppSetting('session.weightStep', newStepStr);
    } catch {
      toast.error(t({ id: "settings.units.saveWeightStepFailed", message: "Could not save weight step setting" }));
    }
  };

  const content = (
    <>
      <Text
        variant="body"
        style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}
      >
        {t({ id: "settings.units.title", message: "Units" })}
      </Text>
      <View style={styles.row}>
        <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
          {t({ id: "settings.units.weight", message: "Weight" })}
        </Text>
        <View style={styles.unitToggle}>
          <SegmentedControl
            value={weightUnit}
            onValueChange={async (val) => {
              const u = val as 'kg' | 'lb';
              setWeightUnit(u);
              try {
                await updateBodySettings(u, measureUnit, weightGoal, fatGoal);
                const currentStepVal = await getAppSetting('session.weightStep');
                const resolved = resolveStep(currentStepVal, u);
                await setAppSetting('session.weightStep', String(resolved));
                setWeightStepState(String(resolved));
              } catch {
                toast.error(t({ id: "settings.units.saveUnitFailed", message: "Could not save unit" }));
              }
            }}
            buttons={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
          />
        </View>
      </View>
      <View style={[styles.row, { marginTop: 12 }]}>
        <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
          {t({ id: "settings.units.measurements", message: "Measurements" })}
        </Text>
        <View style={styles.unitToggle}>
          <SegmentedControl
            value={measureUnit}
            onValueChange={async (val) => {
              const m = val as 'cm' | 'in';
              setMeasureUnit(m);
              try {
                await updateBodySettings(weightUnit, m, weightGoal, fatGoal);
              } catch {
                toast.error(t({ id: "settings.units.saveUnitFailed", message: "Could not save unit" }));
              }
            }}
            buttons={[
              { value: 'cm', label: 'cm' },
              { value: 'in', label: 'in' },
            ]}
          />
        </View>
      </View>
      <View style={[styles.row, { marginTop: 12 }]}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text variant="body" style={{ color: colors.onSurface, fontSize: fontSizes.sm }}>
            {t({ id: "settings.units.weightStep", message: "Weight step" })}
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.xs, marginTop: 2, lineHeight: 16 }}>
            {t({ id: "settings.units.weightStepHint", message: "Input step granularity for exercises. Applies to new sessions." })}
          </Text>
        </View>
        <View style={styles.weightStepToggle}>
          <SegmentedControl
            value={weightStep}
            onValueChange={updateWeightStep}
            buttons={getValidSteps(weightUnit).map((stepVal) => ({
              value: String(stepVal),
              label: String(stepVal),
              accessibilityLabel: `Weight step ${stepVal} ${weightUnit === 'lb' ? 'pounds' : 'kilograms'}`,
            }))}
          />
        </View>
      </View>
    </>
  );

  if (bareContent) return <View>{content}</View>;

  return (
    <Card variant="outline" style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { padding: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  unitToggle: { width: 140, flexShrink: 0 },
  weightStepToggle: { width: 170, flexShrink: 0 },
});
