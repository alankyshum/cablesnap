/* eslint-disable max-lines-per-function */
import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { Card, CardContent } from "@/components/ui/card";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { PlateCalculatorContent } from "../../app/tools/plates";
import { RMCalculatorContent } from "../../app/tools/rm";
import { TimerContent } from "../../app/tools/timer";
import { useThemeColors, type ThemeColors } from "@/hooks/useThemeColors";
import { logError } from "../../lib/errors";

const REST_PRESETS = [30, 60, 90, 120] as const;

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  onStartRest: (seconds: number) => void;
  onDismiss: () => void;
};

export function SessionToolboxSheet({ sheetRef, onStartRest, onDismiss }: Props) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["50%", "90%"], []);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(60);
  const [customDuration, setCustomDuration] = useState("");
  const [plateCalcWeight, setPlateCalcWeight] = useState<string | undefined>(undefined);

  const isCustom = selectedPreset === null;
  const parsedCustom = parseInt(customDuration, 10);
  const validCustom = !isNaN(parsedCustom) && parsedCustom >= 1;
  const canStart = isCustom ? validCustom : selectedPreset !== null;

  const handleSelectPreset = useCallback((seconds: number) => {
    setSelectedPreset(seconds);
    setCustomDuration("");
  }, []);

  const handleCustomFocus = useCallback(() => {
    setSelectedPreset(null);
  }, []);

  const handleStartRest = useCallback(() => {
    const duration = isCustom ? parsedCustom : selectedPreset;
    if (duration && duration >= 1) {
      onStartRest(duration);
      sheetRef.current?.close();
    }
  }, [isCustom, parsedCustom, selectedPreset, onStartRest, sheetRef]);

  const handlePlateCalcFromRM = useCallback((weight: number) => {
    setPlateCalcWeight(String(weight));
  }, []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      onClose={onDismiss}
      backdropComponent={(props) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
      )}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* Rest Timer Config */}
        <ToolSection icon="timer-outline" title="Rest Timer" colors={colors}>
          <View style={styles.presetsRow}>
            {REST_PRESETS.map((seconds) => (
              <Chip
                key={seconds}
                selected={selectedPreset === seconds}
                onPress={() => handleSelectPreset(seconds)}
                accessibilityRole="radio"
                accessibilityState={{ selected: selectedPreset === seconds }}
                accessibilityLabel={`${seconds} seconds rest`}
              >
                {`${seconds}s`}
              </Chip>
            ))}
          </View>
          <View style={styles.customRow}>
            <View style={{ flex: 1 }}>
              <Input
                variant="outline"
                keyboardType="numeric"
                value={customDuration}
                onChangeText={(text) => {
                  setCustomDuration(text);
                  setSelectedPreset(null);
                }}
                onFocus={handleCustomFocus}
                placeholder="Custom (seconds)"
                accessibilityLabel="Custom rest duration in seconds"
              />
            </View>
          </View>
          <Button
            variant="default"
            onPress={handleStartRest}
            disabled={!canStart}
            style={styles.startButton}
            accessibilityLabel="Start rest timer"
            label="Start Rest Timer"
          />
        </ToolSection>

        {/* Plate Calculator */}
        <ToolSection icon="weight" title="Plate Calculator" colors={colors}>
          <ToolErrorBoundary name="Plate Calculator">
            <PlateCalculatorContent initialWeight={plateCalcWeight} />
          </ToolErrorBoundary>
        </ToolSection>

        {/* 1RM Calculator */}
        <ToolSection icon="arm-flex" title="1RM Calculator" colors={colors}>
          <ToolErrorBoundary name="1RM Calculator">
            <RMCalculatorContent onPlateCalc={handlePlateCalcFromRM} />
          </ToolErrorBoundary>
        </ToolSection>

        {/* Interval Timer */}
        <ToolSection icon="timer-outline" title="Interval Timer" colors={colors}>
          <ToolErrorBoundary name="Interval Timer">
            <TimerContent />
          </ToolErrorBoundary>
        </ToolSection>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

function ToolSection({ icon, title, children, colors }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  children: React.ReactNode;
  colors: ThemeColors;
}) {
  return (
    <Card style={{ backgroundColor: colors.surfaceVariant, marginBottom: 16 }}>
      <CardContent>
        <View style={styles.sectionHeader}>
          <MaterialCommunityIcons name={icon} size={24} color={colors.primary} style={{ marginRight: 12 }} />
          <Text variant="subtitle" style={{ color: colors.onSurface }}>{title}</Text>
        </View>
        {children}
      </CardContent>
    </Card>
  );
}

type BoundaryProps = { name: string; children: React.ReactNode };
type BoundaryState = { hasError: boolean };

class ToolErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    logError(error, { component: `SessionToolbox/${this.props.name}`, fatal: false });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={{ textAlign: "center", opacity: 0.6 }}>
            {this.props.name} failed to load.
          </Text>
          <Button variant="ghost" size="sm" onPress={this.handleRetry} label="Tap to retry" />
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  startButton: {
    marginTop: 4,
  },
  errorContainer: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
});
