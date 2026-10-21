// GitHub #963: feedback screenshot capture success, failure, retake, and remove.
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";

const mockCaptureScreen = jest.fn();
const mockToastInfo = jest.fn();
const mockDeleteFile = jest.fn();

jest.mock("react-native-view-shot", () => ({ captureScreen: (...args: unknown[]) => mockCaptureScreen(...args) }));
jest.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    delete = mockDeleteFile;
  },
}));
jest.mock("@/components/ui/bna-toast", () => ({
  useToast: () => ({ info: mockToastInfo }),
}));

import { useFeedbackScreenshot } from "../../hooks/useFeedbackScreenshot";
import { setPendingFeedbackScreenshot, showScreenshotAttachmentNotice, takePendingFeedbackScreenshot } from "../../lib/feedback-screenshot";

describe("GitHub #963 feedback screenshot state", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    takePendingFeedbackScreenshot();
  });

  it("starts included after a successful shake capture and removes the temp file", () => {
    setPendingFeedbackScreenshot({ uri: "file:///capture.png", unavailable: false });
    const { result } = renderHook(() => useFeedbackScreenshot());
    expect(result.current.uri).toBe("file:///capture.png");
    expect(result.current.included).toBe(true);
    act(() => result.current.remove());
    expect(result.current.uri).toBeNull();
    expect(mockDeleteFile).toHaveBeenCalled();
  });

  it("retakes successfully and replaces the old temporary capture", async () => {
    setPendingFeedbackScreenshot({ uri: "file:///old.png", unavailable: false });
    mockCaptureScreen.mockResolvedValue("file:///new.png");
    const { result } = renderHook(() => useFeedbackScreenshot());
    await act(async () => result.current.capture());
    expect(result.current.uri).toBe("file:///new.png");
    expect(result.current.included).toBe(true);
    expect(mockDeleteFile).toHaveBeenCalled();
  });

  it("keeps the form usable and marks capture failure unavailable", async () => {
    mockCaptureScreen.mockRejectedValue(new Error("unsupported"));
    const { result } = renderHook(() => useFeedbackScreenshot());
    await act(async () => result.current.capture());
    expect(result.current.uri).toBeNull();
    expect(result.current.unavailable).toBe(true);
    expect(mockToastInfo).toHaveBeenCalledWith("Screenshot unavailable");
  });

  it("warns that GitHub needs manual attachment and offers separate PNG sharing", () => {
    const openGitHub = jest.fn();
    const shareScreenshot = jest.fn();
    const alert = jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
    showScreenshotAttachmentNotice(openGitHub, shareScreenshot);
    expect(alert).toHaveBeenCalledWith(
      "Attach screenshot manually",
      expect.stringContaining("attach it to the GitHub issue manually"),
      expect.any(Array),
    );
    const buttons = alert.mock.calls[0][2]!;
    buttons[1].onPress?.();
    buttons[2].onPress?.();
    expect(shareScreenshot).toHaveBeenCalled();
    expect(openGitHub).toHaveBeenCalled();
  });
});
