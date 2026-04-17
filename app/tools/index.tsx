import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Card, Text, useTheme } from "react-native-paper";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Stack } from "expo-router";
import { useLayout } from "../../lib/layout";
import { PlateCalculatorContent } from "./plates";
import { RMCalculatorContent } from "./rm";
import { TimerContent } from "./timer";

export default function ToolsHub() {
  const theme = useTheme();
  const layout = useLayout();

  return (
    <>
      <Stack.Screen options={{ title: "Workout Tools" }} />
      <ScrollView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={{ padding: layout.horizontalPadding, paddingVertical: 24, gap: 24 }}
        keyboardShouldPersistTaps="handled"
      >
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

function ToolCard({ icon, title, children }: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card style={{ backgroundColor: theme.colors.surface }}>
      <Card.Content>
        <View style={styles.header}>
          <MaterialCommunityIcons
            name={icon}
            size={24}
            color={theme.colors.primary}
            style={styles.icon}
          />
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
            {title}
          </Text>
        </View>
        <ToolErrorBoundary name={title}>
          {children}
        </ToolErrorBoundary>
      </Card.Content>
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

  render() {
    if (this.state.hasError) {
      return (
        <Text style={{ textAlign: "center", opacity: 0.6 }}>
          {this.props.name} failed to load. Try opening it from the standalone screen.
        </Text>
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
});
