import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Text } from "@/components/ui/text";
import { Button } from "@/components/ui/button";
import { useThemeColors } from "@/hooks/useThemeColors";
import { fontSizes } from "@/constants/design-tokens";
import { getAppSetting, setAppSetting } from "../../lib/db";
import type { RestBreakdown } from "../../lib/rest";

type Props = {
  sheetRef: React.RefObject<BottomSheet | null>;
  breakdown: RestBreakdown;
  remainingSeconds: number;
  onAddTime: (delta: number) => void;
  onCutShort: () => void;
  onEditRules?: () => void;
  onDismiss?: () => void;
};

function formatMMSS(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function formatDelta(delta: number): string {
  if (delta === 0) return "+0s";
  if (delta > 0) return `+${delta}s`;
  return `${delta}s`;
}

export function RestBreakdownSheet({
  sheetRef,
  breakdown,
  remainingSeconds,
  onAddTime,
  onCutShort,
  onEditRules,
  onDismiss,
}: Props) {
  const colors = useThemeColors();
  const snapPoints = useMemo(() => ["50%"], []);
  const [showExplainer, setShowExplainer] = useState(false);
  const explainerPersistedRef = useRef(false);

  // First-open explainer is gated by rest_adaptive_sheet_seen (default "false").
  const handleChange = useCallback(async (index: number) => {
    if (index < 0) return;
    try {
      const seen = await getAppSetting("rest_adaptive_sheet_seen");
      if (seen !== "true") {
        setShowExplainer(true);
        if (!explainerPersistedRef.current) {
          explainerPersistedRef.current = true;
          await setAppSetting("rest_adaptive_sheet_seen", "true");
        }
      } else {
        setShowExplainer(false);
      }
    } catch {
      // Silent — sheet still usable without the explainer.
    }
  }, []);

  useEffect(() => {
    // Reset explainer visibility each mount so dismiss+reopen re-evaluates the flag.
    explainerPersistedRef.current = false;
  }, []);

  const maxBar = Math.max(
    breakdown.baseSeconds,
    breakdown.totalSeconds,
    ...breakdown.factors.map((f) => Math.abs(f.deltaSeconds)),
    1,
  );

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
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} pressBehavior="close" />
      )}
      backgroundStyle={{ backgroundColor: colors.surface }}
      handleIndicatorStyle={{ backgroundColor: colors.onSurfaceVariant }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.content}>
        <Text
          variant="subtitle"
          style={{ color: colors.onSurface, marginBottom: 4 }}
          accessibilityRole="header"
        >
          {formatMMSS(remainingSeconds)} rest
        </Text>
        {breakdown.reasonAccessible ? (
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, marginBottom: 12, fontSize: fontSizes.sm }}
          >
            {breakdown.reasonAccessible}
          </Text>
        ) : null}

        {showExplainer ? (
          <View
            style={[
              styles.explainer,
              { backgroundColor: colors.surfaceVariant, borderColor: colors.outline },
            ]}
            accessibilityRole="text"
          >
            <Text
              variant="caption"
              style={{ color: colors.onSurfaceVariant, fontSize: fontSizes.sm, lineHeight: 20 }}
            >
              CableSnap adapts your rest by set type, RPE, and equipment. These
              defaults are a starting point — tap any number to override.
            </Text>
          </View>
        ) : null}

        {/* Additive bars: Base + each non-default factor = Total */}
        <View style={styles.breakdownBlock}>
          <BreakdownRow
            label="Base"
            seconds={breakdown.baseSeconds}
            isDelta={false}
            maxBar={maxBar}
            colors={colors}
          />
          {breakdown.factors.map((f, i) => (
            <BreakdownRow
              key={`${f.label}-${i}`}
              label={f.label}
              seconds={f.deltaSeconds}
              isDelta
              deltaText={formatDelta(f.deltaSeconds)}
              maxBar={maxBar}
              colors={colors}
            />
          ))}
          <View style={[styles.totalRow, { borderTopColor: colors.outline }]}>
            <Text variant="body" style={{ color: colors.onSurface, fontWeight: "700", flex: 1 }}>
              Total
            </Text>
            <Text variant="body" style={{ color: colors.primary, fontWeight: "700" }}>
              {formatMMSS(breakdown.totalSeconds)} · {breakdown.totalSeconds}s
            </Text>
          </View>
        </View>

        {/* Controls — reuse of existing manual override affordances */}
        <View style={styles.controlsRow}>
          <Button
            variant="outline"
            onPress={() => onAddTime(-30)}
            label="−30s"
            accessibilityLabel="Subtract 30 seconds from rest"
          />
          <Button
            variant="outline"
            onPress={() => onAddTime(30)}
            label="+30s"
            accessibilityLabel="Add 30 seconds to rest"
          />
          <Button
            variant="ghost"
            onPress={onCutShort}
            label="Cut short"
            accessibilityLabel="End rest now"
          />
        </View>

        {onEditRules ? (
          <Button
            variant="ghost"
            onPress={onEditRules}
            label="Edit adaptive rules…"
            accessibilityLabel="Edit adaptive rest timer rules"
          />
        ) : null}
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

type RowProps = {
  label: string;
  seconds: number;
  isDelta: boolean;
  deltaText?: string;
  maxBar: number;
  colors: ReturnType<typeof useThemeColors>;
};

function BreakdownRow({ label, seconds, isDelta, deltaText, maxBar, colors }: RowProps) {
  const pct = Math.min(100, Math.max(0, (Math.abs(seconds) / maxBar) * 100));
  const barColor = isDelta
    ? seconds < 0
      ? colors.onSurfaceVariant
      : colors.primary
    : colors.secondary;
  return (
    <View style={styles.row}>
      <Text
        variant="body"
        style={{ color: colors.onSurface, flex: 1, fontSize: fontSizes.sm }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.barContainer}>
        <View
          style={[styles.bar, { width: `${pct}%`, backgroundColor: barColor }]}
        />
      </View>
      <Text
        variant="body"
        style={{
          color: colors.onSurfaceVariant,
          minWidth: 52,
          textAlign: "right",
          fontSize: fontSizes.sm,
        }}
      >
        {isDelta ? (deltaText ?? formatDelta(seconds)) : `${seconds}s`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 28,
  },
  explainer: {
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  breakdownBlock: {
    marginBottom: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  barContainer: {
    flex: 2,
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 4,
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 10,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
});
