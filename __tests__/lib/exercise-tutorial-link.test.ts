/**
 * BLD-593: Exercise form-tutorial quick-link helper (GH #332 interim).
 */
import { Alert, Linking } from "react-native";
import * as Sentry from "@sentry/react-native";
import {
  buildTutorialSearchUrl,
  openTutorialForExercise,
  __resetTutorialLinkLockForTests,
} from "../../lib/exercise-tutorial-link";

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
}));

describe("buildTutorialSearchUrl", () => {
  it("returns null for empty string", () => {
    expect(buildTutorialSearchUrl("")).toBeNull();
  });

  it("returns null for whitespace-only", () => {
    expect(buildTutorialSearchUrl("   \t\n ")).toBeNull();
  });

  it("returns null for non-string input (defensive)", () => {
    // @ts-expect-error — runtime guard for JS callers
    expect(buildTutorialSearchUrl(undefined)).toBeNull();
    // @ts-expect-error — runtime guard for JS callers
    expect(buildTutorialSearchUrl(null)).toBeNull();
  });

  it("builds a YouTube search URL for plain names", () => {
    expect(buildTutorialSearchUrl("Cable Row")).toBe(
      "https://www.youtube.com/results?search_query=Cable%20Row%20form%20tutorial",
    );
  });

  it("trims surrounding whitespace before encoding", () => {
    expect(buildTutorialSearchUrl("  Pull-up  ")).toBe(
      "https://www.youtube.com/results?search_query=Pull-up%20form%20tutorial",
    );
  });

  it("encodes ampersands, slashes, and special characters", () => {
    expect(buildTutorialSearchUrl("Barbell Row & Curl")).toBe(
      "https://www.youtube.com/results?search_query=Barbell%20Row%20%26%20Curl%20form%20tutorial",
    );
  });

  it("encodes emoji + unicode", () => {
    const url = buildTutorialSearchUrl("プッシュアップ 💪");
    expect(url).not.toBeNull();
    expect(url).toContain("https://www.youtube.com/results?search_query=");
    // Decoded payload round-trips back to trimmed input + suffix.
    const q = new URL(url!).searchParams.get("search_query");
    expect(q).toBe("プッシュアップ 💪 form tutorial");
  });
});

describe("openTutorialForExercise", () => {
  beforeEach(() => {
    __resetTutorialLinkLockForTests();
    jest.clearAllMocks();
  });

  it("no-ops when name is whitespace-only (no Sentry, no Linking)", async () => {
    const canOpen = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await openTutorialForExercise("  ");
    expect(canOpen).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).not.toHaveBeenCalled();
  });

  it("opens the YouTube search URL and records an 'open' breadcrumb on success", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await openTutorialForExercise("Cable Row");
    expect(open).toHaveBeenCalledWith(
      "https://www.youtube.com/results?search_query=Cable%20Row%20form%20tutorial",
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: "exercise.tutorial",
      message: "open",
      level: "info",
      data: { exerciseName: "Cable Row" },
    });
  });

  it("shows Alert + records open_failed breadcrumb when canOpenURL is false", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(false);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await openTutorialForExercise("Cable Row");
    expect(open).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled();
    const [title, body] = alertSpy.mock.calls[0];
    expect(title).toBe("Couldn't open browser");
    expect(body).toContain(
      "https://www.youtube.com/results?search_query=Cable%20Row%20form%20tutorial",
    );
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "exercise.tutorial",
        message: "open_failed",
        level: "warning",
        data: expect.objectContaining({ exerciseName: "Cable Row" }),
      }),
    );
  });

  it("shows Alert + open_failed breadcrumb when openURL throws", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("boom"));
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await openTutorialForExercise("Cable Row");
    expect(alertSpy).toHaveBeenCalled();
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "open_failed",
        data: expect.objectContaining({
          exerciseName: "Cable Row",
          error: expect.stringContaining("boom"),
        }),
      }),
    );
  });

  it("honors onError override instead of Alert.alert", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(false);
    const alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const onError = jest.fn();
    await openTutorialForExercise("Cable Row", { onError });
    expect(onError).toHaveBeenCalledTimes(1);
    const [, urlArg] = onError.mock.calls[0];
    expect(urlArg).toBe(
      "https://www.youtube.com/results?search_query=Cable%20Row%20form%20tutorial",
    );
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("double-tap guard: second call while first in-flight is a no-op", async () => {
    let resolveOpen: () => void = () => {};
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const open = jest
      .spyOn(Linking, "openURL")
      .mockImplementation(
        () => new Promise<void>((res) => {
          resolveOpen = res;
        }),
      );

    const first = openTutorialForExercise("Cable Row");
    const second = openTutorialForExercise("Cable Row");
    // Flush microtasks so the first task reaches the Linking.openURL call.
    await Promise.resolve();
    await Promise.resolve();
    // Second should return the same in-flight promise (so only ONE openURL call).
    expect(open).toHaveBeenCalledTimes(1);
    resolveOpen();
    await Promise.all([first, second]);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("resets in-flight lock in finally even on error (re-tap works after failure)", async () => {
    jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
    const open = jest
      .spyOn(Linking, "openURL")
      .mockRejectedValueOnce(new Error("first failed"))
      .mockResolvedValueOnce(undefined);
    jest.spyOn(Alert, "alert").mockImplementation(() => {});

    await openTutorialForExercise("Cable Row");
    await openTutorialForExercise("Cable Row");
    expect(open).toHaveBeenCalledTimes(2);
  });
});
