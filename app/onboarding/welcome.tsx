import { View, StyleSheet } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { HandleIcon } from "@/components/floating-tab-bar/HandleIcon";
import { useThemeColors } from "@/hooks/useThemeColors";
import { spacing } from "@/constants/design-tokens";

export default function Welcome() {
  const colors = useThemeColors();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <HandleIcon
          size={80}
          color={colors.primary}
        />
        <Text variant="heading" style={[styles.title, { color: colors.onBackground, paddingTop: spacing.lg }]}>
          Welcome to CableSnap
        </Text>
        <Text variant="body" style={[styles.subtitle, { color: colors.onSurfaceVariant, paddingTop: spacing.md }]}>
          Your free workout tracker, optimized for cable machines
        </Text>
      </View>
      <View style={styles.footer}>
        <Button
          variant="default"
          onPress={() => router.replace("/onboarding/setup")}
          style={styles.btn}
          accessibilityLabel="Get started with CableSnap"
          label="Get Started"
        />
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
