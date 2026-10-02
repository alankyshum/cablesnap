import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import SwipeToDelete from "@/components/SwipeToDelete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { generateCalibrations } from "@/lib/cable-stack";
import type { CableStack, StackCalibration } from "@/lib/db";

type StackDraft = { name: string; unit: "kg" | "lb" };
type CalibrationDraft = { marker: string; weight: string; bulk: string };
type StackMode = "generate" | "manual";
type GenDraft = { startWeight: string; increment: string; count: string };

/** Max number of preview rows shown inline before truncating with "… and N more". */
const GEN_PREVIEW_MAX = 10;

interface CableStackCardProps {
  stack: CableStack;
  stackDraft: StackDraft;
  calibrationDraft: CalibrationDraft;
  calibrations: StackCalibration[];
  isExpanded: boolean;
  mode: StackMode;
  genDraft: GenDraft;
  onDelete: () => void;
  onToggle: () => void;
  onSaveStack: () => void;
  onUpdateStackDraft: (patch: Partial<StackDraft>) => void;
  onUpdateCalibrationDraft: (patch: Partial<CalibrationDraft>) => void;
  onUpdateGenDraft: (patch: Partial<GenDraft>) => void;
  onDeleteCalibration: (marker: number) => void;
  onSaveCalibration: () => void;
  onBulkPaste: () => void;
  onGenerate: () => void;
  onModeChange: (mode: StackMode) => void;
}

function computeGenPreview(genDraft: GenDraft): Array<{ marker: number; trueWeight: number }> {
  const sw = Number(genDraft.startWeight);
  const inc = Number(genDraft.increment);
  const cnt = Number(genDraft.count);
  if (
    !Number.isFinite(sw) || sw <= 0 ||
    !Number.isFinite(inc) || inc === 0 ||
    !Number.isInteger(cnt) || cnt <= 0
  ) {
    return [];
  }
  const r = generateCalibrations({ startWeight: sw, increment: inc, count: Math.min(cnt, GEN_PREVIEW_MAX) });
  return r.ok ? r.calibrations : [];
}

export function CableStackCard({
  stack,
  stackDraft,
  calibrationDraft,
  calibrations,
  isExpanded,
  mode,
  genDraft,
  onDelete,
  onToggle,
  onSaveStack,
  onUpdateStackDraft,
  onUpdateCalibrationDraft,
  onUpdateGenDraft,
  onDeleteCalibration,
  onSaveCalibration,
  onBulkPaste,
  onGenerate,
  onModeChange,
}: CableStackCardProps) {
  const colors = useThemeColors();
  const genPreviewItems = computeGenPreview(genDraft);
  const totalCount = Number(genDraft.count);
  const previewOverflow = Number.isInteger(totalCount) && totalCount > GEN_PREVIEW_MAX
    ? totalCount - GEN_PREVIEW_MAX
    : 0;

  return (
    <SwipeToDelete onDelete={onDelete} widthBasis="container">
      <View style={[styles.stackCard, { borderColor: colors.outlineVariant }]}>
        <Pressable
          onPress={onToggle}
          style={styles.rowHeader}
          accessibilityRole="button"
          accessibilityLabel={`${stack.name}, ${isExpanded ? "collapse" : "expand"}`}
        >
          <View style={{ flex: 1 }}>
            <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>{stack.name}</Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              {calibrations.length} marker{calibrations.length === 1 ? "" : "s"}
            </Text>
          </View>
          {isExpanded
            ? <ChevronDown size={18} color={colors.onSurfaceVariant} />
            : <ChevronRight size={18} color={colors.onSurfaceVariant} />}
        </Pressable>

        {isExpanded ? (
          <View style={styles.expandedSection}>
            <Input
              label="Stack name"
              value={stackDraft.name}
              onChangeText={(value) => onUpdateStackDraft({ name: value })}
              variant="outline"
            />
            <View style={styles.spacer} />
            <SegmentedControl
              value={stackDraft.unit}
              onValueChange={(value) => onUpdateStackDraft({ unit: value as "kg" | "lb" })}
              buttons={[{ value: "kg", label: "kg" }, { value: "lb", label: "lb" }]}
            />
            <View style={styles.spacer} />
            <Button variant="outline" onPress={onSaveStack}>Save Stack</Button>

            <View style={styles.sectionHeader}>
              <Text variant="body" style={{ color: colors.onSurface, fontWeight: "600" }}>Marker calibrations</Text>
            </View>
            <SegmentedControl
              value={mode}
              onValueChange={(value) => onModeChange(value as StackMode)}
              buttons={[
                { value: "generate", label: "Generate" },
                { value: "manual", label: "Manual" },
              ]}
            />
            <View style={styles.spacer} />

            {mode === "generate" ? (
              <View>
                <View style={styles.inlineInputs}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label={`Start (${stack.unit})`}
                      value={genDraft.startWeight}
                      onChangeText={(value) => onUpdateGenDraft({ startWeight: value })}
                      keyboardType="decimal-pad"
                      variant="outline"
                      accessibilityLabel={`Start weight in ${stack.unit}`}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label={`Step (${stack.unit})`}
                      value={genDraft.increment}
                      onChangeText={(value) => onUpdateGenDraft({ increment: value })}
                      keyboardType="decimal-pad"
                      variant="outline"
                      accessibilityLabel={`Increment in ${stack.unit}`}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Count"
                      value={genDraft.count}
                      onChangeText={(value) => onUpdateGenDraft({ count: value })}
                      keyboardType="number-pad"
                      variant="outline"
                      accessibilityLabel="Number of markers"
                    />
                  </View>
                </View>

                {genPreviewItems.length > 0 ? (
                  <View style={styles.genPreview}>
                    <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 4 }}>
                      Preview
                    </Text>
                    <ScrollView style={{ maxHeight: 160 }}>
                      {genPreviewItems.map((item) => (
                        <Text
                          key={item.marker}
                          variant="body"
                          style={{ color: colors.onSurface, paddingVertical: 2 }}
                          accessibilityLabel={`Pin ${item.marker}, ${item.trueWeight} ${stack.unit}`}
                        >
                          Pin {item.marker} → {item.trueWeight} {stack.unit}
                        </Text>
                      ))}
                      {previewOverflow > 0 ? (
                        <Text variant="caption" style={{ color: colors.onSurfaceVariant, paddingVertical: 2 }}>
                          … and {previewOverflow} more
                        </Text>
                      ) : null}
                    </ScrollView>
                  </View>
                ) : null}

                <Button
                  variant="outline"
                  onPress={onGenerate}
                  accessibilityLabel="Generate calibrations from parameters"
                >
                  Generate
                </Button>
              </View>
            ) : (
              <View>
                {calibrations.map((calibration) => (
                  <View key={`${stack.id}-${calibration.marker}`} style={styles.calibrationRow}>
                    <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
                      Marker {calibration.marker} — {calibration.true_weight} {stack.unit}
                    </Text>
                    <Button
                      variant="ghost"
                      size="sm"
                      onPress={() => onDeleteCalibration(calibration.marker)}
                    >
                      Delete
                    </Button>
                  </View>
                ))}
                <View style={styles.inlineInputs}>
                  <View style={{ flex: 1 }}>
                    <Input
                      label="Marker"
                      value={calibrationDraft.marker}
                      onChangeText={(value) => onUpdateCalibrationDraft({ marker: value })}
                      keyboardType="numeric"
                      variant="outline"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Input
                      label={`Weight (${stack.unit})`}
                      value={calibrationDraft.weight}
                      onChangeText={(value) => onUpdateCalibrationDraft({ weight: value })}
                      keyboardType="decimal-pad"
                      variant="outline"
                    />
                  </View>
                </View>
                <Button variant="outline" onPress={onSaveCalibration}>Save Marker</Button>
                <View style={styles.spacer} />
                <Input
                  label="Bulk paste"
                  placeholder="1=5\n2=7.5\n3=10"
                  value={calibrationDraft.bulk}
                  onChangeText={(value) => onUpdateCalibrationDraft({ bulk: value })}
                  type="textarea"
                  rows={4}
                  variant="outline"
                />
                <View style={styles.spacer} />
                <Button variant="outline" onPress={onBulkPaste}>Apply Bulk Paste</Button>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </SwipeToDelete>
  );
}

const styles = StyleSheet.create({
  stackCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  expandedSection: { marginTop: 12 },
  spacer: { height: 12 },
  sectionHeader: { marginTop: 18, marginBottom: 10 },
  inlineInputs: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 12,
  },
  calibrationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  genPreview: {
    marginBottom: 12,
    paddingLeft: 4,
  },
});
