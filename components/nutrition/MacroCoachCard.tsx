/**
 * MacroCoachCard — weekly advisory card for the Adaptive Macro Coach.
 *
 * PROHIBITION: No celebration-of-direction copy in this component.
 * No green-down / red-up color coding. Direction is conveyed by the literal
 * numeric value ONLY. Both deficit and surplus suggestions render in identical
 * neutral chrome. (Psych verdict 076d3d4c §5, §10)
 *
 * This is enforced here at the code level. QD PR-review checklist also verifies
 * this on each PR that touches this file.
 */

import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ScrollView,
  AccessibilityInfo,
} from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { useThemeColors } from "@/hooks/useThemeColors";
import { updateMacroTargets } from "@/lib/db";
import { recomputeMacrosFromCalories } from "@/lib/nutrition-calc";
import {
  setLastDismissedAt,
  getDismissalCount,
  setDismissalCount,
  resetDismissalCount,
  setPausedUntil,
  setRightWhyEntry,
  setDeficitSuppressedUntil,
  type RightWhyAnswer,
} from "@/lib/db/macro-coach-settings";
import { clearMacroCoachMemo } from "@/lib/db/macro-coach";
import type { CoachSuggestion } from "@/lib/macro-coach";

// ─── Props ────────────────────────────────────────────────────────────────────

interface MacroCoachCardProps {
  suggestion: CoachSuggestion;
  infoOnly?: boolean;            // true when mode=info_only or Drained-suppression active
  weekLabel: string;             // e.g. "week of May 4–10"
  onDismiss?: () => void;        // called after any card action
  userWeightKg: number;
  /** ISO date of the previous accepted suggestion, if any */
  lastAcceptedDate?: string;
  /** kcal target accepted last Sunday (for post-decision check-in) */
  lastAcceptedTarget?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roundTo50(n: number): number {
  return Math.round(n / 50) * 50;
}

// ─── Component ────────────────────────────────────────────────────────────────

// eslint-disable-next-line complexity -- advisory card has several UI state branches by design
export function MacroCoachCard({
  suggestion,
  infoOnly = false,
  weekLabel,
  onDismiss,
  userWeightKg,
  lastAcceptedDate,
  lastAcceptedTarget,
}: MacroCoachCardProps) {
  const colors = useThemeColors();

  const [rightWhy, setRightWhy] = useState<RightWhyAnswer | null>(null);
  const [showSetOwn, setShowSetOwn] = useState(false);
  const [customKcal, setCustomKcal] = useState("");
  const [showPausePrompt, setShowPausePrompt] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const showPostDecisionCheckin = Boolean(lastAcceptedDate && lastAcceptedTarget);
  const suggTarget = roundTo50(suggestion.suggestedTarget);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleUseThisNumber() {
    if (rightWhy === null && !infoOnly) return; // require Right Why first
    const macros = recomputeMacrosFromCalories(suggTarget, userWeightKg);
    await updateMacroTargets(
      suggTarget,
      macros.protein_g,
      macros.carbs_g,
      macros.fat_g,
    );
    const nowIso = new Date().toISOString().slice(0, 10);
    if (rightWhy) await setRightWhyEntry(nowIso, rightWhy);
    await resetDismissalCount();
    clearMacroCoachMemo();
    setSubmitted(true);
    onDismiss?.();
    AccessibilityInfo.announceForAccessibility(`Target updated to ${suggTarget} calories per day.`);
  }

  async function handleSetOwn() {
    const parsed = parseInt(customKcal, 10);
    if (isNaN(parsed) || parsed < 500) return;
    const clamped = Math.max(parsed, suggestion.floorActive ? suggestion.suggestedTarget : parsed);
    const macros = recomputeMacrosFromCalories(clamped, userWeightKg);
    await updateMacroTargets(clamped, macros.protein_g, macros.carbs_g, macros.fat_g);
    const nowIso = new Date().toISOString().slice(0, 10);
    if (rightWhy) await setRightWhyEntry(nowIso, rightWhy);
    await resetDismissalCount();
    clearMacroCoachMemo();
    setShowSetOwn(false);
    setSubmitted(true);
    onDismiss?.();
  }

  async function handleNotThisWeek() {
    const count = await getDismissalCount();
    const newCount = count + 1;
    await setDismissalCount(newCount);
    await setLastDismissedAt(Date.now());
    clearMacroCoachMemo();
    if (newCount >= 2) setShowPausePrompt(true);
    else onDismiss?.();
  }

  async function handlePause1Month() {
    const until = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await setPausedUntil(until);
    clearMacroCoachMemo();
    setShowPausePrompt(false);
    onDismiss?.();
  }

  async function handlePostDecisionDrained() {
    const until = Date.now() + 14 * 24 * 60 * 60 * 1000;
    await setDeficitSuppressedUntil(until);
    clearMacroCoachMemo();
    onDismiss?.();
  }

  if (submitted) return null;

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <Card style={[styles.card, { backgroundColor: colors.surface }]}>
      <CardContent>
        {/* Header */}
        <View style={styles.headerRow}>
          <Text
            variant="subtitle"
            style={{ color: colors.onSurface, flex: 1 }}
            accessibilityRole="header"
          >
            Macro Coach — {weekLabel}
          </Text>
          <TouchableOpacity
            onPress={() => setShowInfo(true)}
            accessibilityLabel="How this is computed"
            hitSlop={8}
          >
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>ⓘ</Text>
          </TouchableOpacity>
        </View>

        <Text variant="body" style={[styles.tagline, { color: colors.onSurfaceVariant }]}>
          Here&apos;s what your data suggests. You set your target.
        </Text>

        {/* Post-decision check-in */}
        {showPostDecisionCheckin && lastAcceptedTarget && (
          <View style={styles.section}>
            <Text variant="body" style={{ color: colors.onSurface }}>
              Last Sunday you set {roundTo50(lastAcceptedTarget).toLocaleString()} kcal/day. How did the week feel?
            </Text>
            <RightWhyButtons
              selected={rightWhy}
              onSelect={async (answer) => {
                setRightWhy(answer);
                if (answer === "drained") await handlePostDecisionDrained();
              }}
              colors={colors}
            />
          </View>
        )}

        {/* Data summary */}
        <View style={styles.section}>
          <DataRow label="Trend weight" value={`${suggestion.trendWeight.toFixed(1)} kg`} colors={colors} />
          <DataRow label="Avg intake this week" value={`~${suggestion.avgIntake.toLocaleString()} kcal/day`} colors={colors} />
          <DataRow
            label="Estimated TDEE"
            value={`~${suggestion.estimatedTDEELow.toLocaleString()}–${suggestion.estimatedTDEEHigh.toLocaleString()} kcal`}
            colors={colors}
          />
        </View>

        {/* Suggestion */}
        {!infoOnly && suggestion.stabilityClass !== "stable" && (
          <View style={styles.section}>
            <Text variant="subtitle" style={{ color: colors.onSurface }}>
              Suggested target:{" "}
              <Text variant="subtitle" style={{ color: colors.onSurface }}>
                {suggTarget.toLocaleString()} kcal/day
              </Text>
            </Text>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              (you&apos;re currently at {suggestion.currentTarget.toLocaleString()})
            </Text>
            {suggestion.floorActive && (
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                Held at your safety floor ({suggTarget.toLocaleString()} kcal).
              </Text>
            )}
            {suggestion.capActive && (
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                Limited to ±300 kcal/week.
              </Text>
            )}
          </View>
        )}

        {suggestion.stabilityClass === "stable" && (
          <View style={styles.section}>
            <Text variant="body" style={{ color: colors.onSurface }}>
              Weight stable — no change suggested.
            </Text>
          </View>
        )}

        {infoOnly && (
          <View style={styles.section}>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              Showing TDEE info only this week.
            </Text>
          </View>
        )}

        {/* Right Why prompt (only in full mode, non-stable) */}
        {!infoOnly && !showPostDecisionCheckin && suggestion.stabilityClass !== "stable" && (
          <View style={styles.section}>
            <Text variant="body" style={{ color: colors.onSurface }}>
              How did your training feel this week?
            </Text>
            <RightWhyButtons selected={rightWhy} onSelect={setRightWhy} colors={colors} />
          </View>
        )}

        {/* Action buttons */}
        {!infoOnly && suggestion.stabilityClass !== "stable" && (
          <View style={styles.actionRow}>
            <ActionButton
              label="Use this number"
              onPress={handleUseThisNumber}
              disabled={rightWhy === null}
              primary
              colors={colors}
              accessibilityHint={rightWhy === null ? "Select how training felt first" : undefined}
            />
            <ActionButton
              label="Set my own"
              onPress={() => setShowSetOwn(true)}
              colors={colors}
            />
            <ActionButton
              label="Not this week"
              onPress={handleNotThisWeek}
              colors={colors}
            />
          </View>
        )}

        {/* Mastery overlay */}
        <View style={styles.masteryRow}>
          <Text
            variant="caption"
            style={{ color: colors.onSurfaceVariant, fontStyle: "italic" }}
            accessibilityLabel={`Logging consistency this month: ${suggestion.loggingConsistencyDays} of 30 days. That consistency is doing more for you than any number on this card.`}
          >
            Logging consistency this month: {suggestion.loggingConsistencyDays}/30 days.{"\n"}
            That consistency is doing more for you than any number on this card.
          </Text>
        </View>

        {/* Set my own modal */}
        <Modal visible={showSetOwn} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
              <Text variant="subtitle" style={{ color: colors.onSurface }}>
                Enter your target (kcal/day)
              </Text>
              <TextInput
                style={[styles.textInput, { color: colors.onSurface, borderColor: colors.onSurfaceVariant }]}
                keyboardType="number-pad"
                value={customKcal}
                onChangeText={setCustomKcal}
                placeholder="e.g. 2100"
                placeholderTextColor={colors.onSurfaceVariant}
                accessibilityLabel="Enter calorie target"
                allowFontScaling
                maxLength={5}
              />
              <View style={styles.actionRow}>
                <ActionButton label="Confirm" onPress={handleSetOwn} primary colors={colors} />
                <ActionButton label="Cancel" onPress={() => setShowSetOwn(false)} colors={colors} />
              </View>
            </View>
          </View>
        </Modal>

        {/* Pause prompt (after 2nd consecutive Not this week) */}
        {showPausePrompt && (
          <View style={[styles.section, { borderTopWidth: 1, borderTopColor: colors.onSurfaceVariant + "30" }]}>
            <Text variant="body" style={{ color: colors.onSurface }}>
              You&apos;ve passed twice. Want to pause this for a while?
            </Text>
            <TouchableOpacity
              onPress={handlePause1Month}
              style={styles.pauseButton}
              accessibilityLabel="Pause coach for 1 month"
              accessibilityRole="button"
            >
              <Text variant="body" style={{ color: colors.onSurface }}>
                Pause 1 month
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDismiss} accessibilityLabel="Dismiss" hitSlop={8}>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                No thanks, just hide for now
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Info explainer modal */}
        <Modal visible={showInfo} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <ScrollView>
              <View style={[styles.modalBox, { backgroundColor: colors.surface }]}>
                <Text variant="subtitle" style={{ color: colors.onSurface }}>
                  How this is computed
                </Text>
                <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
                  Your trend weight is an exponentially-weighted moving average (EWMA) of your
                  daily weigh-ins. This smooths out water-weight fluctuations so that one
                  heavy day doesn&apos;t distort your estimate.
                </Text>
                <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
                  Your estimated TDEE uses the energy-balance equation: if you ate an average
                  of X kcal/day and your weight changed by ΔW kg over 14 days, then your TDEE
                  ≈ X + (ΔW × 7700) / 14. Note: lean-tissue gain on a bulk will slightly
                  underestimate TDEE.
                </Text>
                <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
                  All numbers are rounded to the nearest 50 kcal. TDEE is shown as a range
                  (±125 kcal) to reflect real-world estimation uncertainty.
                </Text>
                <Text variant="body" style={{ color: colors.onSurfaceVariant, marginTop: 8 }}>
                  This is advisory only. The target is never changed without your tap.
                  You can disable this in Settings → Nutrition → Adaptive Macro Coach.
                </Text>
                <TouchableOpacity
                  onPress={() => setShowInfo(false)}
                  style={styles.pauseButton}
                  accessibilityLabel="Close"
                  accessibilityRole="button"
                >
                  <Text variant="body" style={{ color: colors.onSurface }}>
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </Modal>
      </CardContent>
    </Card>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function DataRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={styles.dataRow}>
      <Text variant="caption" style={{ color: colors.onSurfaceVariant, flex: 1 }} allowFontScaling>
        {label}
      </Text>
      <Text
        variant="body"
        style={{ color: colors.onSurface }}
        accessibilityLabel={`${label}: ${value}`}
        allowFontScaling
      >
        {value}
      </Text>
    </View>
  );
}

function RightWhyButtons({
  selected,
  onSelect,
  colors,
}: {
  selected: RightWhyAnswer | null;
  onSelect: (a: RightWhyAnswer) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const options: Array<{ key: RightWhyAnswer; label: string }> = [
    { key: "strong", label: "Strong" },
    { key: "ok", label: "OK" },
    { key: "drained", label: "Drained" },
  ];
  return (
    <View style={styles.rightWhyRow}>
      {options.map(({ key, label }) => (
        <TouchableOpacity
          key={key}
          onPress={() => onSelect(key)}
          style={[
            styles.rightWhyBtn,
            {
              borderColor: selected === key ? colors.onSurface : colors.onSurfaceVariant,
              backgroundColor: selected === key ? colors.onSurface + "20" : "transparent",
            },
          ]}
          accessibilityLabel={`${label} — log how training felt this week`}
          accessibilityRole="button"
          accessibilityState={{ selected: selected === key }}
        >
          <Text variant="body" style={{ color: colors.onSurface }} allowFontScaling>
            {label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  primary = false,
  disabled = false,
  colors,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  colors: ReturnType<typeof useThemeColors>;
  accessibilityHint?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionBtn,
        {
          backgroundColor: primary ? colors.onSurface : "transparent",
          borderColor: colors.onSurface,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
    >
      <Text
        variant="body"
        style={{ color: primary ? colors.surface : colors.onSurface }}
        allowFontScaling
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: { borderRadius: 12, marginVertical: 8 },
  headerRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  tagline: { marginBottom: 12, fontStyle: "italic" },
  section: { marginBottom: 12 },
  dataRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  rightWhyRow: { flexDirection: "row", gap: 8, marginTop: 8 },
  rightWhyBtn: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
  },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  actionBtn: {
    flex: 1,
    minWidth: 80,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
  },
  masteryRow: { marginTop: 12, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#80808040" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 16,
  },
  modalBox: { borderRadius: 12, padding: 20, gap: 12 },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    marginVertical: 8,
  },
  pauseButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
});
