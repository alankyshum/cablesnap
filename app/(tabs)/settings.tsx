import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { Button, Card, Snackbar, Text, useTheme } from "react-native-paper";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { exportAllData, importData } from "../../lib/db";

export default function Settings() {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState("");

  const handleExport = async () => {
    setLoading(true);
    try {
      const data = await exportAllData();
      const json = JSON.stringify(data, null, 2);
      const file = new File(Paths.cache, "fitforge-export.json");
      file.write(json);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Export FitForge Data",
      });
      setSnack("Data exported successfully");
    } catch {
      setSnack("Export failed");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    try {
      const picked = await File.pickFileAsync(undefined, "application/json");
      if (!picked) return;

      setLoading(true);
      const file = Array.isArray(picked) ? picked[0] : picked;
      const raw = await file.text();

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch {
        setSnack("Invalid file format");
        setLoading(false);
        return;
      }

      if (typeof data !== "object" || data === null) {
        setSnack("Invalid file format");
        setLoading(false);
        return;
      }

      if (data.version !== 1) {
        setSnack("Unsupported format version");
        setLoading(false);
        return;
      }

      const { inserted } = await importData(
        data as Parameters<typeof importData>[0]
      );
      setSnack(`Import complete — ${inserted} records added`);
    } catch {
      setSnack("Import failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <Text variant="headlineMedium" style={{ color: theme.colors.onBackground, marginBottom: 24 }}>
        Settings
      </Text>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 16 }}>
            Data Management
          </Text>

          <Button
            mode="contained"
            icon="export"
            onPress={handleExport}
            loading={loading}
            disabled={loading}
            style={styles.btn}
          >
            Export All Data
          </Button>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
            Export all exercises, templates, sessions, and sets as a JSON file.
          </Text>

          <Button
            mode="outlined"
            icon="import"
            onPress={handleImport}
            loading={loading}
            disabled={loading}
            style={styles.btn}
          >
            Import Data
          </Button>

          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Import a previously exported FitForge JSON file. Duplicate records are skipped.
          </Text>
        </Card.Content>
      </Card>

      <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Card.Content>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
            About
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            FitForge v1.0.0{"\n"}Free & open-source workout tracker.
          </Text>
        </Card.Content>
      </Card>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack("")}
        duration={3000}
        action={{ label: "OK", onPress: () => setSnack("") }}
      >
        {snack}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 16,
  },
  btn: {
    marginBottom: 8,
  },
});
