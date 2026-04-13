import React from "react";
import { Appearance, Linking, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { light, dark } from "../constants/theme";

function theme() {
  return Appearance.getColorScheme() === "dark" ? dark : light;
}

export default function WebUnsupported() {
  const t = theme();

  return (
    <View
      style={[styles.container, { backgroundColor: t.colors.background }]}
      accessibilityRole="summary"
    >
      <Text
        variant="displaySmall"
        style={[styles.icon]}
        accessibilityElementsHidden
      >
        📱
      </Text>
      <Text
        variant="headlineMedium"
        style={[styles.heading, { color: t.colors.onBackground }]}
      >
        Mobile App Only
      </Text>
      <Text
        variant="bodyLarge"
        style={[styles.body, { color: t.colors.onSurfaceVariant }]}
      >
        FitForge is designed for iOS and Android. Web browsers are not currently
        supported due to database limitations.
      </Text>
      <Text
        variant="bodyMedium"
        style={[styles.hint, { color: t.colors.onSurfaceVariant }]}
      >
        To use FitForge, install it on your phone or run it in an iOS/Android
        simulator.
      </Text>
      <Button
        mode="contained"
        icon="github"
        style={styles.btn}
        onPress={() =>
          Linking.openURL("https://github.com/alankyshum/fitforge")
        }
        accessibilityLabel="View FitForge on GitHub"
      >
        View on GitHub
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  heading: {
    marginBottom: 12,
    textAlign: "center",
  },
  body: {
    marginBottom: 12,
    textAlign: "center",
    maxWidth: 400,
  },
  hint: {
    marginBottom: 24,
    textAlign: "center",
    maxWidth: 400,
  },
  btn: {
    minWidth: 200,
  },
});
