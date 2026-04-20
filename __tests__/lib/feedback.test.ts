jest.mock("react-native", () => ({
  Platform: { OS: "ios", Version: "17.4" },
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "1.0.0" } },
}));

jest.mock("../../lib/db", () => ({
  getDatabase: jest.fn().mockResolvedValue({}),
}));

jest.mock("../../lib/interactions", () => ({
  recent: jest.fn().mockResolvedValue([]),
}));

import {
  buildReportBody,
  generateGitHubURL,
  generateShareText,
  truncateBody,
  formatInteractions,
} from "../../lib/errors";
import type { ErrorEntry, Interaction } from "../../lib/types";

function makeInteraction(overrides?: Partial<Interaction>): Interaction {
  return {
    id: "i1",
    action: "navigate",
    screen: "Home",
    detail: null,
    timestamp: 1700000000000,
    ...overrides,
  };
}

function makeError(overrides?: Partial<ErrorEntry>): ErrorEntry {
  return {
    id: "e1",
    message: "Test error",
    stack: "Error: Test\n  at foo.ts:1\n  at bar.ts:2\n  at baz.ts:3",
    component: null,
    fatal: false,
    timestamp: 1700000000000,
    app_version: "1.0.0",
    platform: "ios",
    os_version: "17.4",
    ...overrides,
  };
}

describe("formatInteractions", () => {
  it("returns 'No recent interactions' for empty array", () => {
    expect(formatInteractions([])).toBe("No recent interactions");
  });

  it("formats interactions with detail", () => {
    const items = [makeInteraction({ detail: "Bench Press" })];
    const result = formatInteractions(items);
    expect(result).toContain("navigate: Home — Bench Press");
  });

  it("formats interactions without detail", () => {
    const items = [makeInteraction()];
    const result = formatInteractions(items);
    expect(result).toContain("navigate: Home");
    expect(result).not.toContain("—");
  });
});

describe("buildReportBody", () => {
  it("includes description and diagnostic info", () => {
    const body = buildReportBody({
      type: "bug",
      description: "Something broke",
      errors: [makeError()],
      interactions: [makeInteraction()],
      includeDiag: true,
    });
    expect(body).toContain("Something broke");
    expect(body).toContain("App Version: 1.0.0");
    expect(body).toContain("Recent Interactions");
    expect(body).toContain("Error Log");
  });

  it("excludes diagnostic data when includeDiag is false", () => {
    const body = buildReportBody({
      type: "bug",
      description: "desc",
      errors: [makeError()],
      interactions: [makeInteraction()],
      includeDiag: false,
    });
    expect(body).toContain("desc");
    expect(body).toContain("App Version");
    expect(body).not.toContain("Recent Interactions");
    expect(body).not.toContain("Error Log");
  });

  it("excludes error log for feature requests", () => {
    const body = buildReportBody({
      type: "feature",
      description: "New feature",
      errors: [makeError()],
      interactions: [makeInteraction()],
      includeDiag: true,
    });
    expect(body).toContain("Recent Interactions");
    expect(body).not.toContain("Error Log");
  });

  it("shows 'No errors recorded' when empty", () => {
    const body = buildReportBody({
      type: "bug",
      description: "desc",
      errors: [],
      interactions: [makeInteraction()],
      includeDiag: true,
    });
    expect(body).toContain("No errors recorded");
  });

  it("shows 'No recent interactions' when empty", () => {
    const body = buildReportBody({
      type: "bug",
      description: "desc",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(body).toContain("No recent interactions");
    expect(body).toContain("No errors recorded");
  });
});

describe("generateGitHubURL", () => {
  it("generates URL with bug label", () => {
    const url = generateGitHubURL({
      type: "bug",
      title: "Test Bug",
      description: "desc",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(url).toContain("github.com/alankyshum/cablesnap/issues/new");
    expect(url).toContain("title=Test%20Bug");
    expect(url).toContain("labels=bug");
  });

  it("generates URL with enhancement label for feature", () => {
    const url = generateGitHubURL({
      type: "feature",
      title: "New Feature",
      description: "desc",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(url).toContain("labels=enhancement");
  });

  it("generates URL with bug,crash labels for crash", () => {
    const url = generateGitHubURL({
      type: "crash",
      title: "Crash",
      description: "desc",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(url).toContain("labels=bug,crash");
  });

  it("truncates title to 150 chars", () => {
    const long = "A".repeat(200);
    const url = generateGitHubURL({
      type: "bug",
      title: long,
      description: "d",
      errors: [],
      interactions: [],
      includeDiag: false,
    });
    const match = url.match(/title=([^&]*)/);
    expect(match).toBeTruthy();
    const decoded = decodeURIComponent(match![1]);
    expect(decoded.length).toBeLessThanOrEqual(150);
  });
});

describe("truncateBody", () => {
  it("returns body unchanged when under limit", () => {
    const body = "Short body";
    const result = truncateBody(body, [], [], "desc", "bug", true);
    expect(result).toBe("Short body");
  });

  it("appends truncated marker when body needs trimming", () => {
    const long = "X".repeat(10000);
    const errors = [makeError({ stack: "S".repeat(3000) })];
    const interactions = Array.from({ length: 10 }, (_, i) =>
      makeInteraction({ id: `i${i}`, detail: "D".repeat(200) })
    );
    const body = buildReportBody({
      type: "bug",
      description: long,
      errors,
      interactions,
      includeDiag: true,
    });
    const result = truncateBody(body, errors, interactions, long, "bug", true);
    expect(result).toContain("[truncated");
    // Verify the resulting URL would be under the limit
    const url = `https://github.com/alankyshum/cablesnap/issues/new?title=x&body=${encodeURIComponent(result)}`;
    expect(url.length).toBeLessThanOrEqual(8000);
  });
});

describe("generateShareText", () => {
  it("produces human-readable text with title and description", () => {
    const text = generateShareText({
      type: "bug",
      title: "My Bug",
      description: "It broke",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(text).toContain("Bug Report");
    expect(text).toContain("Title: My Bug");
    expect(text).toContain("It broke");
    expect(text).toContain("App Version: 1.0.0");
  });

  it("labels feature requests correctly", () => {
    const text = generateShareText({
      type: "feature",
      title: "Idea",
      description: "Add this",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(text).toContain("Feature Request");
  });

  it("excludes diagnostics when disabled", () => {
    const text = generateShareText({
      type: "bug",
      title: "Bug",
      description: "desc",
      errors: [makeError()],
      interactions: [makeInteraction()],
      includeDiag: false,
    });
    expect(text).not.toContain("navigate: Home");
    expect(text).not.toContain("Test error");
  });
});

describe("device info (BLD-292)", () => {
  it("buildReportBody includes Device Info section by default", () => {
    const body = buildReportBody({
      type: "bug",
      description: "test",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(body).toContain("## Device Info");
    expect(body).toContain("Test Model");
    expect(body).toContain("Test Device");
    expect(body).toContain("4096 MB");
  });

  it("buildReportBody excludes Device Info when includeDeviceInfo is false", () => {
    const body = buildReportBody({
      type: "bug",
      description: "test",
      errors: [],
      interactions: [],
      includeDiag: true,
      includeDeviceInfo: false,
    });
    expect(body).not.toContain("## Device Info");
    expect(body).not.toContain("Test Model");
  });

  it("generateShareText includes device info", () => {
    const text = generateShareText({
      type: "bug",
      title: "Bug",
      description: "desc",
      errors: [],
      interactions: [],
      includeDiag: true,
    });
    expect(text).toContain("Device Info:");
    expect(text).toContain("Test Model");
  });

  it("truncation removes device info first (Phase 0)", () => {
    const long = "X".repeat(8000);
    const errors = [makeError()];
    const interactions = [makeInteraction()];
    const body = buildReportBody({
      type: "bug",
      description: long,
      errors,
      interactions,
      includeDiag: true,
    });
    const result = truncateBody(body, errors, interactions, long, "bug", true);
    expect(result).toContain("[truncated");
    const url = `https://github.com/alankyshum/cablesnap/issues/new?title=x&body=${encodeURIComponent(result)}`;
    expect(url.length).toBeLessThanOrEqual(8000);
  });
});
