const mockCaptureScreen = jest.fn();
const mockDeleteFile = jest.fn();
const mockExistsByUri = new Map<string, boolean>();

jest.mock("react-native-view-shot", () => ({ captureScreen: (...args: unknown[]) => mockCaptureScreen(...args) }));
jest.mock("expo-file-system", () => ({
  File: class MockFile {
    uri: string;
    constructor(uri: string) { this.uri = uri; }
    get exists() { return mockExistsByUri.get(this.uri) ?? true; }
    delete() { mockDeleteFile(this.uri); }
  },
}));

import {
  captureFeedbackScreenshot,
  removeFeedbackScreenshot,
  setPendingFeedbackScreenshot,
  takePendingFeedbackScreenshot,
} from "../../lib/feedback-screenshot";

describe("feedback screenshot lifecycle", () => {
  beforeEach(() => {
    mockCaptureScreen.mockReset();
    mockDeleteFile.mockReset();
    mockExistsByUri.clear();
    takePendingFeedbackScreenshot();
  });

  it("captures a PNG to a temporary file", async () => {
    mockCaptureScreen.mockResolvedValue("file:///cache/screen.png");
    await expect(captureFeedbackScreenshot()).resolves.toBe("file:///cache/screen.png");
    expect(mockCaptureScreen).toHaveBeenCalledWith({ format: "png", quality: 1, result: "tmpfile" });
  });

  it("propagates capture failure so feedback can continue without an image", async () => {
    mockCaptureScreen.mockRejectedValue(new Error("native failure"));
    await expect(captureFeedbackScreenshot()).rejects.toThrow("native failure");
  });

  it("deletes replaced and explicitly removed temporary files", () => {
    setPendingFeedbackScreenshot({ status: "ready", uri: "file:///cache/old.png" });
    setPendingFeedbackScreenshot({ status: "failed", uri: null });
    removeFeedbackScreenshot("file:///cache/current.png");
    expect(mockDeleteFile).toHaveBeenCalledWith("file:///cache/old.png");
    expect(mockDeleteFile).toHaveBeenCalledWith("file:///cache/current.png");
  });

  it("does not delete remote audit images", () => {
    removeFeedbackScreenshot("https://placehold.co/screen.png");
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });
});
