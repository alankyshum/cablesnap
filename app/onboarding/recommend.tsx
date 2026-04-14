import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Card, Chip, Text, useTheme } from "react-native-paper";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { setAppSetting, updateBodySettings, getBodySettings } from "../../lib/db";
import { activateProgram } from "../../lib/programs";
import {
  STARTER_TEMPLATES,
  STARTER_PROGRAM,
} from "../../lib/starter-templates";

type Level = "beginner" | "intermediate" | "advanced";

const FULL_BODY = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-1")!;
const PPL = STARTER_PROGRAM;
const BROWSE_TEMPLATES = STARTER_TEMPLATES.slice(0, 3);

export default function Recommend() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ weight: string; measurement: string; level: string }>();
  const level = (params.level ?? "beginner") as Level;
  const weight = (params.weight ?? "kg") as "kg" | "lb";
  const measurement = (params.measurement ?? "cm") as "cm" | "in";
  const [saving, setSaving] = useState(false);

  async function finish(action?: "template" | "program" | "browse") {
    if (saving) return;
    setSaving(true);
    try {
      const settings = await getBodySettings();
      await updateBodySettings(weight, measurement, settings.weight_goal, settings.body_fat_goal);
      await setAppSetting("experience_level", level);
      await setAppSetting("onboarding_complete", "1");

      if (action === "program") {
        await activateProgram(PPL.id);
        router.replace("/(tabs)");
      } else if (action === "template") {
        router.replace(`/(tabs)`);
      } else {
        router.replace("/(tabs)");
      }
    } finally {
      setSaving(false);
    }
  }

  if (level === "beginner") {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.scroll}
      >
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          We Recommend
        </Text>
        <Card style={[styles.recCard, { backgroundColor: theme.colors.surface }]} mode="outlined">
          <Card.Content>
            <View style={styles.recHeader}>
              <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>
                {FULL_BODY.name}
              </Text>
              <Chip
                compact
                mode="flat"
                style={{ backgroundColor: theme.colors.primaryContainer }}
                textStyle={{ color: theme.colors.onPrimaryContainer }}
              >
                Recommended
              </Chip>
            </View>
            <Text variant="bodyMedium" style={[styles.recDesc, { color: theme.colors.onSurfaceVariant }]}>
              This {FULL_BODY.duration} workout covers all major muscle groups — perfect for building a
              foundation.
            </Text>
            <View style={styles.meta}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                {FULL_BODY.duration}
              </Text>
              <MaterialCommunityIcons
                name="dumbbell"
                size={16}
                color={theme.colors.onSurfaceVariant}
                style={{ marginLeft: 12 }}
              />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                {FULL_BODY.exercises.length} exercises
              </Text>
            </View>
          </Card.Content>
        </Card>
        <Button
          mode="contained"
          onPress={() => finish("template")}
          style={styles.btn}
          contentStyle={styles.btnContent}
          loading={saving}
          disabled={saving}
          accessibilityLabel={`Start with ${FULL_BODY.name}`}
        >
          Start with {FULL_BODY.name}
        </Button>
        <Button
          mode="text"
          onPress={() => finish()}
          style={styles.skip}
          contentStyle={styles.btnContent}
          disabled={saving}
          accessibilityLabel="Skip recommendation and explore on your own"
        >
          I'll explore on my own
        </Button>
      </ScrollView>
    );
  }

  if (level === "intermediate") {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.scroll}
      >
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
          We Recommend
        </Text>
        <Card style={[styles.recCard, { backgroundColor: theme.colors.surface }]} mode="outlined">
          <Card.Content>
            <View style={styles.recHeader}>
              <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>
                {PPL.name}
              </Text>
              <Chip
                compact
                mode="flat"
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                textStyle={{ color: theme.colors.onSecondaryContainer }}
              >
                Program
              </Chip>
            </View>
            <Text variant="bodyMedium" style={[styles.recDesc, { color: theme.colors.onSurfaceVariant }]}>
              {PPL.description}
            </Text>
            <View style={styles.meta}>
              <MaterialCommunityIcons name="calendar-sync" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                {PPL.days.length}-day cycle
              </Text>
            </View>
          </Card.Content>
        </Card>
        <Button
          mode="contained"
          onPress={() => finish("program")}
          style={styles.btn}
          contentStyle={styles.btnContent}
          loading={saving}
          disabled={saving}
          accessibilityLabel={`Start with ${PPL.name}`}
        >
          Start with {PPL.name}
        </Button>
        <Button
          mode="text"
          onPress={() => finish()}
          style={styles.skip}
          contentStyle={styles.btnContent}
          disabled={saving}
          accessibilityLabel="Skip recommendation and explore on your own"
        >
          I'll explore on my own
        </Button>
      </ScrollView>
    );
  }

  // Advanced
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.scroll}
    >
      <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
        Browse Our Templates
      </Text>
      <Text variant="bodyLarge" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
        Pick a starter template or create your own workouts from scratch.
      </Text>
      {BROWSE_TEMPLATES.map((tpl) => (
        <Card
          key={tpl.id}
          style={[styles.browseCard, { backgroundColor: theme.colors.surface }]}
          mode="outlined"
        >
          <Card.Content>
            <View style={styles.recHeader}>
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {tpl.name}
              </Text>
              <View style={styles.meta}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {tpl.duration}
                </Text>
              </View>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {tpl.exercises.length} exercises · {tpl.difficulty}
            </Text>
          </Card.Content>
        </Card>
      ))}
      <Button
        mode="contained"
        onPress={() => finish("browse")}
        style={styles.btn}
        contentStyle={styles.btnContent}
        loading={saving}
        disabled={saving}
        accessibilityLabel="Browse all workout templates"
      >
        Browse All Templates
      </Button>
      <Button
        mode="text"
        onPress={() => finish()}
        style={styles.skip}
        contentStyle={styles.btnContent}
        disabled={saving}
        accessibilityLabel="Skip and explore on your own"
      >
        I'll explore on my own
      </Button>
    </ScrollView>
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
