import type { ConsoleLogEntry, LogLevel } from "./types";

export type { ConsoleLogEntry, LogLevel };

const MAX_ENTRIES = 100;
const MAX_AGE_MS = 60_000; // 1 minute

const buffer: ConsoleLogEntry[] = [];
let installed = false;

function addEntry(level: LogLevel, args: unknown[]): void {
  const message = args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");

  buffer.push({ level, message, timestamp: Date.now() });

  // Evict oldest when over capacity
  while (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

/**
 * Monkey-patches console.log/warn/error to capture output
 * into a circular buffer. Original console methods still fire.
 * Safe to call multiple times — only installs once.
 */
export function setupConsoleLogBuffer(): void {
  if (installed) return;
  installed = true;

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args: unknown[]) => {
    addEntry("log", args);
    origLog.apply(console, args);
  };

  console.warn = (...args: unknown[]) => {
    addEntry("warn", args);
    origWarn.apply(console, args);
  };

  console.error = (...args: unknown[]) => {
    addEntry("error", args);
    origError.apply(console, args);
  };
}

/**
 * Returns console log entries from the last minute,
 * or all entries if fewer than MAX_AGE_MS old.
 */
export function getRecentConsoleLogs(): ConsoleLogEntry[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  return buffer.filter((e) => e.timestamp >= cutoff);
}

/**
 * Formats console log entries for display in reports.
 */
export function formatConsoleLogs(entries: ConsoleLogEntry[]): string {
  if (entries.length === 0) return "No recent console logs";
  return entries
    .map(
      (e, idx) =>
        `${idx + 1}. [${new Date(e.timestamp).toISOString()}] [${e.level.toUpperCase()}] ${e.message}`
    )
    .join("\n");
}

/** Clears the buffer — mainly for testing. */
export function clearConsoleLogBuffer(): void {
  buffer.length = 0;
}

/** Returns whether the buffer is installed — for testing. */
export function isInstalled(): boolean {
  return installed;
}

/** Resets installed flag — for testing only. */
export function resetInstalled(): void {
  installed = false;
}
