/**
 * BLD-1257 (QD #4): the exported diagnostics text must include the Sentry
 * event id, the failure phase, AND a breadcrumb tail (recent buffered
 * console logs). This is the contract for the "Export diagnostics" CTA on
 * DatabaseUnavailableScreen — users quote this text in bug reports.
 */
import { buildDatabaseDiagnostics } from "@/components/DatabaseUnavailableScreen";
import { DatabaseUnavailableError } from "@/lib/db/errors";
import * as buffer from "@/lib/console-log-buffer";

jest.mock("@/lib/console-log-buffer", () => ({
  getRecentConsoleLogs: jest.fn(),
  formatConsoleLogs: jest.fn(),
}));

describe("BLD-1257 — buildDatabaseDiagnostics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("includes phase, error message, Sentry event id, ISO timestamp, and the breadcrumb tail", () => {
    const fakeEntries = [
      { level: "info" as const, message: "db init_start", timestamp: 1, args: [] },
    ];
    (buffer.getRecentConsoleLogs as jest.Mock).mockReturnValue(fakeEntries);
    (buffer.formatConsoleLogs as jest.Mock).mockReturnValue(
      "1. [2026-05-16T05:00:00.000Z] [INFO] db init_start",
    );

    const err = new DatabaseUnavailableError("open", new Error("NPE"));
    const out = buildDatabaseDiagnostics(err, "abc123", new Date("2026-05-16T05:00:00.000Z"));

    expect(out).toContain("phase: open");
    expect(out).toContain("error: ");
    expect(out).toContain("sentry_event_id: abc123");
    expect(out).toContain("time: 2026-05-16T05:00:00.000Z");
    expect(out).toContain("--- breadcrumb tail (recent console logs) ---");
    expect(out).toContain("db init_start");
    expect(buffer.getRecentConsoleLogs).toHaveBeenCalled();
    expect(buffer.formatConsoleLogs).toHaveBeenCalledWith(fakeEntries);
  });

  it("falls back to '(unavailable)' when no Sentry event id was captured", () => {
    (buffer.getRecentConsoleLogs as jest.Mock).mockReturnValue([]);
    (buffer.formatConsoleLogs as jest.Mock).mockReturnValue("No recent console logs");

    const err = new DatabaseUnavailableError("probe", new Error("handle null"));
    const out = buildDatabaseDiagnostics(err, undefined, new Date("2026-05-16T05:00:00.000Z"));

    expect(out).toContain("sentry_event_id: (unavailable)");
    expect(out).toContain("phase: probe");
    expect(out).toContain("No recent console logs");
  });
});
