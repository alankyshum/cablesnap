import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Linking, StyleSheet, View } from "react-native";
import {
  Button,
  SegmentedButtons,
  Snackbar,
  Switch,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams } from "expo-router";
import {
  generateGitHubURL,
  generateShareText,
  getRecentErrors,
} from "../lib/errors";
import { recent as recentInteractions } from "../lib/interactions";
import type { ErrorEntry, Interaction, ReportType } from "../lib/types";

const MAX_TITLE = 150;
const COOLDOWN_MS = 5000;

const TYPE_OPTIONS = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature" },
  { value: "crash", label: "Crash" },
] as const;

export default function FeedbackScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ type?: string }>();

  const initial = (params.type === "bug" || params.type === "feature" || params.type === "crash")
    ? params.type
    : "bug";
  const locked = params.type === "crash";

  const [type, setType] = useState<ReportType>(initial);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [diag, setDiag] = useState(true);
  const [expanded, setExpanded] = useState(true);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [snack, setSnack] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const [e, i] = await Promise.all([getRecentErrors(5), recentInteractions()]);
      setErrors(e);
      setInteractions(i);
    })();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown > 0]);

  const valid = title.trim().length > 0 &&
    (type === "crash" || desc.trim().length > 0);

  const startCooldown = useCallback(() => setCooldown(5), []);

  const handleGitHub = useCallback(async () => {
    if (!valid) return;
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert(
        "No Internet",
        "You appear to be offline. Would you like to share the report instead?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Share Report", onPress: () => handleShare() },
        ]
      );
      return;
    }
    const url = generateGitHubURL({
      type,
      title: title.trim(),
      description: desc.trim(),
      errors,
      interactions,
      includeDiag: diag,
    });
    await Linking.openURL(url);
    startCooldown();
    setSnack("Report opened in browser");
  }, [valid, type, title, desc, errors, interactions, diag]);

  const handleShare = useCallback(async () => {
    if (!valid) return;
    try {
      const text = generateShareText({
        type,
        title: title.trim(),
        description: desc.trim(),
        errors,
        interactions,
        includeDiag: diag,
      });
      const json = JSON.stringify(
        {
          type,
          title: title.trim(),
          description: desc.trim(),
          generated_at: new Date().toISOString(),
          errors: diag ? errors : [],
          interactions: diag ? interactions : [],
        },
        null,
        2
      );
      const file = new File(Paths.cache, "fitforge-report.json");
      await file.write(json);
      const textFile = new File(Paths.cache, "fitforge-report.txt");
      await textFile.write(text);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Share Report",
      });
      startCooldown();
      setSnack("Report shared");
    } catch {
      setSnack("Unable to share");
    }
  }, [valid, type, title, desc, errors, interactions, diag]);

  const diagText = (() => {
    if (interactions.length === 0 && errors.length === 0) return "No diagnostic data recorded";
    const parts: string[] = [];
    if (interactions.length > 0) {
      parts.push(
        `Last ${interactions.length} interaction${interactions.length > 1 ? "s" : ""}:\n` +
          interactions
            .map(
              (i, idx) =>
                `  ${idx + 1}. [${new Date(i.timestamp).toLocaleTimeString()}] ${i.action}: ${i.screen}${i.detail ? ` — ${i.detail}` : ""}`
            )
            .join("\n")
      );
    } else {
      parts.push("No recent interactions");
    }
    if (type !== "feature") {
      if (errors.length > 0) {
        parts.push(
          `\nLast ${errors.length} error${errors.length > 1 ? "s" : ""}:\n` +
            errors
              .map(
                (e, idx) =>
                  `  ${idx + 1}. [${new Date(e.timestamp).toLocaleTimeString()}] ${e.message} (fatal: ${e.fatal})`
              )
              .join("\n")
        );
      } else {
        parts.push("\nNo errors recorded");
      }
    }
    return parts.join("\n");
  })();

  const buttons = useMemo(
    () =>
      TYPE_OPTIONS.map((o) => ({
        ...o,
        disabled: locked && o.value !== type,
      })),
    [locked, type]
  );

  const ITEMS = ["form"] as const;

  return (
    <>
      <FlatList
        data={ITEMS}
        keyExtractor={(item) => item}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        renderItem={() => (
          <View>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginBottom: 8 }}>
              Report Type
            </Text>
            <SegmentedButtons
              value={type}
              onValueChange={(v) => {
                if (!locked) setType(v as ReportType);
              }}
              buttons={buttons}
              style={styles.segment}
            />

      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 16, marginBottom: 8 }}>
        Title ({title.length}/{MAX_TITLE})
      </Text>
      <TextInput
        mode="outlined"
        placeholder="Brief summary of the issue"
        value={title}
        onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE))}
        maxLength={MAX_TITLE}
        style={styles.input}
        accessibilityLabel="Report title"
      />

      <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 16, marginBottom: 8 }}>
        Description{type !== "crash" ? " (required)" : " (optional)"}
      </Text>
      <TextInput
        mode="outlined"
        placeholder={type === "bug" ? "Steps to reproduce the issue..." : type === "feature" ? "Describe the feature you'd like..." : "Additional context..."}
        value={desc}
        onChangeText={setDesc}
        multiline
        numberOfLines={4}
        style={[styles.input, { minHeight: 100 }]}
        accessibilityLabel="Report description"
      />

      <View style={styles.diagHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
            Include diagnostic data
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            Diagnostic data helps us fix issues faster. No personal data is collected.
          </Text>
        </View>
        <Switch
          value={diag}
          onValueChange={setDiag}
          accessibilityLabel="Include diagnostic data"
        />
      </View>

      <Button
        mode="text"
        icon={expanded ? "chevron-up" : "chevron-down"}
        onPress={() => setExpanded(!expanded)}
        style={{ alignSelf: "flex-start" }}
        accessibilityLabel={expanded ? "Hide diagnostic preview" : "Show diagnostic preview"}
      >
        {expanded ? "Hide Preview" : "Show Preview"}
      </Button>

      {expanded && (
        <View style={[styles.preview, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontFamily: "monospace" }}>
            {diag ? diagText : "Diagnostic data disabled — only app version and platform will be included."}
          </Text>
        </View>
      )}

      <Button
        mode="contained"
        icon="github"
        onPress={handleGitHub}
        disabled={!valid || cooldown > 0}
        style={styles.btn}
        accessibilityLabel="Open report on GitHub"
      >
        {cooldown > 0 ? `Open on GitHub (${cooldown}s)` : "Open on GitHub"}
      </Button>

      <Button
        mode="outlined"
        icon="share-variant"
        onPress={handleShare}
        disabled={!valid || cooldown > 0}
        style={styles.btn}
        accessibilityLabel="Share report"
      >
        {cooldown > 0 ? `Share Report (${cooldown}s)` : "Share Report"}
      </Button>
          </View>
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
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  segment: { marginBottom: 8 },
  input: { marginBottom: 4 },
  diagHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },
  preview: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  btn: {
    marginBottom: 8,
    minHeight: 48,
  },
});
