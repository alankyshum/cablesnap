import { StyleSheet, View } from 'react-native';
import { Card, CardContent } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { flowCardStyle } from '@/components/ui/FlowContainer';
import { fontSizes } from '@/constants/design-tokens';
import { updateBodySettings } from '@/lib/db';
import type { ThemeColors } from '@/hooks/useThemeColors';
import type { useToast } from '@/components/ui/bna-toast';

type Props = {
  colors: ThemeColors;
  toast: ReturnType<typeof useToast>;
  weightUnit: 'kg' | 'lb';
  setWeightUnit: (v: 'kg' | 'lb') => void;
  measureUnit: 'cm' | 'in';
  setMeasureUnit: (v: 'cm' | 'in') => void;
  weightGoal: number | null;
  fatGoal: number | null;
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
}: Props) {
  return (
    <Card style={StyleSheet.flatten([styles.flowCard, { backgroundColor: colors.surface }])}>
      <CardContent>
        <Text
          variant="body"
          style={{ color: colors.onSurface, fontWeight: '600', fontSize: fontSizes.sm, marginBottom: 8 }}
        >
          Units
        </Text>
        <View style={styles.row}>
          <Text variant="body" style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}>
            Weight
          </Text>
          <View style={styles.unitToggle}>
            <SegmentedControl
              value={weightUnit}
              onValueChange={async (val) => {
                const u = val as 'kg' | 'lb';
                setWeightUnit(u);
                try {
                  await updateBodySettings(u, measureUnit, weightGoal, fatGoal);
                } catch {
                  toast.error('Could not save unit');
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
            Measurements
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
                  toast.error('Could not save unit');
                }
              }}
              buttons={[
                { value: 'cm', label: 'cm' },
                { value: 'in', label: 'in' },
              ]}
            />
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  flowCard: { ...flowCardStyle, maxWidth: undefined, padding: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  unitToggle: { width: 140, flexShrink: 0 },
});
