import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, TextInput } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes, radii } from "@/constants/design-tokens";
import { toDisplay, toKg } from "@/lib/units";
import {
  UNICODE_MINUS,
  normalizeModifier,
  modeOfModifier,
  type BodyweightModifierMode as BodyweightMode,
} from "@/lib/bodyweight";
import { getAppSetting, setAppSetting } from "@/lib/db";

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  initialModifierKg: number | null;
  unit: "kg" | "lb";
  onDone: (modifierKg: number | null) => void;
  onDismiss?: () => void;
};

const SHEET_SEEN_KEY = "bw_modifier_sheet_seen";
const STEPPER_VALUES = [0.5, 1, 2.5, 5] as const;

/**
 * Bottom sheet for editing the bodyweight modifier on a single set.
 * Architectural mirror of RestBreakdownSheet (NOT SetTypeSheet), per UX REV-8.
 *
 * 3-mode segmented control (Bodyweight / Added / Assisted) — the user never
 * types a negative value; "Assisted" flips the sign internally on Done.
 * Normalizes ±0 → null at the boundary (belt-and-braces with lib/bodyweight
 * and lib/db/session-sets).
 */
export function BodyweightModifierSheet({
  sheetRef,
  initialModifierKg,
  unit,
  onDone,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["55%"], []);

  const [mode, setMode] = useState<BodyweightMode>(() =>
    modeOfModifier(initialModifierKg),
  );
  // Magnitude is always a positive number in the current unit, displayed to 1dp.
  const [magnitude, setMagnitude] = useState<number>(() => {
    const n = normalizeModifier(initialModifierKg);
    if (n === null) return 0;
    return Math.round(toDisplay(Math.abs(n), unit) * 10) / 10;
  });
  const [inputText, setInputText] = useState<string>(() =>
    String(Math.round(toDisplay(Math.abs(initialModifierKg ?? 0), unit) * 10) / 10),
  );
  const [showCaption, setShowCaption] = useState(false);
  const captionPersistedRef = useRef(false);

  // Re-hydrate state when the sheet is opened for a new set.
  useEffect(() => {
    const nn = normalizeModifier(initialModifierKg);
    setMode(modeOfModifier(initialModifierKg));
    const mag = nn === null ? 0 : Math.round(toDisplay(Math.abs(nn), unit) * 10) / 10;
    setMagnitude(mag);
    setInputText(String(mag));
    captionPersistedRef.current = false;
  }, [initialModifierKg, unit]);

  const handleChange = useCallback(async (index: number) => {
    if (index < 0) return;
    try {
      const seen = await getAppSetting(SHEET_SEEN_KEY);
      if (seen !== "true") {
        setShowCaption(true);
        if (!captionPersistedRef.current) {
          captionPersistedRef.current = true;
          await setAppSetting(SHEET_SEEN_KEY, "true");
        }
      } else {
        setShowCaption(false);
      }
    } catch {
      // Silent — sheet remains usable without the caption.
    }
  }, []);

  const onModeChange = useCallback((next: BodyweightMode) => {
    setMode(next);
    if (next === "bodyweight") {
      setMagnitude(0);
      setInputText("0");
    } else if (magnitude <= 0) {
      // Entering a signed mode with no magnitude yet — seed at 1 unit so the
      // user sees a concrete value they can step from.
      setMagnitude(1);
      setInputText("1");
    }
  }, [magnitude]);

  const onStep = useCallback((delta: number) => {
    setMagnitude((prev) => {
      const next = Math.max(0, Math.round((prev + delta) * 10) / 10);
      setInputText(String(next));
      return next;
    });
  }, []);

  const onInputChange = useCallback((text: string) => {
    setInputText(text);
    const parsed = Number(text.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 0) {
      setMagnitude(Math.round(parsed * 10) / 10);
    }
  }, []);

  const handleDone = useCallback(() => {
    if (mode === "bodyweight") {
      onDone(null);
      return;
    }
    // Normalize ±0 → null at the sheet boundary too.
    if (magnitude <= 0) {
      onDone(null);
      return;
    }
    const kg = toKg(magnitude, unit);
    const signed = mode === "assisted" ? -kg : kg;
    // normalizeModifier handles NaN + ±0, belt-and-braces.
    onDone(normalizeModifier(signed));
  }, [mode, magnitude, unit, onDone]);

  const unitLabel = unit === "lb" ? "lb" : "kg";
  const previewText = useMemo(() => {
    if (mode === "bodyweight") return "BW";
    if (magnitude <= 0) return "BW";
    const n = String(Math.round(magnitude * 10) / 10);
    if (mode === "added") return `+${n} ${unitLabel}`;
    return `Assist ${UNICODE_MINUS}${n} ${unitLabel}`;
  }, [mode, magnitude, unitLabel]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      enableDynamicSizing={false}
      onClose={onDismiss}
      onChange={handleChange}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text
          variant="subtitle"
          style={{ color: colors.onSurface, marginBottom: 8 }}
          accessibilityRole="header"
        >
          Load modifier
        </Text>

        {/* 3-mode segmented control */}
        <View
          style={[styles.segmented, { borderColor: colors.outline }]}
          accessibilityRole="radiogroup"
          accessibilityLabel="Load mode"
        >
          <SegmentButton
            label="Bodyweight"
            selected={mode === "bodyweight"}
            onPress={() => onModeChange("bodyweight")}
            colors={colors}
          />
          <SegmentButton
            label="Added"
            selected={mode === "added"}
            onPress={() => onModeChange("added")}
            colors={colors}
          />
          <SegmentButton
            label="Assisted"
            selected={mode === "assisted"}
            onPress={() => onModeChange("assisted")}
            colors={colors}
          />
        </View>

        {showCaption ? (
          <Text
            variant="caption"
            style={{
              color: colors.onSurfaceVariant,
              fontSize: fontSizes.sm,
              marginTop: 8,
              lineHeight: 18,
            }}
            accessibilityRole="text"
          >
            Added = belt, vest, or weight held. Assisted = band or machine
            helping you.
          </Text>
        ) : null}

        {/* Preview of the chip as it will render */}
        <View style={[styles.previewBox, { borderColor: colors.outline }]}>
          <Text
            variant="subtitle"
            style={{
              color: colors.onSurface,
              fontVariant: ["tabular-nums"],
              textAlign: "center",
            }}
          >
            {previewText}
          </Text>
        </View>

        {/* Stepper + keyboard input (hidden for Bodyweight) */}
        {mode !== "bodyweight" ? (
          <>
            <View style={styles.stepperRow}>
              {STEPPER_VALUES.map((v) => (
                <Button
                  key={`plus-${v}`}
                  variant="outline"
                  size="sm"
                  onPress={() => onStep(v)}
                  label={`+${v}`}
                  accessibilityLabel={`Add ${v} ${unitLabel}`}
                />
              ))}
            </View>
            <View style={styles.stepperRow}>
              {STEPPER_VALUES.map((v) => (
                <Button
                  key={`minus-${v}`}
                  variant="outline"
                  size="sm"
                  onPress={() => onStep(-v)}
                  label={`${UNICODE_MINUS}${v}`}
                  accessibilityLabel={`Subtract ${v} ${unitLabel}`}
                />
              ))}
            </View>
            <View style={styles.inputRow}>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {unitLabel}
              </Text>
              <TextInput
                value={inputText}
                onChangeText={onInputChange}
                keyboardType="decimal-pad"
                style={[
                  styles.input,
                  {
                    color: colors.onSurface,
                    borderColor: colors.outline,
                    backgroundColor: colors.surfaceVariant,
                  },
                ]}
                accessibilityLabel={`Load magnitude in ${unitLabel}`}
                selectTextOnFocus
              />
            </View>
          </>
        ) : null}

        {/* Done / Bodyweight-only shortcut */}
        <View style={styles.actionsRow}>
          <Button
            variant="ghost"
            onPress={() => {
              setMode("bodyweight");
              setMagnitude(0);
              setInputText("0");
              onDone(null);
            }}
            label="Bodyweight only"
            accessibilityLabel="Clear modifier and persist bodyweight only"
          />
          <Button
            variant="default"
            onPress={handleDone}
            label="Done"
            accessibilityLabel="Save load modifier"
          />
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

type SegmentProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useThemeColors>;
};

function SegmentButton({ label, selected, onPress, colors }: SegmentProps) {
  return (
    <Button
      variant={selected ? "default" : "ghost"}
      size="sm"
      onPress={onPress}
      label={label}
      style={styles.segmentBtn}
      accessibilityLabel={label}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 12,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: radii.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  segmentBtn: {
    flex: 1,
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 16,
    marginVertical: 4,
  },
  stepperRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: fontSizes.base,
    fontVariant: ["tabular-nums"],
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
    gap: 12,
  },
});
