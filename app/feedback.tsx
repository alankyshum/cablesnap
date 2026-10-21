import { t } from "@lingui/core/macro";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Alert, findNodeHandle, KeyboardAvoidingView, Linking, Platform, StyleSheet, Switch, TextInput, View, FlatList } from "react-native";
import { useLayout } from "../lib/layout";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/bna-toast";
import { ChevronUp, ChevronDown, ExternalLink, Share2, X } from "lucide-react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import NetInfo from "@react-native-community/netinfo";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  generateGitHubURL,
  generateShareText,
  getRecentErrors,
} from "../lib/errors";
import { recent as recentInteractions } from "../lib/interactions";
import { getRecentConsoleLogs } from "../lib/console-log-buffer";
import type { ConsoleLogEntry, ErrorEntry, Interaction, ReportType } from "../lib/types";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ScreenshotSection } from "@/components/feedback/ScreenshotSection";
import { useFeedbackScreenshot } from "@/hooks/useFeedbackScreenshot";
import { withScreenshotAttachmentNote } from "@/lib/feedback-submission";

const MAX_TITLE = 150;

function getTypeOptions() {
  return [
  { value: "bug", label: t({ id: "feedback.type.bug", message: "Bug Report" }) },
  { value: "feature", label: t({ id: "feedback.type.feature", message: "Feature" }) },
  { value: "crash", label: t({ id: "feedback.type.crash", message: "Crash" }) },
  ] as const;
}

function buildDiagText(
  type: ReportType,
  interactions: Interaction[],
  errors: ErrorEntry[],
  consoleLogs: ConsoleLogEntry[],
): string {
  if (interactions.length === 0 && errors.length === 0 && consoleLogs.length === 0) return t({ id: "feedback.diagnostics.none", message: "No diagnostic data recorded" });
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
      parts.push(t({ id: "feedback.diagnostics.noInteractions", message: "No recent interactions" }));
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
      parts.push(`\n${t({ id: "feedback.diagnostics.noErrors", message: "No errors recorded" })}`);
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
      parts.push(`\n${t({ id: "feedback.diagnostics.noConsoleLogs", message: "No recent console logs" })}`);
    }
  }
  return parts.join("\n");
}

export default function FeedbackScreen() {
  const colors = useThemeColors();
  const typeOptions = getTypeOptions();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const titleRef = useRef<TextInput>(null);
  const params = useLocalSearchParams<{ type?: string; source?: string; screenshotAudit?: string }>();
  const fromShake = params.source === "shake";
  const screenshot = useFeedbackScreenshot(params.screenshotAudit);

  const initial = (params.type === "bug" || params.type === "feature" || params.type === "crash")
    ? params.type
    : "bug";
  const locked = params.type === "crash" || fromShake;

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
    const timer = setTimeout(() => {
      const node = findNodeHandle(titleRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 350);
    return () => clearTimeout(timer);
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

  const includeScreenshot = screenshot.state === "ready" && screenshot.consented;
  const reportPayload = useMemo(() => ({
    type,
    title: title.trim(),
    description: withScreenshotAttachmentNote(desc, includeScreenshot),
    errors,
    interactions,
    consoleLogs,
    includeDiag: diag,
  }), [type, title, desc, errors, interactions, consoleLogs, diag, includeScreenshot]);

  const handleScreenshotShare = useCallback(async () => {
    if (typeof screenshot.uri !== "string" || !screenshot.consented) return;
    try {
      await Sharing.shareAsync(screenshot.uri, {
        mimeType: "image/png",
        dialogTitle: t({ id: "feedback.screenshot.shareDialog", message: "Share reviewed screenshot" }),
      });
    } catch {
      toast.error(t({ id: "feedback.screenshot.shareFailure", message: "Unable to share screenshot" }));
    }
  }, [screenshot.uri, screenshot.consented, toast]);

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
       await Sharing.shareAsync(report.uri, { mimeType: "text/plain", dialogTitle: t({ id: "feedback.share.dialogTitle", message: "Share Report" }) });
      startCooldown();
       toast.success(t({ id: "feedback.share.success", message: "Report shared" }));
    } catch {
       toast.error(t({ id: "feedback.share.failure", message: "Unable to share" }));
    }
  }, [valid, reportPayload, diag, errors, interactions, consoleLogs, startCooldown, toast]);

  const openGitHub = useCallback(async () => {
    if (!valid) return;
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
       Alert.alert(t({ id: "feedback.offline.title", message: "No Internet" }), t({ id: "feedback.offline.message", message: "You appear to be offline. Would you like to share the report instead?" }), [
         { text: t({ id: "feedback.offline.cancel", message: "Cancel" }), style: "cancel" },
         { text: t({ id: "feedback.offline.share", message: "Share Report" }), onPress: () => handleShare() },
      ]);
      return;
    }
    await Linking.openURL(generateGitHubURL(reportPayload));
    startCooldown();
     toast.info(t({ id: "feedback.github.opened", message: "Report opened in browser" }));
  }, [valid, reportPayload, handleShare, startCooldown, toast]);

  const handleGitHub = useCallback(async () => {
    if (!valid) return;
    if (!includeScreenshot) {
      await openGitHub();
      return;
    }
    Alert.alert(
      t({ id: "feedback.screenshot.manualTitle", message: "Attach screenshot manually" }),
      t({ id: "feedback.screenshot.manualMessage", message: "The GitHub draft includes a note, but cannot attach the PNG. Share the reviewed screenshot separately, then attach it to the draft yourself." }),
      [
        { text: t({ id: "common.cancel", message: "Cancel" }), style: "cancel" },
        { text: t({ id: "feedback.screenshot.shareAction", message: "Share screenshot" }), onPress: handleScreenshotShare },
        { text: t({ id: "feedback.github.openDraft", message: "Open GitHub draft" }), onPress: () => { void openGitHub(); } },
      ],
    );
  }, [valid, includeScreenshot, openGitHub, handleScreenshotShare]);

  const diagText = buildDiagText(type, interactions, errors, consoleLogs);

  const buttons = useMemo(
    () =>
      typeOptions.map((o) => ({
        value: o.value,
        label: o.label,
      })),
    [typeOptions]
  );

  const ITEMS = ["form"] as const;
  const shakeIntro = fromShake ? (
    <View style={styles.modalIntro}>
      <View style={styles.modalIntroCopy}>
        <Text variant="subtitle" style={{ color: colors.onSurface }} accessibilityRole="header">
          {t({ id: "feedback.shake.title", message: "Report what you saw" })}
        </Text>
        <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
          {t({ id: "feedback.shake.subtitle", message: "A screenshot was attempted before this overlay opened." })}
        </Text>
      </View>
      <Button
        variant="ghost"
        size="icon"
        icon={X}
        onPress={() => router.back()}
        accessibilityLabel={t({ id: "feedback.closeA11y", message: "Close feedback and return to the previous screen" })}
        testID="feedback-close"
      />
    </View>
  ) : null;
  const typePicker = fromShake ? (
    <View style={[styles.lockedType, { backgroundColor: colors.surfaceVariant }]}>
      <Text variant="body" style={{ color: colors.onSurface }}>{t({ id: "feedback.type.bug", message: "Bug Report" })}</Text>
    </View>
  ) : (
    <SegmentedControl
      value={type}
      onValueChange={(value) => {
        if (!locked) setType(value as ReportType);
      }}
      buttons={buttons}
      style={styles.segment}
    />
  );
  const screenshotSection = fromShake ? (
    <ScreenshotSection
      colors={colors}
      state={screenshot.state}
      uri={screenshot.uri}
      consented={screenshot.consented}
      onConsentChange={screenshot.setConsented}
      onRemove={screenshot.remove}
      onShare={handleScreenshotShare}
    />
  ) : null;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        data={ITEMS}
        keyExtractor={(item) => item}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding, paddingBottom: Math.max(40, insets.bottom + 24) }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        renderItem={() => (
          <View style={styles.form} accessibilityViewIsModal={fromShake || undefined} testID="feedback-form">
            {shakeIntro}
            <Text variant="subtitle" style={{ color: colors.onSurface, marginBottom: 8 }}>
              Report Type
            </Text>
            {typePicker}

      <Text variant="subtitle" style={{ color: colors.onSurface, marginTop: 16, marginBottom: 8 }}>
        Title ({title.length}/{MAX_TITLE})
      </Text>
      <Input
        ref={titleRef}
        variant="outline"
         placeholder={t({ id: "feedback.title.placeholder", message: "Brief summary of the issue" })}
        value={title}
        onChangeText={(t) => setTitle(t.slice(0, MAX_TITLE))}
        maxLength={MAX_TITLE}
        inputStyle={styles.input}
         accessibilityLabel={t({ id: "feedback.title.a11y", message: "Report title" })}
      />

      {screenshotSection}

      <Text variant="subtitle" style={{ color: colors.onSurface, marginTop: 16, marginBottom: 8 }}>
        Description{type !== "crash" ? " (required)" : " (optional)"}
      </Text>
      <Input
        variant="outline"
         placeholder={type === "bug" ? t({ id: "feedback.description.bugPlaceholder", message: "Steps to reproduce the issue..." }) : type === "feature" ? t({ id: "feedback.description.featurePlaceholder", message: "Describe the feature you'd like..." }) : t({ id: "feedback.description.crashPlaceholder", message: "Additional context..." })}
        value={desc}
        onChangeText={setDesc}
        type="textarea"
        rows={4}
        inputStyle={{ ...styles.input, minHeight: 100 }}
         accessibilityLabel={t({ id: "feedback.description.a11y", message: "Report description" })}
      />

      <View style={styles.diagHeader}>
        <View style={{ flex: 1 }}>
          <Text variant="subtitle" style={{ color: colors.onSurface }}>
            Include diagnostic data
          </Text>
          <Text variant="caption" style={{ color: colors.onSurfaceVariant }}>
            {t({ id: "feedback.diagnostics.privacy", message: "Diagnostic data can include recent screens, actions, errors, device details, and visible log content. Review the preview before sharing." })}
          </Text>
        </View>
        <Switch
          value={diag}
          onValueChange={setDiag}
           accessibilityLabel={t({ id: "feedback.diagnostics.includeA11y", message: "Include diagnostic data" })}
        />
      </View>

      <Button
        variant="ghost"
        icon={expanded ? ChevronUp : ChevronDown}
        onPress={() => setExpanded(!expanded)}
        style={{ alignSelf: "flex-start" }}
         accessibilityLabel={expanded ? t({ id: "feedback.preview.hideA11y", message: "Hide diagnostic preview" }) : t({ id: "feedback.preview.showA11y", message: "Show diagnostic preview" })}
         label={expanded ? t({ id: "feedback.preview.hide", message: "Hide Preview" }) : t({ id: "feedback.preview.show", message: "Show Preview" })}
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
         accessibilityLabel={t({ id: "feedback.github.a11y", message: "Open report on GitHub" })}
         label={cooldown > 0 ? t({ id: "feedback.github.cooldown", message: `Open on GitHub (${cooldown}s)` }) : t({ id: "feedback.github.open", message: "Open on GitHub" })}
      />

      <Button
        variant="outline"
        icon={Share2}
        onPress={handleShare}
        disabled={!valid || cooldown > 0}
        style={styles.btn}
         accessibilityLabel={t({ id: "feedback.share.a11y", message: "Share report" })}
         label={cooldown > 0 ? t({ id: "feedback.share.cooldown", message: `Share Report (${cooldown}s)` }) : t({ id: "feedback.share.label", message: "Share Report" })}
      />
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  form: { width: "100%", maxWidth: 600, alignSelf: "center" },
  modalIntro: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  modalIntroCopy: { flex: 1, gap: 4 },
  lockedType: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16, borderRadius: 8, marginBottom: 8 },
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
