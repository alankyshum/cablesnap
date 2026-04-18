import React from "react";
import { Appearance, Linking, ScrollView, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { Colors } from "../theme/colors";
import { logError, generateReport, generateGitHubURL, getRecentErrors } from "../lib/errors";
import { recent as recentInteractions } from "../lib/interactions";

type Props = { children: React.ReactNode };
type State = { error: Error | null; expanded: boolean };

function themeColors() {
  const scheme = Appearance.getColorScheme() === "dark" ? "dark" : "light";
  return Colors[scheme];
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, expanded: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(error, { component: info.componentStack ?? undefined, fatal: true });
  }

  handleRestart = () => {
    this.setState({ error: null, expanded: false });
  };

  handleShare = async () => {
    try {
      const report = await generateReport();
      const file = new File(Paths.cache, "fitforge-crash-report.json");
      await file.write(report);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/json",
        dialogTitle: "Share Crash Report",
      });
    } catch {
      // If sharing fails, silently ignore — we're already in a crash state
    }
  };

  handleGitHub = async () => {
    try {
      const [errors, interactions] = await Promise.all([
        getRecentErrors(5),
        recentInteractions(),
      ]);
      const url = generateGitHubURL({
        type: "crash",
        title: `Crash: ${this.state.error?.message?.slice(0, 100) ?? "Unknown error"}`,
        description: this.state.error?.message ?? "Application crashed",
        errors,
        interactions,
        includeDiag: true,
      });
      await Linking.openURL(url);
    } catch {
      // If opening URL fails, silently ignore
    }
  };

  render() {
    if (!this.state.error) return this.props.children;

    const t = themeColors();

    return (
      <View style={[styles.container, { backgroundColor: t.background }]}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text variant="headlineLarge" style={[styles.heading, { color: t.foreground }]}>
            Something went wrong
          </Text>
          <Text variant="bodyMedium" style={[styles.sub, { color: t.mutedForeground }]}>
            The app encountered an unexpected error. You can share a crash
            report to help us fix the issue, or restart the app.
          </Text>

          <Button
            mode="outlined"
            onPress={() => this.setState((s) => ({ expanded: !s.expanded }))}
            style={styles.btn}
            icon={this.state.expanded ? "chevron-up" : "chevron-down"}
            accessibilityLabel={this.state.expanded ? "Hide error details" : "Show error details"}
          >
            {this.state.expanded ? "Hide Details" : "Show Details"}
          </Button>

          {this.state.expanded && (
            <ScrollView style={[styles.stack, { backgroundColor: t.muted }]} nestedScrollEnabled>
              <Text variant="bodySmall" style={[styles.mono, { color: t.mutedForeground }]}>
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </Text>
            </ScrollView>
          )}

          <Button
            mode="contained"
            icon="share-variant"
            onPress={this.handleShare}
            style={styles.btn}
            accessibilityLabel="Share crash report"
          >
            Share Crash Report
          </Button>

          <Button
            mode="outlined"
            icon="github"
            onPress={this.handleGitHub}
            style={styles.btn}
            accessibilityLabel="Report crash on GitHub"
          >
            Report on GitHub
          </Button>

          <Button
            mode="contained-tonal"
            icon="restart"
            onPress={this.handleRestart}
            style={styles.btn}
            accessibilityLabel="Restart app"
          >
            Restart
          </Button>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingTop: 80,
    alignItems: "center",
  },
  heading: {
    marginBottom: 16,
    textAlign: "center",
  },
  sub: {
    marginBottom: 24,
    textAlign: "center",
  },
  btn: {
    marginBottom: 12,
    width: "100%",
  },
  stack: {
    maxHeight: 200,
    width: "100%",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  mono: {
    fontFamily: "monospace",
    fontSize: 12,
  },
});
