import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState, Linking, TouchableWithoutFeedback } from "react-native";
import { UpdatePromptBridge } from "@/components/UpdatePromptBridge";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { ToastProvider } from "@/components/ui/bna-toast";

jest.mock("react-native-reanimated", () => {
  const reanimated = jest.requireActual("../../__mocks__/react-native-reanimated");
  return {
    ...reanimated,
    withTiming: (value: unknown, _config: unknown, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return value;
    },
  };
});

jest.mock("@/lib/db/settings", () => ({
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/update-check", () => ({
  checkForUpdate: jest.fn().mockResolvedValue({
    currentVersion: "1.2.3",
    tag: "v1.2.4",
    version: "1.2.4",
    name: "Release name",
    body: "Release notes",
    url: "https://example.test/app.apk",
  }),
  clearLastCheckedAt: jest.fn().mockResolvedValue(undefined),
  dismissUpdate: jest.fn((tag: string) => require("@/lib/db/settings").setAppSetting("update.dismissedTag", tag)),
}));

const mockedSet = require("@/lib/db/settings").setAppSetting as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("AlertDialog", () => {
  it("does not dismiss when the backdrop is pressed while non-dismissible", async () => {
    const onClose = jest.fn();
    const onCancel = jest.fn();
    const screen = render(
      <AlertDialog isVisible dismissible={false} onClose={onClose} onCancel={onCancel} title="Update available" />,
    );

    await waitFor(() => expect(screen.getByText("Update available")).toBeTruthy());
    fireEvent.press(screen.UNSAFE_getAllByType(TouchableWithoutFeedback)[0]);

    expect(onClose).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    screen.unmount();
  });
});

describe("UpdatePromptBridge", () => {
  const renderBridge = () => render(<ToastProvider><UpdatePromptBridge /></ToastProvider>);

  it("writes one dismissal for cancel and confirm", async () => {
    const screen = renderBridge();
    await waitFor(() => expect(screen.getByTestId("update-available-dialog")).toBeTruthy());

    fireEvent.press(screen.getByTestId("update-skip"));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(1));
    expect(mockedSet).toHaveBeenCalledWith("update.dismissedTag", "v1.2.4");
    screen.unmount();

    mockedSet.mockClear();
    const secondScreen = renderBridge();
    await waitFor(() => expect(secondScreen.getByTestId("update-available-dialog")).toBeTruthy());
    fireEvent.press(secondScreen.getByTestId("update-download"));
    await waitFor(() => expect(mockedSet).toHaveBeenCalledTimes(1));
    expect(mockedSet).toHaveBeenCalledWith("update.dismissedTag", "v1.2.4");
    secondScreen.unmount();
  });

  it("does not dismiss when opening the download link fails", async () => {
    const clearLastCheckedAt = require("@/lib/update-check").clearLastCheckedAt as jest.Mock;
    jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("offline"));
    const screen = renderBridge();
    await waitFor(() => expect(screen.getByTestId("update-download")).toBeTruthy());

    fireEvent.press(screen.getByTestId("update-download"));
    await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith("https://example.test/app.apk"));
    await waitFor(() => expect(clearLastCheckedAt).toHaveBeenCalledTimes(1));
    expect(mockedSet).not.toHaveBeenCalled();
    expect(screen.getByTestId("update-available-dialog")).toBeTruthy();
    screen.unmount();
  });

  it("keeps the bridge dialog non-dismissible", async () => {
    const onClose = jest.fn();
    const screen = renderBridge();
    await waitFor(() => expect(screen.getByTestId("update-available-dialog")).toBeTruthy());
    mockedSet.mockClear();

    const backdrops = screen.UNSAFE_getAllByType(TouchableWithoutFeedback);
    fireEvent.press(backdrops[backdrops.length - 1]);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId("update-available-dialog")).toBeTruthy();
    screen.unmount();
  });

  it("clears the throttle stamp so the next foreground check can retry", async () => {
    const checkForUpdate = require("@/lib/update-check").checkForUpdate as jest.Mock;
    const clearLastCheckedAt = require("@/lib/update-check").clearLastCheckedAt as jest.Mock;
    const screen = renderBridge();
    await waitFor(() => expect(screen.getByTestId("update-download")).toBeTruthy());

    jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("offline"));
    fireEvent.press(screen.getByTestId("update-download"));
    await waitFor(() => expect(clearLastCheckedAt).toHaveBeenCalledTimes(1));
    const stateListener = jest.spyOn(AppState, "addEventListener").mock.calls[0][1] as (state: "active") => void;
    stateListener("active");
    await waitFor(() => expect(checkForUpdate).toHaveBeenCalledTimes(2));
    expect(mockedSet).not.toHaveBeenCalled();
    screen.unmount();
  });

  it("closes AlertDialog when a void onConfirm callback succeeds", async () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    const screen = render(
      <AlertDialog
        isVisible
        onClose={onClose}
        onConfirm={onConfirm}
        confirmTestID="confirm"
        title="Confirm"
      />,
    );

    await waitFor(() => expect(screen.getByTestId("confirm")).toBeTruthy());
    fireEvent.press(screen.getByTestId("confirm"));

    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    screen.unmount();
  });
});
