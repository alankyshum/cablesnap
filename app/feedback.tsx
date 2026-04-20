import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, StyleSheet, Switch, View } from "react-native";
import { useLayout } from "../lib/layout";
import { FlashList } from "@shopify/flash-list";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/bna-toast";
import { ChevronUp, ChevronDown, ExternalLink, Share2 } from "lucide-react-native";
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
import { getRecentConsoleLogs } from "../lib/console-log-buffer";
import type { ConsoleLogEntry, ErrorEntry, Interaction, ReportType } from "../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";

const MAX_TITLE = 150;

const TYPE_OPTIONS = [
  { value: "bug", label: "Bug Report" },
  { value: "feature", label: "Feature" },
  { value: "crash", label: "Crash" },
] as const;

function buildDiagText(
  type: ReportType,
  interactions: Interaction[],
  errors: ErrorEntry[],
  consoleLogs: ConsoleLogEntry[],
): string {
  if (interactions.length === 0 && errors.length === 0 && consoleLogs.length === 0) return "No diagnostic data recorded";
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
    if (consoleLogs.length > 0) {
      parts.push(
        `\nLast ${consoleLogs.length} console log${consoleLogs.length > 1 ? "s" : ""}:\n` +
          consoleLogs
            .map(
              (l, idx) =>
                `  ${idx + 1}. [${new Date(l.timestamp).toLocaleTimeString()}] [${l.level.toUpperCase()}] ${l.message.slice(0, 120)}`
            )
            .join("\n")
      );
    } else {
      parts.push("\nNo recent console logs");
    }
  }
  return parts.join("\n");
}

export default function FeedbackScreen() {
  const colors = useThemeColors();
  const layout = useLayout();
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
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const toast = useToast();
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const [e, i] = await Promise.all([getRecentErrors(5), recentInteractions()]);
      setErrors(e);
      setInteractions(i);
      setConsoleLogs(getRecentConsoleLogs());
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
  }, [cooldown]);

  const valid = title.trim().length > 0 &&
    (type === "crash" || desc.trim().length > 0);

  const startCooldown = useCallback(() => setCooldown(5), []);

  const reportPayload = useMemo(() => ({
    type,
    title: title.trim(),
    description: desc.trim(),
    errors,
    interactions,
    consoleLogs,
    includeDiag: diag,
  }), [type, title, desc, errors, interactions, consoleLogs, diag]);

  const handleShare = useCallback(async () => {
    if (!valid) return;
    try {
      const text = generateShareText(reportPayload);
      const json = JSON.stringify({
        ...reportPayload, generated_at: new Date().toISOString(),
        errors: diag ? errors : [], interactions: diag ? interactions : [],
        console_logs: diag ? consoleLogs : [],
      }, null, 2);
      const report = new File(Paths.cache, "cablesnap-report.txt");
      await report.write(text);
      const artifact = new File(Paths.cache, "cablesnap-report.json");
      await artifact.write(json);
      await Sharing.shareAsync(report.uri, { mimeType: "text/plain", dialogTitle: "Share Report" });
      startCooldown();
      toast.success("Report shared");
    } catch {
      toast.error("Unable to share");
    }
  }, [valid, reportPayload, diag, errors, interactions, consoleLogs, startCooldown, toast]);

  const handleGitHub = useCallback(async () => {
    if (!valid) return;
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert("No Internet", "You appear to be offline. Would you like to share the report instead?", [
        { text: "Cancel", style: "cancel" },
        { text: "Share Report", onPress: () => handleShare() },
      ]);
      return;
    }
    await Linking.openURL(generateGitHubURL(reportPayload));
    startCooldown();
    toast.info("Report opened in browser");
  }, [valid, reportPayload, handleShare, startCooldown, toast]);

  const diagText = buildDiagText(type, interactions, errors, consoleLogs);

  const buttons = useMemo(
    () =>
      TYPE_OPTIONS.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    []
  );

  const ITEMS = ["form"] as const;

  return (
    <>
      <FlashList
        data={ITEMS}
        keyExtractor={(item) => item}
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
        renderItem={() => (
          <View>
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
              Report Type
            </Text>
            <SegmentedControl
              value={type}
              onValueChange={(v) => {
                if (!locked) setType(v as ReportType);
              }}
              buttons={buttons}
              style={styles.segment}
            />

      <Text variant="subtitle" style={{ color: colors.onSurface, marginTop: 16, marginBottom: 8 }}>
        Title ({title.length}/{MAX_TITLE})
      </Text>
      <Input
        variant="outline"
        placeholder="Brief summary of the issue"
        value={title}
        onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE))}
        maxLength={MAX_TITLE}
        inputStyle={styles.input}
        accessibilityLabel="Report title"
      />

      <Text variant="subtitle" style={{ color: colors.onSurface, marginTop: 16, marginBottom: 8 }}>
        Description{type !== "crash" ? " (required)" : " (optional)"}
      </Text>
      <Input
        variant="outline"
        placeholder={type === "bug" ? "Steps to reproduce the issue..." : type === "feature" ? "Describe the feature you'd like..." : "Additional context..."}
        value={desc}
        onChangeText={setDesc}
        type="textarea"
        rows={4}
        inputStyle={{ ...styles.input, minHeight: 100 }}
        accessibilityLabel="Report description"
      />

      <View style={styles.diagHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle" style={{ color: colors.onSurface }}>
            Include diagnostic data
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
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
        variant="ghost"
        icon={expanded ? ChevronUp : ChevronDown}
        onPress={() => setExpanded(!expanded)}
        style={{ alignSelf: "flex-start" }}
        accessibilityLabel={expanded ? "Hide diagnostic preview" : "Show diagnostic preview"}
        label={expanded ? "Hide Preview" : "Show Preview"}
      />

      {expanded && (
        <View style={[styles.preview, { backgroundColor: colors.surfaceVariant }]}>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant, fontFamily: "monospace" }}>
            {diag ? diagText : "Diagnostic data disabled — only app version and platform will be included."}
          </Text>
        </View>
      )}

      <Button
        variant="default"
        icon={ExternalLink}
        onPress={handleGitHub}
        disabled={!valid || cooldown > 0}
        style={styles.btn}
        accessibilityLabel="Open report on GitHub"
        label={cooldown > 0 ? `Open on GitHub (${cooldown}s)` : "Open on GitHub"}
      />

      <Button
        variant="outline"
        icon={Share2}
        onPress={handleShare}
        disabled={!valid || cooldown > 0}
        style={styles.btn}
        accessibilityLabel="Share report"
        label={cooldown > 0 ? `Share Report (${cooldown}s)` : "Share Report"}
      />
          </View>
        )}
      />
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
