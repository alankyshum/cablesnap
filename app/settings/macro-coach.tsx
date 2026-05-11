/* eslint-disable max-lines-per-function */
import React, { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useToast } from "@/components/ui/bna-toast";
import { spacing, radii } from "@/constants/design-tokens";
import {
  getEnabled,
  getMode,
  getFloorKcal,
  getPausedUntil,
  getScreeningCompletedAt,
  getIdentitySentence,
  getIfThenChoice,
  setEnabled,
  setMode,
  setFloorKcalOverride,
  setIdentitySentence,
  setIfThenChoice,
  setScreeningAnswer,
  setPausedUntil,
  computeSafetyFloor,
  type CoachMode,
  type IfThenChoice,
  type ScoffAnswer,
  type UserFloorProfile,
} from "@/lib/db/macro-coach-settings";
import { clearMacroCoachMemo } from "@/lib/db/macro-coach";
import { getAppSetting } from "@/lib/db";
import { convertToMetric, migrateProfile } from "@/lib/nutrition-calc";
import { safeParse } from "@/lib/safe-parse";

// ─── Screens ─────────────────────────────────────────────────────────────────

type ScreenState =
  | "main"
  | "opt-in-disclosure"
  | "opt-in-scoff"
  | "opt-in-routing"
  | "opt-in-identity";

export default function MacroCoachSettingsScreen() {
  const colors = useThemeColors();
  const toast = useToast();

  const [screen, setScreen] = useState<ScreenState>("main");
  const [enabled, setEnabledState] = useState(false);
  const [mode, setModeState] = useState<CoachMode>("info_only");
  const [floorKcal, setFloorKcalState] = useState<number | null>(null);
  const [computedFloor, setComputedFloor] = useState<number | null>(null);
  const [pausedUntil, setPausedUntilState] = useState<number | null>(null);
  const [nowMs] = useState(() => Date.now());
  const [screeningDone, setScreeningDone] = useState(false);
  const [identitySentence, setIdentitySentenceState] = useState<string | null>(null);
  const [floorInput, setFloorInput] = useState("");
  const [userFloorProfile, setUserFloorProfile] = useState<UserFloorProfile | null>(null);

  // opt-in flow state
  const [scoffAnswer, setScoffAnswer] = useState<ScoffAnswer | null>(null);
  const [identityDraft, setIdentityDraft] = useState("");
  const [ifThenDraft, setIfThenDraft] = useState<IfThenChoice | null>(null);

  const load = useCallback(async () => {
    const [en, md, pausedRaw, screeningTs, identity, ifThenChoice] = await Promise.all([
      getEnabled(),
      getMode(),
      getPausedUntil(),
      getScreeningCompletedAt(),
      getIdentitySentence(),
      getIfThenChoice(),
    ]);

    const profile = await loadUserFloorProfile();
    setUserFloorProfile(profile);

    const floor = profile ? await getFloorKcal(profile) : null;
    const computed = profile ? computeSafetyFloor(profile) : null;

    setEnabledState(en);
    setModeState(md);
    setPausedUntilState(pausedRaw);
    setScreeningDone(screeningTs !== null);
    setIdentitySentenceState(identity);
    void ifThenChoice; // loaded but displayed via identity sentence only
    setFloorKcalState(floor);
    setComputedFloor(computed);
    if (floor !== null) setFloorInput(String(floor));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // ─── Handlers ──────────────────────────────────────────────────────────────

  async function handleToggleEnabled(newValue: boolean) {
    if (newValue && !screeningDone) {
      // First opt-in → disclosure flow
      setScreen("opt-in-disclosure");
      return;
    }
    await setEnabled(newValue);
    clearMacroCoachMemo();
    setEnabledState(newValue);
    toast.info(newValue ? "Macro Coach enabled." : "Macro Coach disabled.");
  }

  async function handleModeChange(newMode: CoachMode) {
    await setMode(newMode);
    clearMacroCoachMemo();
    setModeState(newMode);
  }

  async function handleFloorSave() {
    const parsed = parseInt(floorInput, 10);
    if (isNaN(parsed)) {
      toast.error("Enter a valid number.");
      return;
    }
    if (!userFloorProfile) {
      toast.error("Profile not loaded.");
      return;
    }
    const computed = computeSafetyFloor(userFloorProfile);
    if (parsed < computed) {
      toast.error(`Floor cannot go below ${computed.toLocaleString()} kcal (your safety minimum).`);
      setFloorInput(String(floorKcal ?? computed));
      return;
    }
    await setFloorKcalOverride(parsed, userFloorProfile);
    clearMacroCoachMemo();
    setFloorKcalState(parsed);
    toast.info("Safety floor updated.");
  }

  async function handleResumePause() {
    await setPausedUntil(null);
    clearMacroCoachMemo();
    setPausedUntilState(null);
    toast.info("Macro Coach resumed.");
  }

  // ─── Opt-in flow ──────────────────────────────────────────────────────────

  function handleDisclosureContinue() { setScreen("opt-in-scoff"); }
  function handleDisclosureBack() { setScreen("main"); }

  function handleScoffAnswer(answer: ScoffAnswer) { setScoffAnswer(answer); setScreen("opt-in-routing"); }

  async function handleRouting(chosenMode: CoachMode) {
    const ans = scoffAnswer ?? "prefer_not_to_say";
    await setScreeningAnswer(ans, Date.now());
    await setMode(chosenMode);
    clearMacroCoachMemo();
    setScreen("opt-in-identity");
  }

  async function handleIdentityComplete() {
    if (identityDraft.trim()) await setIdentitySentence(identityDraft.trim());
    if (ifThenDraft) await setIfThenChoice(ifThenDraft);
    await setEnabled(true);
    clearMacroCoachMemo();
    setScreen("main");
    await load();
    toast.info("Adaptive Macro Coach enabled.");
  }

  function handleSkipIdentity() {
    handleIdentityComplete();
  }

  // ─── Screens ─────────────────────────────────────────────────────────────────

  if (screen === "opt-in-disclosure") {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "About Macro Coach" }} />
        <Text variant="heading" style={{ color: colors.onSurface, marginBottom: 16 }}>
          About Adaptive Macro Coach
        </Text>
        <Text variant="body" style={{ color: colors.onSurface, marginBottom: 12 }}>
          Every Sunday, this coach reviews your logged weight and food data to estimate your
          real-world calorie needs. It then suggests a weekly target adjustment — advisory only.
        </Text>
        <Text variant="body" style={{ color: colors.onSurface, marginBottom: 12 }}>
          It <Text variant="body" style={{ fontWeight: "700", color: colors.onSurface }}>never</Text> silently changes
          your targets. Every suggestion requires your tap to apply.
        </Text>
        <Text variant="body" style={{ color: colors.onSurface, marginBottom: 12 }}>
          Suggestions are bounded: ±300 kcal per week maximum, and never below your personal
          safety floor (based on your resting metabolic rate).
        </Text>
        <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 24, fontStyle: "italic" }}>
          If you have a history of disordered eating, we recommend keeping this off or
          using info-only mode. Talk to a clinician before adjusting calories.
        </Text>
        <OptionButton label="Next →" onPress={handleDisclosureContinue} primary colors={colors} />
        <OptionButton label="Go back" onPress={handleDisclosureBack} colors={colors} />
      </ScrollView>
    );
  }

  if (screen === "opt-in-scoff") {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "A quick question" }} />
        <Text variant="heading" style={{ color: colors.onSurface, marginBottom: 16 }}>
          One quick question
        </Text>
        <Text variant="body" style={{ color: colors.onSurface, marginBottom: 24 }}>
          Have you ever felt out of control around food, or worried about food or weight
          in a way that interfered with daily life?
        </Text>
        <OptionButton
          label="Yes"
          onPress={() => handleScoffAnswer("yes")}
          colors={colors}
          accessibilityLabel="Yes — food or weight has been a concern"
        />
        <OptionButton
          label="No"
          onPress={() => handleScoffAnswer("no")}
          colors={colors}
          accessibilityLabel="No — not been a concern"
        />
        <OptionButton
          label="Prefer not to say"
          onPress={() => handleScoffAnswer("prefer_not_to_say")}
          colors={colors}
          accessibilityLabel="Prefer not to say"
        />
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 16, fontStyle: "italic" }}>
          Your answer is stored only on your device. It guides which mode to suggest —
          you can always change your choice in Settings.
        </Text>
      </ScrollView>
    );
  }

  if (screen === "opt-in-routing") {
    const suggestInfoOnly = scoffAnswer === "yes" || scoffAnswer === "prefer_not_to_say";
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "Choose your mode" }} />
        <Text variant="heading" style={{ color: colors.onSurface, marginBottom: 16 }}>
          Choose how you&apos;d like to use this
        </Text>
        <Text variant="body" style={{ color: colors.onSurface, marginBottom: 24 }}>
          Both options give you weekly insight into your calorie needs. Neither is a dead end —
          you can change your preference any time in Settings.
        </Text>
        <OptionButton
          label="Use info-only mode"
          sublabel="See your weekly TDEE estimate — no target suggestions"
          onPress={() => handleRouting("info_only")}
          primary={suggestInfoOnly}
          colors={colors}
          accessibilityLabel="Use info-only mode — see TDEE estimate only"
        />
        <OptionButton
          label="Full mode"
          sublabel="Weekly target suggestions + TDEE estimate"
          onPress={() => handleRouting("full")}
          primary={!suggestInfoOnly}
          colors={colors}
          accessibilityLabel="Full mode — weekly target suggestions"
        />
        {scoffAnswer !== "no" && (
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 16, fontStyle: "italic" }}>
            If food and weight have been a hard area for you, the safest path is to talk to
            a clinician. This app cannot replace that.
          </Text>
        )}
      </ScrollView>
    );
  }

  if (screen === "opt-in-identity") {
    const ifThenOptions: Array<{ key: IfThenChoice; label: string }> = [
      { key: "before_lunch", label: "Check it before lunch" },
      { key: "after_workout", label: "Check it after my Sunday workout" },
      { key: "whenever", label: "Check it whenever" },
    ];
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "One moment" }} />
        <Text variant="heading" style={{ color: colors.onSurface, marginBottom: 8 }}>
          Optional: make it yours
        </Text>
        <Text variant="body" style={{ color: colors.onSurfaceVariant, marginBottom: 20 }}>
          These help you connect the coach to what matters to you. Both are optional.
        </Text>
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
          In one sentence: who are you fueling?
        </Text>
        <TextInput
          style={[styles.textInput, { color: colors.onSurface, borderColor: colors.onSurfaceVariant }]}
          value={identityDraft}
          onChangeText={setIdentityDraft}
          placeholder="e.g. A parent who wants to keep up with my kids"
          placeholderTextColor={colors.onSurfaceVariant}
          accessibilityLabel="Who are you fueling? Optional."
          multiline
          allowFontScaling
          maxLength={200}
        />
        <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8, marginTop: 16 }}>
          When the card appears on Sunday, I will:
        </Text>
        {ifThenOptions.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            onPress={() => setIfThenDraft(key)}
            style={[
              styles.radioRow,
              {
                borderColor: ifThenDraft === key ? colors.onSurface : colors.onSurfaceVariant,
                backgroundColor: ifThenDraft === key ? colors.onSurface + "15" : "transparent",
              },
            ]}
            accessibilityLabel={label}
            accessibilityRole="radio"
            accessibilityState={{ checked: ifThenDraft === key }}
          >
            <Text variant="body" style={{ color: colors.onSurface }}>{label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ marginTop: 24, gap: 12 }}>
          <OptionButton label="Done" onPress={handleIdentityComplete} primary colors={colors} />
          <OptionButton label="Skip" onPress={handleSkipIdentity} colors={colors} />
        </View>
      </ScrollView>
    );
  }

  // ─── Main settings screen ─────────────────────────────────────────────────

  const isPaused = pausedUntil !== null && nowMs < pausedUntil;
  const pausedLabel = isPaused
    ? `Paused until ${new Date(pausedUntil!).toLocaleDateString()}`
    : null;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Adaptive Macro Coach" }} />

      {/* Enable toggle */}
      <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
        <CardContent>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="subtitle" style={{ color: colors.onSurface }}>
                Adaptive Macro Coach
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                Weekly calorie target suggestions based on your logged data. Off by default.
              </Text>
              {pausedLabel && (
                <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 4 }}>
                  {pausedLabel}
                </Text>
              )}
            </View>
            <Switch
              value={enabled}
              onValueChange={handleToggleEnabled}
              accessibilityLabel="Enable Adaptive Macro Coach"
              accessibilityRole="switch"
            />
          </View>
          {isPaused && (
            <TouchableOpacity onPress={handleResumePause} style={{ marginTop: 8 }}>
              <Text variant="body" style={{ color: colors.onSurface }}>
                Resume now
              </Text>
            </TouchableOpacity>
          )}
        </CardContent>
      </Card>

      {enabled && (
        <>
          {/* Mode selection */}
          <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
            <CardContent>
              <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
                Mode
              </Text>
              <OptionButton
                label="Full mode"
                sublabel="Weekly target suggestions + TDEE estimate"
                onPress={() => handleModeChange("full")}
                primary={mode === "full"}
                colors={colors}
                accessibilityLabel="Full mode"
              />
              <OptionButton
                label="Info-only mode"
                sublabel="Show weekly TDEE check-ins only — no target changes"
                onPress={() => handleModeChange("info_only")}
                primary={mode === "info_only"}
                colors={colors}
                accessibilityLabel="Info-only mode"
              />
            </CardContent>
          </Card>

          {/* Safety floor */}
          {floorKcal !== null && computedFloor !== null && (
            <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
              <CardContent>
                <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 4 }}>
                  Safety floor
                </Text>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginBottom: 8 }}>
                  Suggestions will never go below your safety floor of{" "}
                  <Text variant="caption" style={{ fontWeight: "700", color: colors.onSurface }}>
                    {floorKcal.toLocaleString()} kcal
                  </Text>{" "}
                  — your body&apos;s resting energy needs. You can raise this, but not lower it
                  below {computedFloor.toLocaleString()} kcal.
                </Text>
                <View style={styles.row}>
                  <TextInput
                    style={[styles.textInputInline, { color: colors.onSurface, borderColor: colors.onSurfaceVariant }]}
                    value={floorInput}
                    onChangeText={setFloorInput}
                    keyboardType="number-pad"
                    accessibilityLabel="Safety floor in calories"
                    maxLength={5}
                    allowFontScaling
                  />
                  <TouchableOpacity onPress={handleFloorSave} style={[styles.saveBtn, { borderColor: colors.onSurface }]}>
                    <Text variant="body" style={{ color: colors.onSurface }}>Save</Text>
                  </TouchableOpacity>
                </View>
              </CardContent>
            </Card>
          )}

          {/* Identity + if-then */}
          {identitySentence && (
            <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
              <CardContent>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  You said:
                </Text>
                <Text variant="body" style={{ color: colors.onSurface, fontStyle: "italic" }}>
                  &ldquo;{identitySentence}&rdquo;
                </Text>
              </CardContent>
            </Card>
          )}

          {/* Disclosure (persistent) */}
          <Card style={{ backgroundColor: colors.surface, marginBottom: 16 }}>
            <CardContent>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                If you have a history of disordered eating, we recommend keeping this off or
                using info-only mode. Talk to a clinician before adjusting calories.
              </Text>
            </CardContent>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadUserFloorProfile(): Promise<UserFloorProfile | null> {
  const saved = await getAppSetting("nutrition_profile");
  if (!saved) return null;
  const raw = safeParse<Record<string, unknown> | null>(saved, null, "macro-coach-settings.nutrition_profile");
  if (!raw) return null;
  const profile = migrateProfile(raw);
  const { weight_kg, height_cm } = convertToMetric(
    profile.weight, profile.weightUnit, profile.height, profile.heightUnit
  );
  const age = new Date().getFullYear() - profile.birthYear;
  return { sex: profile.sex, weight_kg, height_cm, age };
}

function OptionButton({
  label,
  sublabel,
  onPress,
  primary = false,
  colors,
  accessibilityLabel,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  primary?: boolean;
  colors: ReturnType<typeof useThemeColors>;
  accessibilityLabel?: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.optionBtn,
        {
          backgroundColor: primary ? colors.onSurface + "15" : "transparent",
          borderColor: primary ? colors.onSurface : colors.onSurfaceVariant,
        },
      ]}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
    >
      <Text variant="body" style={{ color: colors.onSurface, fontWeight: primary ? "600" : "400" }}>
        {label}
      </Text>
      {sublabel && (
        <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginTop: 2 }}>
          {sublabel}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  optionBtn: {
    borderWidth: 1,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: 10,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 12,
    fontSize: 16,
  },
  textInputInline: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 10,
    fontSize: 16,
    flex: 1,
  },
  radioRow: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 14,
    marginBottom: 8,
  },
  saveBtn: {
    borderWidth: 1,
    borderRadius: radii.sm,
    padding: 10,
    paddingHorizontal: 16,
  },
});
