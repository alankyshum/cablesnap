/**
 * BLD-822 — QD-10 / TL-N2: focus-return isolation between cable variant
 * picker hook (BLD-771) and bodyweight grip picker hook (BLD-822).
 *
 * **Fixture-shape requirement (TL-N2):** mount BOTH hooks in the SAME render
 * tree inside a SINGLE `it()` block, with `act()` boundaries. Separate tests
 * get fresh module instances and would NOT catch shared-state regressions
 * (e.g. if either hook accidentally migrated its `returnFocusHandleRef` to a
 * module-level variable, separate tests would each get a fresh module and
 * not detect it).
 *
 * Invariant tested: each hook owns an independent `returnFocusHandleRef`.
 * Opening the bodyweight grip picker with handle B then closing it MUST
 * restore focus to handle B, even if the cable picker is also active with
 * handle A on the same page. And vice-versa.
 */
import React from "react";
import { act } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

jest.mock("@/lib/db/session-sets", () => ({
  updateSetVariant: jest.fn().mockResolvedValue(undefined),
  updateSetBodyweightVariant: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/query", () => ({
  queryClient: { invalidateQueries: jest.fn(), fetchQuery: jest.fn() },
}));
jest.mock("expo-haptics", () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
}));

import { useVariantPickerSheet } from "../../hooks/useVariantPickerSheet";
import { useBodyweightGripPickerSheet } from "../../hooks/useBodyweightGripPickerSheet";

describe("BLD-822 QD-10 / TL-N2 — picker hooks own independent focus refs", () => {
  it("cable + bodyweight grip pickers each restore focus to THEIR OWN row, never each other's", () => {
    jest.useFakeTimers();
    const focusSpy = jest.spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation(() => undefined);

    // Captured hook-return handles. We render a single component that mounts
    // BOTH hooks in the SAME tree (per TL-N2: must share render tree to catch
    // shared-state bugs).
    let cable: ReturnType<typeof useVariantPickerSheet> | undefined;
    let grip: ReturnType<typeof useBodyweightGripPickerSheet> | undefined;

    function Harness() {
      const groups = [
        {
          exercise_id: "ex-cable",
          name: "Pulldown",
          sets: [{ id: "s-cable" }],
          equipment: "cable",
        },
        {
          exercise_id: "ex-bw",
          name: "Pull-Up",
          sets: [{ id: "s-bw" }],
          equipment: "bodyweight",
        },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any;
      const updateGroupSet = jest.fn();
      const showError = jest.fn();
      cable = useVariantPickerSheet({ groups, updateGroupSet, showError });
      grip = useBodyweightGripPickerSheet({ groups, updateGroupSet, showError });
      return null;
    }

    // Render via React Testing Library so hook order/lifecycle is real.
    // (We import lazily to keep the mocks above hoisted before module load.)
    const TLR = require("@testing-library/react-native");
    TLR.render(<Harness />);

    expect(cable).toBeDefined();
    expect(grip).toBeDefined();

    // Open BOTH with distinct handles.
    const CABLE_HANDLE = 1001;
    const GRIP_HANDLE = 2002;
    act(() => {
      cable!.handleOpen("s-cable", CABLE_HANDLE);
      grip!.handleOpen("s-bw", GRIP_HANDLE);
    });

    // Close GRIP first → must restore GRIP_HANDLE (not CABLE_HANDLE).
    act(() => {
      grip!.handleClose();
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(focusSpy).toHaveBeenLastCalledWith(GRIP_HANDLE);

    // Now close CABLE → must restore CABLE_HANDLE. If the refs were shared
    // (e.g. module-level), the cable close would either no-op (already
    // cleared by grip close) or restore GRIP_HANDLE — both detectable.
    act(() => {
      cable!.handleClose();
    });
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(focusSpy).toHaveBeenCalledTimes(2);
    expect(focusSpy).toHaveBeenLastCalledWith(CABLE_HANDLE);

    focusSpy.mockRestore();
    jest.useRealTimers();
  });
});
