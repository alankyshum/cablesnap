// GitHub #963: reviewed screenshot controls and failure recovery UI.
import { fireEvent, render } from "@testing-library/react-native";
import { ScreenshotSection } from "../../../components/feedback/ScreenshotSection";

const colors = {
  onSurface: "#111",
  onSurfaceVariant: "#555",
  surfaceVariant: "#eee",
  border: "#aaa",
} as never;

const baseProps = {
  colors,
  state: "ready" as const,
  uri: "file:///capture.png",
  included: true,
  capturing: false,
  onIncludedChange: jest.fn(),
  onCapture: jest.fn(),
  onRemove: jest.fn(),
  onShare: jest.fn(),
};

describe("GitHub #963 ScreenshotSection", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses the audited preview label and wires Retake, Remove, sharing, and inclusion", () => {
    const view = render(<ScreenshotSection {...baseProps} />);
    expect(view.getByLabelText("Screenshot preview")).toBeTruthy();
    expect(view.getByTestId("feedback-include-screenshot").props.value).toBe(true);
    expect(view.getByText("Review the screenshot for sensitive information before sharing.")).toBeTruthy();
    fireEvent.press(view.getByText("Retake"));
    fireEvent.press(view.getByText("Share Screenshot"));
    fireEvent.press(view.getByText("Remove"));
    expect(baseProps.onCapture).toHaveBeenCalled();
    expect(baseProps.onShare).toHaveBeenCalled();
    expect(baseProps.onRemove).toHaveBeenCalled();
  });

  it("shows Try Again but no privacy warning when capture failed", () => {
    const view = render(<ScreenshotSection {...baseProps} state="failed" uri={null} />);
    expect(view.getByText("Screenshot unavailable")).toBeTruthy();
    expect(view.queryByText("Review the screenshot for sensitive information before sharing.")).toBeNull();
    fireEvent.press(view.getByText("Try Again"));
    expect(baseProps.onCapture).toHaveBeenCalled();
  });
});
