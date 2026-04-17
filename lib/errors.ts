import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { getDatabase } from "./db";
import { recent as recentInteractions } from "./interactions";
import { getRecentConsoleLogs, formatConsoleLogs } from "./console-log-buffer";
import { uuid } from "./uuid";
import type { ConsoleLogEntry, ErrorEntry, Interaction, ReportType } from "./types";

declare const ErrorUtils: {
  setGlobalHandler: (callback: (error: Error, isFatal?: boolean) => void) => void;
  getGlobalHandler: () => (error: Error, isFatal?: boolean) => void;
};

const MAX_ERRORS = 50;

type ErrorRow = {
  id: string;
  message: string;
  stack: string | null;
  component: string | null;
  fatal: number;
  timestamp: number;
  app_version: string | null;
  platform: string | null;
  os_version: string | null;
};

function mapRow(row: ErrorRow): ErrorEntry {
  return {
    ...row,
    fatal: row.fatal === 1,
  };
}

export async function logError(
  error: Error,
  opts?: { component?: string; fatal?: boolean }
): Promise<void> {
  try {
    const database = await getDatabase();
    const id = uuid();
    await database.runAsync(
      `INSERT INTO error_log (id, message, stack, component, fatal, timestamp, app_version, platform, os_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        error.message || "Unknown error",
        error.stack ?? null,
        opts?.component ?? null,
        opts?.fatal ? 1 : 0,
        Date.now(),
        Constants.expoConfig?.version ?? null,
        Platform.OS,
        String(Platform.Version),
      ]
    );
    // trim to MAX_ERRORS
    await database.runAsync(
      `DELETE FROM error_log WHERE id NOT IN (
        SELECT id FROM error_log ORDER BY timestamp DESC LIMIT ?
      )`,
      [MAX_ERRORS]
    );
  } catch {
    // If DB write fails, silently ignore — never crash the crash handler
  }
}

export async function getRecentErrors(limit = 20): Promise<ErrorEntry[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<ErrorRow>(
    "SELECT * FROM error_log ORDER BY timestamp DESC LIMIT ?",
    [limit]
  );
  return rows.map(mapRow);
}

export async function getErrorCount(): Promise<number> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM error_log"
  );
  return row?.count ?? 0;
}

export async function clearErrorLog(): Promise<void> {
  const database = await getDatabase();
  await database.runAsync("DELETE FROM error_log");
}

export async function generateReport(): Promise<string> {
  const errors = await getRecentErrors(MAX_ERRORS);
  const interactions = await recentInteractions();
  const consoleLogs = getRecentConsoleLogs();

  let deviceInfo: Record<string, string | number | null> = {};
  try {
    deviceInfo = {
      deviceName: Device.deviceName ?? "unknown",
      modelName: Device.modelName ?? "unknown",
      totalMemory: Device.totalMemory ?? null,
      executionEnvironment: Constants.executionEnvironment ?? "unknown",
    };
  } catch {
    deviceInfo = { error: "Device info unavailable" };
  }

  return JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      app_version: Constants.expoConfig?.version ?? "unknown",
      platform: Platform.OS,
      os_version: String(Platform.Version),
      device: deviceInfo,
      error_count: errors.length,
      errors,
      interactions,
      console_logs: consoleLogs,
    },
    null,
    2
  );
}

export function formatInteractions(items: Interaction[]): string {
  if (items.length === 0) return "No recent interactions";
  return items
    .map(
      (i, idx) =>
        `${idx + 1}. [${new Date(i.timestamp).toISOString()}] ${i.action}: ${i.screen}${i.detail ? ` — ${i.detail}` : ""}`
    )
    .join("\n");
}

function formatErrors(items: ErrorEntry[]): string {
  if (items.length === 0) return "No errors recorded";
  return items
    .map((e) => {
      const stack = e.stack
        ? e.stack.split("\n").slice(0, 2).join("\n")
        : "";
      return `- [${new Date(e.timestamp).toISOString()}] ${e.message} (fatal: ${e.fatal})${stack ? `\n  ${stack}` : ""}`;
    })
    .join("\n");
}

function getDeviceInfo(): string {
  try {
    const lines: string[] = [];
    lines.push(`- Device: ${Device.modelName ?? "unknown"}`);
    lines.push(`- Device Name: ${Device.deviceName ?? "unknown"}`);
    lines.push(`- Total Memory: ${Device.totalMemory != null ? `${Math.round(Device.totalMemory / 1024 / 1024)} MB` : "unknown"}`);
    lines.push(`- Execution Environment: ${Constants.executionEnvironment ?? "unknown"}`);
    return lines.join("\n");
  } catch {
    return "- Device info unavailable";
  }
}

export function buildReportBody(opts: {
  type: ReportType;
  description: string;
  errors: ErrorEntry[];
  interactions: Interaction[];
  consoleLogs?: ConsoleLogEntry[];
  includeDiag: boolean;
  includeDeviceInfo?: boolean;
}): string {
  const version = Constants.expoConfig?.version ?? "unknown";
  const parts: string[] = [];

  parts.push("## Description\n");
  parts.push(opts.description || "(no description)");
  parts.push("");

  parts.push("## Diagnostic Info\n");
  parts.push(`- App Version: ${version}`);
  parts.push(`- Platform: ${Platform.OS}`);
  parts.push(`- OS Version: ${String(Platform.Version)}`);
  parts.push("");

  if (opts.includeDeviceInfo !== false) {
    parts.push("## Device Info\n");
    parts.push(getDeviceInfo());
    parts.push("");
  }

  if (opts.includeDiag) {
    parts.push("## Recent Interactions\n");
    parts.push(formatInteractions(opts.interactions));
    parts.push("");

    if (opts.type !== "feature") {
      parts.push("## Error Log\n");
      parts.push(formatErrors(opts.errors));
      parts.push("");

      parts.push("## Console Logs\n");
      parts.push(formatConsoleLogs(opts.consoleLogs ?? []));
      parts.push("");
    }
  }

  return parts.join("\n");
}

const MAX_URL = 8000;

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- consoleLogs param kept for API consistency with generateGitHubURL
export function truncateBody(body: string, errors: ErrorEntry[], interactions: Interaction[], desc: string, type: ReportType, includeDiag: boolean, consoleLogs?: ConsoleLogEntry[]): string {
  const check = (b: string) =>
    `https://github.com/alankyshum/fitforge/issues/new?title=x&body=${encodeURIComponent(b)}`.length;

  if (check(body) <= MAX_URL) return body;

  // Phase 0: remove device info first (least valuable for debugging)
  const noDeviceInfo = buildReportBody({
    type,
    description: desc,
    errors,
    interactions,
    consoleLogs,
    includeDiag,
    includeDeviceInfo: false,
  });
  if (check(noDeviceInfo) <= MAX_URL) return noDeviceInfo + "\n\n[truncated — share full report for details]";

  // Phase 1: also remove console logs
  const noConsoleLogs = buildReportBody({
    type,
    description: desc,
    errors,
    interactions,
    consoleLogs: [],
    includeDiag,
    includeDeviceInfo: false,
  });
  if (check(noConsoleLogs) <= MAX_URL) return noConsoleLogs + "\n\n[truncated — share full report for details]";

  // Phase 2: remove stack traces from errors
  const noStacks = buildReportBody({
    type,
    description: desc,
    errors: errors.map((e) => ({ ...e, stack: null })),
    interactions,
    includeDiag,
    includeDeviceInfo: false,
  });
  if (check(noStacks) <= MAX_URL) return noStacks + "\n\n[truncated — share full report for details]";

  // Phase 3: remove errors entirely
  const noErrors = buildReportBody({
    type,
    description: desc,
    errors: [],
    interactions,
    includeDiag,
    includeDeviceInfo: false,
  });
  if (check(noErrors) <= MAX_URL) return noErrors + "\n\n[truncated — share full report for details]";

  // Phase 4: trim interactions
  let trimmed = interactions;
  while (trimmed.length > 0) {
    trimmed = trimmed.slice(0, -1);
    const attempt = buildReportBody({
      type,
      description: desc,
      errors: [],
      interactions: trimmed,
      includeDiag,
      includeDeviceInfo: false,
    });
    if (check(attempt) <= MAX_URL) return attempt + "\n\n[truncated — share full report for details]";
  }

  // Phase 5: truncate description
  let short = desc;
  while (short.length > 20) {
    short = short.slice(0, Math.floor(short.length * 0.7));
    const attempt = buildReportBody({
      type,
      description: short + "...",
      errors: [],
      interactions: [],
      includeDiag,
      includeDeviceInfo: false,
    });
    if (check(attempt) <= MAX_URL) return attempt + "\n\n[truncated — share full report for details]";
  }

  return buildReportBody({ type, description: "...", errors: [], interactions: [], includeDiag, includeDeviceInfo: false }) +
    "\n\n[truncated — share full report for details]";
}

export function generateGitHubURL(opts: {
  type: ReportType;
  title: string;
  description: string;
  errors: ErrorEntry[];
  interactions: Interaction[];
  consoleLogs?: ConsoleLogEntry[];
  includeDiag: boolean;
}): string {
  const labels =
    opts.type === "bug"
      ? "bug"
      : opts.type === "feature"
        ? "enhancement"
        : "bug,crash";

  const body = buildReportBody(opts);
  const final = truncateBody(body, opts.errors, opts.interactions, opts.description, opts.type, opts.includeDiag, opts.consoleLogs);
  const encoded = encodeURIComponent(final);
  const title = encodeURIComponent(opts.title.slice(0, 150));
  return `https://github.com/alankyshum/fitforge/issues/new?title=${title}&body=${encoded}&labels=${labels}`;
}

export function generateShareText(opts: {
  type: ReportType;
  title: string;
  description: string;
  errors: ErrorEntry[];
  interactions: Interaction[];
  consoleLogs?: ConsoleLogEntry[];
  includeDiag: boolean;
}): string {
  const version = Constants.expoConfig?.version ?? "unknown";
  const lines: string[] = [];
  lines.push(`FitForge ${opts.type === "bug" ? "Bug Report" : opts.type === "feature" ? "Feature Request" : "Crash Report"}`);
  lines.push(`Title: ${opts.title}`);
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push(`App Version: ${version}`);
  lines.push(`Platform: ${Platform.OS} ${String(Platform.Version)}`);
  lines.push("");
  lines.push("Device Info:");
  lines.push(getDeviceInfo());
  lines.push("");
  lines.push("Description:");
  lines.push(opts.description || "(none)");
  lines.push("");

  if (opts.includeDiag) {
    lines.push("Recent Interactions:");
    lines.push(formatInteractions(opts.interactions));
    lines.push("");
    if (opts.type !== "feature") {
      lines.push("Errors:");
      lines.push(formatErrors(opts.errors));
      lines.push("");
      lines.push("Console Logs:");
      lines.push(formatConsoleLogs(opts.consoleLogs ?? []));
    }
  }

  return lines.join("\n");
}

let installed = false;

export function setupGlobalHandler(): void {
  if (installed) return;
  installed = true;

  const prev = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, fatal?: boolean) => {
    logError(error, { fatal: fatal ?? true });
    prev(error, fatal);
  });
}
