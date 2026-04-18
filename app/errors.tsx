import { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Button, Card, Chip, Snackbar, Text } from "react-native-paper";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getRecentErrors, clearErrorLog } from "../lib/errors";
import { useLayout } from "../lib/layout";
import type { ErrorEntry } from "../lib/types";
import { radii } from "../constants/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function Errors() {
  const colors = useThemeColors();
  const layout = useLayout();
  const nav = useNavigation();
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [snack, setSnack] = useState("");

  const load = useCallback(async () => {
    const rows = await getRecentErrors(50);
    setErrors(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleClear = async () => {
    await clearErrorLog();
    setErrors([]);
    setSnack("Error log cleared");
  };

  // Set header action
  useFocusEffect(
    useCallback(() => {
      nav.setOptions({
        headerRight: () =>
          errors.length > 0 ? (
            <Button onPress={handleClear} compact textColor={colors.error} accessibilityLabel="Clear all errors">
              Clear All
            </Button>
          ) : null,
      });
    }, [errors.length, nav, colors.error])
  );

  const toggle = (id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  const fmt = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString() + " " + d.toLocaleTimeString();
  };

  if (errors.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: colors.background, paddingHorizontal: layout.horizontalPadding }]}>
        <MaterialCommunityIcons
          name="check-circle-outline"
          size={64}
          color={colors.primary}
        />
        <Text
          variant="titleMedium"
          style={{ color: colors.onBackground, marginTop: 16 }}
        >
          No errors recorded
        </Text>
        <Snackbar
          visible={!!snack}
          onDismiss={() => setSnack("")}
          duration={3000}
          action={{ label: "OK", onPress: () => setSnack("") }}
        >
          {snack}
        </Snackbar>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={errors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: layout.horizontalPadding }}
        renderItem={({ item }) => (
          <Card
            style={[styles.card, { backgroundColor: colors.surface }]}
            onPress={() => toggle(item.id)}
            accessibilityLabel={`Error: ${item.message}, ${fmt(item.timestamp)}${item.fatal ? ", fatal" : ""}`}
            accessibilityRole="button"
          >
            <Card.Content>
              <View style={styles.row}>
                <Text
                  variant="bodySmall"
                  style={{ color: colors.onSurfaceVariant }}
                >
                  {fmt(item.timestamp)}
                </Text>
                {item.fatal && (
                  <Chip
                    compact
                    textStyle={{ fontSize: 12 }}
                    style={{ backgroundColor: colors.errorContainer }}
                  >
                    FATAL
                  </Chip>
                )}
              </View>
              <Text
                variant="bodyMedium"
                numberOfLines={expanded === item.id ? undefined : 2}
                style={{ color: colors.onSurface, marginTop: 4 }}
              >
                {item.message}
              </Text>
              {expanded === item.id && item.stack && (
                <View style={[styles.stackBox, { backgroundColor: colors.surfaceVariant }]}>
                  <Text
                    variant="bodySmall"
                    style={{
                      fontFamily: "monospace",
                      color: colors.onSurfaceVariant,
                      fontSize: 12,
                    }}
                    selectable
                  >
                    {item.stack}
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}
      />
      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={3000}
        action={{ label: "OK", onPress: () => setSnack("") }}
      >
        {snack}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stackBox: {
    marginTop: 8,
    borderRadius: radii.md,
    padding: 8,
  },
});
