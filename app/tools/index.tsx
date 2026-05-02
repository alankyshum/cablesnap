import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import { Card, CardContent } from "@/components/ui/card";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack, useRouter } from "expo-router";
import { useLayout } from "../../lib/layout";
import { PlateCalculatorContent } from "./plates";
import { RMCalculatorContent } from "./rm";
import { TimerContent } from "./timer";
import { useThemeColors } from "@/hooks/useThemeColors";
import { logError } from "../../lib/errors";

export default function ToolsHub() {
  const colors = useThemeColors();
  const layout = useLayout();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Workout Tools" }} />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ padding: layout.horizontalPadding, paddingVertical: 24, gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
        <ToolLinkCard
          icon="cable-data"
          title="Cable Setup Finder"
          description="Find exercises by mount position and attachment"
          onPress={() => router.push("/tools/cable-finder")}
        />

        <ToolCard icon="timer-outline" title="Interval Timer">
          <TimerContent />
        </ToolCard>

        <ToolCard icon="arm-flex" title="1RM Calculator">
          <RMCalculatorContent />
        </ToolCard>

        <ToolCard icon="weight" title="Plate Calculator">
          <PlateCalculatorContent />
        </ToolCard>
      </ScrollView>
    </>
  );
}

function ToolLinkCard({ icon, title, description, onPress }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  description: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} accessibilityHint={description}>
      <Card style={{ backgroundColor: colors.surface }}>
        <CardContent>
          <View style={styles.header}>
            <MaterialCommunityIcons
              name={icon}
              size={24}
              color={colors.primary}
              style={styles.icon}
            />
            <View style={{ flex: 1 }}>
              <Text variant="subtitle" style={{ color: colors.onSurface }}>
                {title}
              </Text>
              <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
                {description}
              </Text>
            </View>
            <MaterialCommunityIcons
              name="chevron-right"
              size={24}
              color={colors.onSurfaceVariant}
            />
          </View>
        </CardContent>
      </Card>
    </Pressable>
  );
}

function ToolCard({ icon, title, children }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  children: React.ReactNode;
}) {
  const colors = useThemeColors();
  return (
    <Card style={{ backgroundColor: colors.surface }}>
      <CardContent>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name={icon}
            size={24}
            color={colors.primary}
            style={styles.icon}
          />
          <Text variant="subtitle" style={{ color: colors.onSurface }}>
            {title}
          </Text>
        </View>
        <ToolErrorBoundary name={title}>
          {children}
        </ToolErrorBoundary>
      </CardContent>
    </Card>
  );
}

type BoundaryProps = { name: string; children: React.ReactNode };
type BoundaryState = { hasError: boolean };

class ToolErrorBoundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    logError(error, { component: `ToolsHub/${this.props.name}`, fatal: false });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={{ textAlign: "center", opacity: 0.6 }}>
            {this.props.name} failed to load.
          </Text>
          <Pressable
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel={`Retry loading ${this.props.name}`}
            style={styles.retryButton}
          >
            <Text style={{ textAlign: "center", fontWeight: "600" }}>Tap to retry</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  icon: {
    marginRight: 12,
  },
  errorContainer: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
});
