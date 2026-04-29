/**
 * BLD-788 — ExerciseVariantFilter unit tests.
 *
 * Behavior coverage:
 *  - Default state: "Showing: All variants (N logged)" badge, no Clear button.
 *  - Active state: badge shows selected dimensions; Clear is rendered.
 *  - Tapping an unselected attachment chip emits onChange with that attachment.
 *  - Tapping the active attachment chip again clears that dimension only
 *    (mount_position untouched).
 *  - Same independence rule for mount_position.
 *  - Clear emits empty object scope.
 *  - Vocabulary comes exclusively from lib/cable-variant — every value renders.
 */
import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import ExerciseVariantFilter from "../../../components/exercise/ExerciseVariantFilter";
import { ATTACHMENT_VALUES, MOUNT_POSITION_VALUES } from "../../../lib/cable-variant";
import { ATTACHMENT_LABELS, MOUNT_POSITION_LABELS } from "../../../lib/types";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surface: "#fff",
    surfaceVariant: "#ECE6F0",
    onSurface: "#000",
    onSurfaceVariant: "#49454F",
    outlineVariant: "#cccccc",
    primaryContainer: "#E8DEF8",
    onPrimaryContainer: "#21005D",
  }),
}));

describe("ExerciseVariantFilter — BLD-788", () => {
  it("renders default 'All variants (N logged)' badge with no Clear button", () => {
    const onChange = jest.fn();
    const { getByText, queryByLabelText } = render(
      <ExerciseVariantFilter scope={{}} onChange={onChange} variantTotal={42} />
    );
    expect(getByText("Showing: All variants (42 logged)")).toBeTruthy();
    expect(queryByLabelText("Clear variant filter")).toBeNull();
  });

  it("renders all attachment chips from ATTACHMENT_VALUES", () => {
    const { getByLabelText } = render(
      <ExerciseVariantFilter scope={{}} onChange={jest.fn()} variantTotal={0} />
    );
    for (const v of ATTACHMENT_VALUES) {
      expect(getByLabelText(`Attachment ${ATTACHMENT_LABELS[v]}`)).toBeTruthy();
    }
  });

  it("renders all mount chips from MOUNT_POSITION_VALUES", () => {
    const { getByLabelText } = render(
      <ExerciseVariantFilter scope={{}} onChange={jest.fn()} variantTotal={0} />
    );
    for (const v of MOUNT_POSITION_VALUES) {
      expect(getByLabelText(`Mount ${MOUNT_POSITION_LABELS[v]}`)).toBeTruthy();
    }
  });

  it("tapping an attachment chip selects that dimension only", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <ExerciseVariantFilter scope={{}} onChange={onChange} variantTotal={0} />
    );
    fireEvent.press(getByLabelText("Attachment Rope"));
    expect(onChange).toHaveBeenCalledWith({ attachment: "rope" });
  });

  it("tapping the active attachment chip clears just that dimension", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <ExerciseVariantFilter
        scope={{ attachment: "rope", mount_position: "high" }}
        onChange={onChange}
        variantTotal={0}
      />
    );
    fireEvent.press(getByLabelText("Attachment Rope, selected"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ mount_position: "high" });
  });

  it("tapping a mount chip selects that dimension only", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <ExerciseVariantFilter
        scope={{ attachment: "bar" }}
        onChange={onChange}
        variantTotal={0}
      />
    );
    fireEvent.press(getByLabelText("Mount High"));
    expect(onChange).toHaveBeenCalledWith({ attachment: "bar", mount_position: "high" });
  });

  it("tapping the active mount chip clears just that dimension", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <ExerciseVariantFilter
        scope={{ attachment: "bar", mount_position: "low" }}
        onChange={onChange}
        variantTotal={0}
      />
    );
    fireEvent.press(getByLabelText("Mount Low, selected"));
    expect(onChange).toHaveBeenCalledWith({ attachment: "bar" });
  });

  it("renders active-state badge as 'Showing: Rope · High'", () => {
    const { getByText } = render(
      <ExerciseVariantFilter
        scope={{ attachment: "rope", mount_position: "high" }}
        onChange={jest.fn()}
        variantTotal={5}
      />
    );
    expect(getByText("Showing: Rope · High")).toBeTruthy();
  });

  it("renders single-dimension active badge correctly", () => {
    const { getByText } = render(
      <ExerciseVariantFilter
        scope={{ attachment: "bar" }}
        onChange={jest.fn()}
        variantTotal={5}
      />
    );
    expect(getByText("Showing: Bar")).toBeTruthy();
  });

  it("Clear button resets scope to empty object", () => {
    const onChange = jest.fn();
    const { getByLabelText } = render(
      <ExerciseVariantFilter
        scope={{ attachment: "rope", mount_position: "high" }}
        onChange={onChange}
        variantTotal={3}
      />
    );
    fireEvent.press(getByLabelText("Clear variant filter"));
    expect(onChange).toHaveBeenCalledWith({});
  });
});
