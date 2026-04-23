import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import BottomSheet from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Chip } from "@/components/ui/chip";
import { useThemeColors } from "@/hooks/useThemeColors";
import { formatTime, formatTimeRemaining } from "../../lib/format";
import { getAppSetting, setAppSetting } from "../../lib/db";
import { fontSizes } from "@/constants/design-tokens";
import type { RestBreakdown } from "../../lib/rest";
import { RestBreakdownSheet } from "./RestBreakdownSheet";

const REST_PRESETS = [30, 60, 90, 120] as const;
const DEFAULT_REST_SECONDS = 90;
const REST_DONE_DISPLAY_MS = 3000;

function presetLabel(seconds: number): string {
  if (seconds >= 60) return `${seconds / 60}m`;
  return `${seconds}s`;
}

type Props = {
  rest: number;
  elapsed: number;
  estimatedDuration?: number | null;
  breakdown?: RestBreakdown;
  onStartRest: (duration: number) => void;
  onDismissRest: () => void;
  onOpenToolbox: () => void;
  pickerRequested?: boolean;
  onPickerDismissed?: () => void;
};

function SessionHeaderToolbarInner({
  rest,
  elapsed,
  estimatedDuration,
  breakdown,
  onStartRest,
  onDismissRest,
  onOpenToolbox,
  pickerRequested,
  onPickerDismissed,
}: Props) {
  const colors = useThemeColors();
  const { width: viewportWidth } = useWindowDimensions();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [showRestDone, setShowRestDone] = useState(false);
  const [showBreakdownChip, setShowBreakdownChip] = useState(true);
  const prevRestRef = useRef(0);
  const restDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const breakdownSheetRef = useRef<BottomSheet>(null);

  // Settings state for the picker modal
  const [vibrateSetting, setVibrateSetting] = useState(true);
  const [soundSetting, setSoundSetting] = useState(true);

  // Detect rest completion: previous rest > 0 → current rest === 0
  useEffect(() => {
    if (prevRestRef.current > 0 && rest === 0) {
      setShowRestDone(true); // eslint-disable-line react-hooks/set-state-in-effect
      restDoneTimerRef.current = setTimeout(() => {
        setShowRestDone(false);
      }, REST_DONE_DISPLAY_MS);
    }
    prevRestRef.current = rest;
  }, [rest]);

  // Cleanup rest done timer on unmount
  useEffect(() => {
    return () => {
      if (restDoneTimerRef.current) clearTimeout(restDoneTimerRef.current);
    };
  }, []);

  const handleElapsedTap = useCallback(async () => {
    if (rest > 0) return; // Disabled when rest is active
    const savedDefault = await getAppSetting("rest_timer_default_seconds");
    const duration = savedDefault ? parseInt(savedDefault, 10) : DEFAULT_REST_SECONDS;
    onStartRest(isNaN(duration) || duration < 1 ? DEFAULT_REST_SECONDS : duration);
  }, [rest, onStartRest]);

  const handleRestTap = useCallback(() => {
    onDismissRest();
    setShowRestDone(false);
    if (restDoneTimerRef.current) {
      clearTimeout(restDoneTimerRef.current);
      restDoneTimerRef.current = null;
    }
  }, [onDismissRest]);

  const handleRestLongPress = useCallback(() => {
    breakdownSheetRef.current?.snapToIndex(0);
  }, []);

  const handleBreakdownDismiss = useCallback(() => {
    // no-op
  }, []);

  const handleBreakdownAdjust = useCallback((delta: number) => {
    if (delta === 0) return;
    const next = Math.min(600, Math.max(0, rest + delta));
    if (next === 0) onDismissRest();
    else onStartRest(next);
  }, [rest, onStartRest, onDismissRest]);

  const handleBreakdownCut = useCallback(() => {
    breakdownSheetRef.current?.close();
    onDismissRest();
  }, [onDismissRest]);

  // Load rest_show_breakdown setting (default on via !== "false").
  useEffect(() => {
    let cancelled = false;
    getAppSetting("rest_show_breakdown").then((v) => {
      if (!cancelled) setShowBreakdownChip(v !== "false");
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [rest]);

  const handleLongPress = useCallback(async () => {
    // Load current settings before opening picker
    const [vibrate, sound] = await Promise.all([
      getAppSetting("rest_timer_vibrate"),
      getAppSetting("rest_timer_sound"),
    ]);
    setVibrateSetting(vibrate !== "false");
    setSoundSetting(sound !== "false");
    setPickerVisible(true);
  }, []);

  // Open picker when externally requested (e.g., from toolbox sheet "Rest Settings")
  useEffect(() => {
    if (!pickerRequested) return;
    Promise.all([
      getAppSetting("rest_timer_vibrate"),
      getAppSetting("rest_timer_sound"),
    ]).then(([vibrate, sound]) => {
      setVibrateSetting(vibrate !== "false");
      setSoundSetting(sound !== "false");
      setPickerVisible(true);
    });
    onPickerDismissed?.();
  }, [pickerRequested, onPickerDismissed]);

  const handlePresetSelect = useCallback(async (seconds: number) => {
    setPickerVisible(false);
    await setAppSetting("rest_timer_default_seconds", String(seconds));
    onStartRest(seconds);
  }, [onStartRest]);

  const handleVibrateToggle = useCallback(async (value: boolean) => {
    setVibrateSetting(value);
    await setAppSetting("rest_timer_vibrate", String(value));
  }, []);

  const handleSoundToggle = useCallback(async (value: boolean) => {
    setSoundSetting(value);
    await setAppSetting("rest_timer_sound", String(value));
  }, []);

  const handlePickerDismiss = useCallback(() => {
    setPickerVisible(false);
  }, []);

  const isRestActive = rest > 0;

  // Adaptive chip rules (plan §UX):
  // - suppressed when breakdown.isDefault === true
  // - suppressed when user turned off rest_show_breakdown
  // - below 360dp viewport, truncate to 2 tokens max (split on · then take 2)
  const hasAdaptiveBreakdown = !!breakdown && !breakdown.isDefault && !!breakdown.reasonShort;
  const renderChip = isRestActive && hasAdaptiveBreakdown && showBreakdownChip;
  const chipLabel = renderChip
    ? truncateChipLabel(breakdown?.reasonShort ?? "", viewportWidth)
    : "";

  const activeA11yLabel = buildActiveA11yLabel(rest, showRestDone, hasAdaptiveBreakdown, breakdown);

  return (
    <>
      <View style={styles.container}>
        {/* Inline adaptive chip — left of the timer pill */}
        {renderChip && (
          <View style={styles.chipWrap} accessibilityElementsHidden importantForAccessibility="no">
            <Chip
              selected={false}
              onPress={handleRestLongPress}
              compact
              accessibilityLabel={`Adaptive rest reason: ${chipLabel}. Tap to see breakdown.`}
              accessibilityRole="button"
            >
              {chipLabel}
            </Chip>
          </View>
        )}
        {/* Rest countdown or "REST DONE ✓" */}
        {(isRestActive || showRestDone) && (
          <Pressable
            onPress={handleRestTap}
            onLongPress={hasAdaptiveBreakdown ? handleRestLongPress : undefined}
            delayLongPress={400}
            accessibilityLabel={activeA11yLabel}
            accessibilityLiveRegion="polite"
            style={styles.timerButton}
          >
            <Text
              variant="body"
              style={{
                color: colors.primary,
                fontWeight: "700",
                fontSize: fontSizes.base,
              }}
            >
              {showRestDone
                ? "REST DONE ✓"
                : `${String(Math.floor(rest / 60)).padStart(2, "0")}:${String(rest % 60).padStart(2, "0")}`}
            </Text>
          </Pressable>
        )}

        {/* Elapsed time + remaining estimate */}
        <Pressable
          onPress={handleElapsedTap}
          onLongPress={handleLongPress}
          delayLongPress={400}
          disabled={isRestActive}
          accessibilityLabel={
            (() => {
              const remainingText = formatTimeRemaining(estimatedDuration ?? null, elapsed);
              const base = `Elapsed time: ${formatTime(elapsed)}`;
              if (isRestActive) return base;
              const suffix = ". Tap to start rest timer. Long press for rest settings.";
              if (remainingText) return `${base}, approximately ${Math.ceil(((estimatedDuration ?? 0) - elapsed) / 60)} minutes remaining${suffix}`;
              return `${base}${suffix}`;
            })()
          }
          accessibilityRole="button"
          style={styles.elapsedButton}
        >
          <Text
            variant="body"
            style={{
              color: isRestActive ? colors.onSurfaceVariant : colors.primary,
              fontSize: fontSizes.sm,
            }}
          >
            {formatTime(elapsed)}
          </Text>
          {(() => {
            const remainingText = formatTimeRemaining(estimatedDuration ?? null, elapsed);
            if (!remainingText) return null;
            return (
              <Text
                variant="body"
                style={{
                  color: colors.onSurfaceVariant,
                  fontSize: fontSizes.xs,
                }}
              >
                {remainingText}
              </Text>
            );
          })()}
        </Pressable>

        {/* Wrench / toolbox button */}
        <Pressable
          onPress={onOpenToolbox}
          accessibilityLabel="Open workout toolbox"
          accessibilityRole="button"
          style={styles.toolboxButton}
        >
          <MaterialCommunityIcons
            name="wrench"
            size={22}
            color={colors.onSurfaceVariant}
          />
        </Pressable>
      </View>

      {/* Duration Picker Modal */}
      <RestDurationPicker
        visible={pickerVisible}
        vibrateSetting={vibrateSetting}
        soundSetting={soundSetting}
        onSelectPreset={handlePresetSelect}
        onVibrateToggle={handleVibrateToggle}
        onSoundToggle={handleSoundToggle}
        onDismiss={handlePickerDismiss}
      />

      {/* Adaptive rest breakdown sheet */}
      {breakdown ? (
        <RestBreakdownSheet
          sheetRef={breakdownSheetRef}
          breakdown={breakdown}
          remainingSeconds={rest}
          onAddTime={handleBreakdownAdjust}
          onCutShort={handleBreakdownCut}
          onDismiss={handleBreakdownDismiss}
        />
      ) : null}
    </>
  );
}

type PickerProps = {
  visible: boolean;
  vibrateSetting: boolean;
  soundSetting: boolean;
  onSelectPreset: (seconds: number) => void;
  onVibrateToggle: (value: boolean) => void;
  onSoundToggle: (value: boolean) => void;
  onDismiss: () => void;
};

function RestDurationPicker({
  visible,
  vibrateSetting,
  soundSetting,
  onSelectPreset,
  onVibrateToggle,
  onSoundToggle,
  onDismiss,
}: PickerProps) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.modalOverlay} onPress={onDismiss} accessibilityLabel="Dismiss rest settings" accessibilityRole="button">
        <Pressable
          style={[styles.pickerContainer, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
        >
          <Text
            variant="subtitle"
            style={{ color: colors.onSurface, marginBottom: 16 }}
          >
            Rest Duration
          </Text>

          <View style={styles.presetsRow}>
            {REST_PRESETS.map((seconds) => (
              <Chip
                key={seconds}
                selected={false}
                onPress={() => onSelectPreset(seconds)}
                accessibilityRole="button"
                accessibilityLabel={`Start ${presetLabel(seconds)} rest timer`}
              >
                {presetLabel(seconds)}
              </Chip>
            ))}
          </View>

          <View style={styles.settingRow}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
              Vibrate on complete
            </Text>
            <Switch
              value={vibrateSetting}
              onValueChange={onVibrateToggle}
              trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
            />
          </View>

          <View style={styles.settingRow}>
            <Text variant="body" style={{ color: colors.onSurface, flex: 1 }}>
              Sound on complete
            </Text>
            <Switch
              value={soundSetting}
              onValueChange={onSoundToggle}
              trackColor={{ false: colors.surfaceVariant, true: colors.primary }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const SessionHeaderToolbar = React.memo(SessionHeaderToolbarInner);

function truncateChipLabel(label: string, viewportWidth: number): string {
  if (viewportWidth >= 360) return label;
  const tokens = label.split(/\s*·\s*/);
  if (tokens.length <= 2) return label;
  return tokens.slice(0, 2).join(" · ");
}

function buildActiveA11yLabel(
  rest: number,
  showRestDone: boolean,
  hasAdaptiveBreakdown: boolean,
  breakdown: RestBreakdown | undefined,
): string {
  if (showRestDone) return "Rest complete. Tap to dismiss.";
  const min = Math.floor(rest / 60);
  const sec = rest % 60;
  const base = `Rest timer: ${min} minutes ${sec} seconds. Tap to dismiss.`;
  if (hasAdaptiveBreakdown && breakdown?.reasonAccessible) {
    return `Rest timer: ${min} minutes ${sec} seconds. ${breakdown.reasonAccessible}. Tap to dismiss. Long-press for breakdown.`;
  }
  return base;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  chipWrap: {
    marginRight: 2,
  },
  timerButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  elapsedButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  toolboxButton: {
    minWidth: 56,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerContainer: {
    borderRadius: 16,
    padding: 24,
    minWidth: 280,
    maxWidth: 340,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  presetsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
});
