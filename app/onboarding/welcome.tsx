import { View, StyleSheet } from "react-native";
import { Button, Text } from "react-native-paper";
import { useRouter } from "expo-router";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function Welcome() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <MaterialCommunityIcons
          name="dumbbell"
          size={80}
          color={colors.primary}
          style={styles.icon}
        />
        <Text variant="headlineLarge" style={[styles.title, { color: colors.onBackground }]}>
          Welcome to FitForge
        </Text>
        <Text variant="bodyLarge" style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
          Your free workout & macro tracker
        </Text>
      </View>
      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={() => router.replace("/onboarding/setup")}
          style={styles.btn}
          contentStyle={styles.btnContent}
          accessibilityLabel="Get started with FitForge"
        >
          Get Started
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    padding: 24,
    paddingTop: 80,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    textAlign: "center",
  },
  footer: {
    paddingBottom: 48,
  },
  btn: {
    borderRadius: 8,
  },
  btnContent: {
    paddingVertical: 8,
    minHeight: 48,
  },
});
