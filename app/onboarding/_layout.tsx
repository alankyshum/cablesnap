import { Stack, useRouter } from "expo-router";
import { View, StyleSheet } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import React from "react";
import { setAppSetting } from "../../lib/db";
import { useCompleteOnboarding } from "../../lib/onboarding-context";
import { useThemeColors } from "@/hooks/useThemeColors";
import { t } from "@lingui/core/macro";

function Fallback() {
  const colors = useThemeColors();
  const router = useRouter();
  const completeOnboarding = useCompleteOnboarding();
  const [err, setErr] = React.useState<string | null>(null);

  async function skip() {
    try {
      await setAppSetting("onboarding_complete", "1");
      completeOnboarding();
      router.replace("/(tabs)");
    } catch {
      setErr(t({ id: "app.onboarding.layout.saveError", message: "Could not save preferences. Tap again to continue anyway." }));
    }
  }

  function force() {
    completeOnboarding();
    router.replace("/(tabs)");
  }

  return (
    <View style={[styles.fallback, { backgroundColor: colors.background }]}>
      <Text variant="heading" style={[styles.title, { color: colors.onBackground }]}>
        {t({ id: "app.onboarding.layout.errorTitle", message: "Something went wrong" })}
      </Text>
      <Text variant="body" style={[styles.sub, { color: colors.onSurfaceVariant }]}>
        {t({ id: "app.onboarding.layout.loadError", message: "We couldn't load onboarding. You can skip straight to the app." })}
      </Text>
      {err && (
        <Text variant="caption" style={[styles.sub, { color: colors.error }]}>
          {err}
        </Text>
      )}
      <Button
        variant="default"
        onPress={err ? force : skip}
        style={styles.btn}
        accessibilityLabel={t({ id: "app.onboarding.layout.skipA11y", message: "Skip to app" })}
        label={err ? t({ id: "app.onboarding.layout.continueWithoutSaving", message: "Continue Without Saving" }) : t({ id: "app.onboarding.layout.skipToApp", message: "Skip to App" })}
      />
    </View>
  );
}

type State = { error: Error | null };

class OnboardingErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) return <Fallback />;
    return this.props.children;
  }
}

export default function OnboardingLayout() {
  return (
    <OnboardingErrorBoundary>
      <Stack screenOptions={{ headerShown: false, animation: "none" }}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="recommend" />
      </Stack>
    </OnboardingErrorBoundary>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  title: {
    textAlign: "center",
    marginBottom: 12,
  },
  sub: {
    textAlign: "center",
    marginBottom: 24,
  },
  btn: {
    borderRadius: 8,
    width: "100%",
  },
});
