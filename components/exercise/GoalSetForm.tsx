import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useToast } from "@/components/ui/bna-toast";
import { toDisplay, toKg } from "@/lib/units";
import { fontSizes, spacing } from "@/constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getAppSetting } from "@/lib/db";
import { resolveStep } from "@/lib/weightStep";
import { t } from "@lingui/core/macro";
import type { StrengthGoalRow, CreateGoalInput, UpdateGoalInput } from "@/lib/db";
import NumericStepper from "./NumericStepper";

type Props = {
  isVisible: boolean;
  onClose: () => void;
  exerciseId: string;
  isBodyweight: boolean;
  unit: "kg" | "lb";
  existingGoal?: StrengthGoalRow | null;
  onCreate: (input: CreateGoalInput) => Promise<void>;
  onUpdate: (goalId: string, updates: UpdateGoalInput) => Promise<void>;
};

export default function GoalSetForm({
  isVisible, onClose, exerciseId, isBodyweight, unit,
  existingGoal, onCreate, onUpdate,
}: Props) {
  const colors = useThemeColors();
  const { toast } = useToast();
  const isEditing = existingGoal != null;

  const getInitialValue = () => {
    if (!existingGoal) return isBodyweight ? 10 : (unit === "lb" ? 135 : 60);
    if (isBodyweight) return existingGoal.target_reps ?? 10;
    return toDisplay(existingGoal.target_weight ?? 60, unit);
  };

  const [targetValue, setTargetValue] = useState(getInitialValue);
  const [deadline, setDeadline] = useState<string | null>(existingGoal?.deadline ?? null);
  const [saving, setSaving] = useState(false);
  const [weightStep, setWeightStep] = useState<number>(unit === "lb" ? 5 : 2.5);

  React.useEffect(() => {
    let cancelled = false;
    if (typeof getAppSetting === "function") {
      getAppSetting("session.weightStep").then((val) => {
        if (cancelled) return;
        setWeightStep(resolveStep(val, unit));
      }).catch(() => {});
    }
    return () => { cancelled = true; };
  }, [unit, isVisible]);

  // Reset state when the sheet opens with new data
  React.useEffect(() => {
    if (isVisible) {
      // Intentional on-visible reset of the form to the incoming goal data —
      // runs only on the visible/goal-id change, not a render loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTargetValue(getInitialValue());
      setDeadline(existingGoal?.deadline ?? null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, existingGoal?.id]);

  const minValue = isBodyweight ? 1 : (unit === "lb" ? 1 : 0.5);
  const step = isBodyweight ? 1 : weightStep;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      if (isEditing && existingGoal) {
        const updates: UpdateGoalInput = { deadline };
        if (isBodyweight) {
          updates.targetReps = targetValue;
          updates.targetWeight = null;
        } else {
          updates.targetWeight = toKg(targetValue, unit);
          updates.targetReps = null;
        }
        await onUpdate(existingGoal.id, updates);
      } else {
        const input: CreateGoalInput = {
          exerciseId,
          deadline,
        };
        if (isBodyweight) {
          input.targetReps = targetValue;
        } else {
          input.targetWeight = toKg(targetValue, unit);
        }
        await onCreate(input);
      }
      onClose();
    } catch {
      toast({ description: t({ id: "components.exercise.goal-set-form.save-error", message: "Failed to save goal. Please try again." }) });
    } finally {
      setSaving(false);
    }
  }, [isEditing, existingGoal, exerciseId, isBodyweight, targetValue, deadline, unit, onCreate, onUpdate, onClose, toast]);

  const deadlineOptions = React.useMemo(() => {
    const opts: { label: string; value: string | null }[] = [{ label: t({ id: "components.exercise.goal-set-form.no-deadline", message: "No deadline" }), value: null }];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      // Last day of the target month (day 0 of next month = last day of current month)
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 0);
      const label = d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
      opts.push({ label, value: d.toISOString().slice(0, 10) });
    }
    return opts;
  }, []);

  return (
    <BottomSheet
      isVisible={isVisible}
      onClose={onClose}
      title={isEditing ? t({ id: "components.exercise.goal-set-form.edit-title", message: "Edit Goal" }) : t({ id: "components.exercise.goal-set-form.set-title", message: "Set Goal" })}
      snapPoints={[0.45]}
    >
      <View style={styles.container}>
        <Text style={{ color: colors.onSurface, fontSize: fontSizes.base, fontWeight: "600", marginBottom: spacing.sm }}>
          {isBodyweight ? t({ id: "components.exercise.goal-set-form.target-reps", message: "Target Reps" }) : t({ id: "components.exercise.goal-set-form.target-weight", message: `Target Weight (${unit})` })}
        </Text>

        <NumericStepper
          value={targetValue}
          onValueChange={setTargetValue}
          min={minValue}
          step={step}
          unit={isBodyweight ? "reps" : unit}
        />

        <Text style={{ color: colors.onSurface, fontSize: fontSizes.base, fontWeight: "600", marginTop: spacing.lg, marginBottom: spacing.sm }}>
          {t({ id: "components.exercise.goal-set-form.deadline", message: "Deadline (optional)" })}
        </Text>

        <View style={styles.deadlineRow}>
          {deadlineOptions.slice(0, 5).map((opt) => (
            <Button
              key={opt.value ?? "none"}
              variant={deadline === opt.value ? "default" : "outline"}
              onPress={() => setDeadline(opt.value)}
              label={opt.label}
              style={styles.deadlineButton}
            />
          ))}
        </View>

        <Button
          variant="default"
          onPress={handleSave}
          label={saving ? t({ id: "components.exercise.goal-set-form.saving", message: "Saving..." }) : (isEditing ? t({ id: "components.exercise.goal-set-form.update", message: "Update Goal" }) : t({ id: "components.exercise.goal-set-form.save", message: "Save Goal" }))}
          disabled={saving || targetValue < minValue}
          style={styles.saveButton}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  deadlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  deadlineButton: {
    marginBottom: 4,
  },
  saveButton: {
    marginTop: 24,
  },
});
