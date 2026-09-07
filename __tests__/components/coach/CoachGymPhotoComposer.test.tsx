import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { CoachGymPhotoComposer } from "@/components/coach/CoachGymPhotoComposer";

describe("CoachGymPhotoComposer", () => {
  it("exposes a library-only photo action and removes a pending photo", async () => {
    const onPick = jest.fn(async () => undefined);
    const onRemove = jest.fn();
    const view = render(<CoachGymPhotoComposer hasPhoto onPick={onPick} onRemove={onRemove} />);

    const picker = view.getByTestId("coach-gym-photo-button");
    expect(picker.props.accessibilityRole).toBe("button");
    expect(picker.props.accessibilityHint).toContain("no camera");
    await act(async () => { fireEvent.press(picker); await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
    await act(async () => { fireEvent.press(view.getByLabelText("Remove selected gym photo")); await Promise.resolve(); });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
