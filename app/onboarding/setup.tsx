import { Pressable, StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { useState } from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";

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

const LEVELS: { value: Level; label: string; description: string; icon: string }[] = [
  {
    value: "beginner",
    label: "Beginner",
    description: "I'm just getting started with gym workouts",
    icon: "weight-lifter",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "I've been working out regularly for a few months",
    icon: "arm-flex",
  },
  {
    value: "advanced",
    label: "Advanced",
    description: "I design my own workout routines",
    icon: "trophy",
  },
];

export default function Setup() {
  const colors = useThemeColors();
  const router = useRouter();
  const defaults = detectUnits();
  const [weight, setWeight] = useState<"kg" | "lb">(defaults.weight);
  const [measurement, setMeasurement] = useState<"cm" | "in">(defaults.measurement);
  const [level, setLevel] = useState<Level | null>(null);

  const header = (
    <>
      <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
        Set Up Your Preferences
      </Text>

      <Text variant="title" style={[styles.section, { color: colors.onBackground }]}>
        Weight Unit
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Weight unit">
        <SegmentedControl
          value={weight}
          onValueChange={(v) => setWeight(v as "kg" | "lb")}
          buttons={[
            { value: "kg", label: "kg", accessibilityLabel: "Kilograms" },
            { value: "lb", label: "lb", accessibilityLabel: "Pounds" },
          ]}
          style={styles.segment}
        />
      </View>

      <Text variant="title" style={[styles.section, { color: colors.onBackground }]}>
        Measurement Unit
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Measurement unit">
        <SegmentedControl
          value={measurement}
          onValueChange={(v) => setMeasurement(v as "cm" | "in")}
          buttons={[
            { value: "cm", label: "cm", accessibilityLabel: "Centimeters" },
            { value: "in", label: "in", accessibilityLabel: "Inches" },
          ]}
          style={styles.segment}
        />
      </View>

      <Text variant="title" style={[styles.section, { color: colors.onBackground }]}>
        Experience Level
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
      accessibilityLabel={level ? "Continue to recommendations" : "Select an experience level to continue"}
      label="Continue"
    />
  );

  return (
    <FlashList
      data={LEVELS}
      keyExtractor={(item) => item.value}
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={styles.scroll}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      accessibilityRole="radiogroup"
      accessibilityLabel="Experience level"
      renderItem={({ item }) => {
        const selected = level === item.value;
        return (
          <Pressable
            onPress={() => setLevel(item.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`${item.label}: ${item.description}`}
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
