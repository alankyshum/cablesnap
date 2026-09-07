import { Pressable, StyleSheet, View, FlatList } from "react-native";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

type Level = "beginner" | "intermediate" | "advanced";

function detectUnits(): { weight: "kg" | "lb"; measurement: "cm" | "in" } {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
    if (locale.startsWith("en-US") || locale.startsWith("en-CA"))
      return { weight: "lb", measurement: "in" };
  } catch {
    // locale detection failed
  }
  return { weight: "kg", measurement: "cm" };
}

function getLevels(): { value: Level; label: string; description: string; icon: string }[] {
  return [
  {
    value: "beginner",
    label: t({ id: "app.onboarding.setup.beginner", message: "Beginner" }),
    description: t({ id: "app.onboarding.setup.beginnerDescription", message: "I'm just getting started with gym workouts" }),
    icon: "weight-lifter",
  },
  {
    value: "intermediate",
    label: t({ id: "app.onboarding.setup.intermediate", message: "Intermediate" }),
    description: t({ id: "app.onboarding.setup.intermediateDescription", message: "I've been working out regularly for a few months" }),
    icon: "arm-flex",
  },
  {
    value: "advanced",
    label: t({ id: "app.onboarding.setup.advanced", message: "Advanced" }),
    description: t({ id: "app.onboarding.setup.advancedDescription", message: "I design my own workout routines" }),
    icon: "trophy",
  },
  ];
}

export default function Setup() {
  const colors = useThemeColors();
  const router = useRouter();
  const defaults = detectUnits();
  const levels = getLevels();
  const [weight, setWeight] = useState<"kg" | "lb">(defaults.weight);
  const [measurement, setMeasurement] = useState<"cm" | "in">(defaults.measurement);
  const [level, setLevel] = useState<Level | null>(null);

  const header = (
    <>
      <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
        {t({ id: "app.onboarding.setup.title", message: "Set Up Your Preferences" })}
      </Text>

      <Text variant="title" style={[styles.section, { color: colors.onBackground }]}>
        {t({ id: "app.onboarding.setup.weightUnit", message: "Weight Unit" })}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t({ id: "app.onboarding.setup.weightUnitA11y", message: "Weight unit" })}>
        <SegmentedControl
          value={weight}
          onValueChange={(v) => setWeight(v as "kg" | "lb")}
          buttons={[
            { value: "kg", label: "kg", accessibilityLabel: t({ id: "app.onboarding.setup.kilograms", message: "Kilograms" }) },
            { value: "lb", label: "lb", accessibilityLabel: t({ id: "app.onboarding.setup.pounds", message: "Pounds" }) },
          ]}
          style={styles.segment}
        />
      </View>

      <Text variant="title" style={[styles.section, { color: colors.onBackground }]}>
        {t({ id: "app.onboarding.setup.measurementUnit", message: "Measurement Unit" })}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={t({ id: "app.onboarding.setup.measurementUnitA11y", message: "Measurement unit" })}>
        <SegmentedControl
          value={measurement}
          onValueChange={(v) => setMeasurement(v as "cm" | "in")}
          buttons={[
            { value: "cm", label: "cm", accessibilityLabel: t({ id: "app.onboarding.setup.centimeters", message: "Centimeters" }) },
            { value: "in", label: "in", accessibilityLabel: t({ id: "app.onboarding.setup.inches", message: "Inches" }) },
          ]}
          style={styles.segment}
        />
      </View>

      <Text variant="title" style={[styles.section, { color: colors.onBackground }]}>
        {t({ id: "app.onboarding.setup.experienceLevel", message: "Experience Level" })}
      </Text>
    </>
  );

  const footer = (
    <Button
      variant="default"
      disabled={!level}
      onPress={() => {
        router.replace({
          pathname: "/onboarding/recommend",
          params: { weight, measurement, level: level! },
        });
      }}
      style={styles.btn}
      accessibilityLabel={level ? t({ id: "app.onboarding.setup.continueA11y", message: "Continue to recommendations" }) : t({ id: "app.onboarding.setup.selectLevelA11y", message: "Select an experience level to continue" })}
      label={t({ id: "app.onboarding.setup.continue", message: "Continue" })}
    />
  );

  return (
    <FlatList
      data={levels}
      keyExtractor={(item) => item.value}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      accessibilityRole="radiogroup"
       accessibilityLabel={t({ id: "app.onboarding.setup.experienceLevelA11y", message: "Experience level" })}
      renderItem={({ item }) => {
        const selected = level === item.value;
        return (
          <Pressable
            onPress={() => setLevel(item.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
              accessibilityLabel={t({ id: "app.onboarding.setup.levelA11y", message: `${item.label}: ${item.description}` })}
            style={[
              styles.card,
              {
                borderColor: selected ? colors.primary : colors.outlineVariant,
                borderWidth: selected ? 2 : 1,
                backgroundColor: selected ? colors.primaryContainer : colors.surface,
              },
            ]}
          >
            <View style={styles.cardRow}>
              <MaterialCommunityIcons
                name={item.icon as React.ComponentProps<typeof MaterialCommunityIcons>["name"]}
                size={28}
                color={selected ? colors.primary : colors.onSurfaceVariant}
                style={styles.cardIcon}
              />
              <View style={styles.cardText}>
                <Text
                  variant="title"
                  style={{ color: selected ? colors.onPrimaryContainer : colors.onSurface }}
                >
                  {item.label}
                </Text>
                <Text
                  variant="body"
                  style={{ color: selected ? colors.onPrimaryContainer : colors.onSurfaceVariant }}
                >
                  {item.description}
                </Text>
              </View>
              {selected && (
                <MaterialCommunityIcons
                  name="check-circle"
                  size={24}
                  color={colors.primary}
                />
              )}
            </View>
          </Pressable>
        );
      }}
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
    marginBottom: 24,
  },
  section: {
    marginTop: 16,
    marginBottom: 8,
  },
  segment: {
    marginBottom: 8,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    minHeight: 48,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardIcon: {
    marginRight: 12,
  },
  cardText: {
    flex: 1,
  },
  btn: {
    marginTop: 24,
    borderRadius: 8,
  },
  btnContent: {
    paddingVertical: 8,
    minHeight: 48,
  },
});
