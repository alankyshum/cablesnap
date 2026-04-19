import { ScrollView, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Alert as AlertComponent, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { setAppSetting, updateBodySettings, getBodySettings } from "../../lib/db";
import { activateProgram } from "../../lib/programs";
import {
  STARTER_TEMPLATES,
  STARTER_PROGRAM,
} from "../../lib/starter-templates";
import { useCompleteOnboarding } from "../../lib/onboarding-context";
import { useThemeColors } from "@/hooks/useThemeColors";

type Level = "beginner" | "intermediate" | "advanced";

const FULL_BODY = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-1")!;
const PPL = STARTER_PROGRAM;
const BROWSE_TEMPLATES = STARTER_TEMPLATES.slice(0, 3);

export default function Recommend() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ weight: string; measurement: string; level: string }>();
  const level = (params.level ?? "beginner") as Level;
  const weight = (params.weight ?? "kg") as "kg" | "lb";
  const measurement = (params.measurement ?? "cm") as "cm" | "in";
  const completeOnboarding = useCompleteOnboarding();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<"template" | "program" | "browse" | undefined>();

  async function finish(action?: "template" | "program" | "browse") {
    if (saving) return;
    setSaving(true);
    setError(null);
    if (action !== undefined) setLastAction(action);
    const effectiveAction = action ?? lastAction;
    try {
      const settings = await getBodySettings();
      await updateBodySettings(weight, measurement, settings.weight_goal, settings.body_fat_goal);
      await setAppSetting("experience_level", level);
      await setAppSetting("onboarding_complete", "1");
      completeOnboarding();

      if (effectiveAction === "program") {
        await activateProgram(PPL.id);
      }
      router.replace("/(tabs)");
    } catch {
      setSaving(false);
      setError("Something went wrong saving your preferences. Tap to retry or skip.");
    }
  }

  function skip() {
    if (saving) return;
    setSaving(true);
    setAppSetting("onboarding_complete", "1")
      .then(() => {
        completeOnboarding();
        router.replace("/(tabs)");
      })
      .catch(() => {
        setSaving(false);
        setError("Could not save preferences. Tap Skip to continue anyway.");
      });
  }

  const errorBanner = (
    <>
      {!!error && (
        <AlertComponent variant="destructive" style={{ marginBottom: 16 }}>
          <AlertDescription>{error}</AlertDescription>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Button variant="outline" onPress={() => finish()} label="Retry" size="sm" />
            <Button variant="ghost" onPress={skip} label="Skip" size="sm" />
          </View>
        </AlertComponent>
      )}
    </>
  );

  if (level === "beginner") {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
      >
        {errorBanner}
        <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
          We Recommend
        </Text>
        <Card style={StyleSheet.flatten([styles.recCard, { backgroundColor: colors.surface }])}>
          <CardContent>
            <View style={styles.recHeader}>
              <Text variant="title" style={{ color: colors.onSurface }}>
                {FULL_BODY.name}
              </Text>
              <Chip
                compact
                style={{ backgroundColor: colors.primaryContainer }}
              >
                Recommended
              </Chip>
            </View>
            <Text variant="body" style={[styles.recDesc, { color: colors.onSurfaceVariant }]}>
              This {FULL_BODY.duration} workout covers all major muscle groups — perfect for building a
              foundation.
            </Text>
            <View style={styles.meta}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={colors.onSurfaceVariant} />
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 4 }}>
                {FULL_BODY.duration}
              </Text>
              <MaterialCommunityIcons
                name="dumbbell"
                size={16}
                color={colors.onSurfaceVariant}
                style={{ marginLeft: 12 }}
              />
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 4 }}>
                {FULL_BODY.exercises.length} exercises
              </Text>
            </View>
          </CardContent>
        </Card>
        <Button
          variant="default"
          onPress={() => finish("template")}
          style={styles.btn}
          loading={saving}
          disabled={saving}
          accessibilityLabel={`Start with ${FULL_BODY.name}`}
        >
          Start with {FULL_BODY.name}
        </Button>
        <Button
          variant="ghost"
          onPress={() => finish()}
          style={styles.skip}
          disabled={saving}
          accessibilityLabel="Skip recommendation and explore on your own"
          label="I'll explore on my own"
        />
      </ScrollView>
    );
  }

  if (level === "intermediate") {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={styles.scroll}
      >
        {errorBanner}
        <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
          We Recommend
        </Text>
        <Card style={StyleSheet.flatten([styles.recCard, { backgroundColor: colors.surface }])}>
          <CardContent>
            <View style={styles.recHeader}>
              <Text variant="title" style={{ color: colors.onSurface }}>
                {PPL.name}
              </Text>
              <Chip
                compact
                style={{ backgroundColor: colors.secondaryContainer }}
              >
                Program
              </Chip>
            </View>
            <Text variant="body" style={[styles.recDesc, { color: colors.onSurfaceVariant }]}>
              {PPL.description}
            </Text>
            <View style={styles.meta}>
              <MaterialCommunityIcons name="calendar-sync" size={16} color={colors.onSurfaceVariant} />
              <Text variant="caption" style={{ color: colors.onSurfaceVariant, marginLeft: 4 }}>
                {PPL.days.length}-day cycle
              </Text>
            </View>
          </CardContent>
        </Card>
        <Button
          variant="default"
          onPress={() => finish("program")}
          style={styles.btn}
          loading={saving}
          disabled={saving}
          accessibilityLabel={`Start with ${PPL.name}`}
        >
          Start with {PPL.name}
        </Button>
        <Button
          variant="ghost"
          onPress={() => finish()}
          style={styles.skip}
          disabled={saving}
          accessibilityLabel="Skip recommendation and explore on your own"
          label="I'll explore on my own"
        />
      </ScrollView>
    );
  }

  // Advanced
  const advancedHeader = (
    <>
      {errorBanner}
      <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
        Browse Our Templates
      </Text>
      <Text variant="body" style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
        Pick a starter template or create your own workouts from scratch.
      </Text>
    </>
  );

  const advancedFooter = (
    <>
      <Button
        variant="default"
        onPress={() => finish("browse")}
        style={styles.btn}
        loading={saving}
        disabled={saving}
        accessibilityLabel="Browse all workout templates"
        label="Browse All Templates"
      />
      <Button
        variant="ghost"
        onPress={() => finish()}
        style={styles.skip}
        disabled={saving}
        accessibilityLabel="Skip and explore on your own"
        label="I'll explore on my own"
      />
    </>
  );

  return (
    <FlashList
      data={BROWSE_TEMPLATES}
      keyExtractor={(tpl) => tpl.id}
      style={{ flex: 1, backgroundColor: colors.background }}
      ListHeaderComponent={advancedHeader}
      ListFooterComponent={advancedFooter}
      renderItem={({ item: tpl }) => (
        <Card
          style={StyleSheet.flatten([styles.browseCard, { backgroundColor: colors.surface }])}
         
        >
          <CardContent>
            <View style={styles.recHeader}>
              <Text variant="title" style={{ color: colors.onSurface }}>
                {tpl.name}
              </Text>
              <View style={styles.meta}>
                <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                  {tpl.duration}
                </Text>
              </View>
            </View>
            <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
              {tpl.exercises.length} exercises · {tpl.difficulty}
            </Text>
          </CardContent>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
    paddingBottom: 48,
  },
  title: {
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
  },
  recCard: {
    marginBottom: 24,
    borderRadius: 12,
  },
  recHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  recDesc: {
    marginBottom: 12,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
  },
  browseCard: {
    marginBottom: 12,
    borderRadius: 12,
  },
  btn: {
    marginTop: 16,
    borderRadius: 8,
  },
  btnContent: {
    paddingVertical: 8,
    minHeight: 48,
  },
  skip: {
    marginTop: 8,
  },
});
