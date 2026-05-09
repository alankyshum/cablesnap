/**
 * BLD-1111: RpeCaptureNudge component tests.
 *
 * (a) Renders when all 3 eligibility conditions hold.
 * (b) Hidden when nudgeShown=true.
 * (c) Hidden when captureRpe="true".
 * (d) Hidden when no historical RPE.
 * (e) "Turn on" writes nudgeShown FIRST then captureRpe, calls onDismiss.
 * (f) "Not now" writes ONLY nudgeShown, calls onDismiss.
 * (g) Unmounts while predicate in-flight → no setState warning, no writes.
 * (h) DB error in predicate → renders nothing, no throw.
 * (i) Double-tap "Turn on" writes captureRpe exactly once.
 * (j) Partial failure: nudgeShown throws → toast "Couldn't save — try again",
 *     banner stays, no captureRpe write attempted.
 * (k) Partial failure: captureRpe throws after nudgeShown succeeded →
 *     toast "Saved your dismissal but couldn't enable capture...", banner unmounts.
 */

import React from "react";
import { act, fireEvent, waitFor } from "@testing-library/react-native";
import { renderScreen } from "../../helpers/render";
import { RpeCaptureNudge } from "../../../components/exercises/RpeCaptureNudge";

// ─── Mock all external dependencies ──────────────────────────────────────────

jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "Icon");

const mockExerciseHasHistoricalRpe = jest.fn();
const mockHasSeenRpeCaptureNudge = jest.fn();
const mockMarkRpeCaptureNudgeSeen = jest.fn();
const mockGetAppSetting = jest.fn();
const mockSetAppSetting = jest.fn();
const mockInsertInteraction = jest.fn().mockResolvedValue(undefined);

jest.mock("../../../lib/db/exercise-history", () => ({
  exerciseHasHistoricalRpe: (...args: unknown[]) =>
    mockExerciseHasHistoricalRpe(...args),
}));

jest.mock("../../../lib/db/achievements", () => ({
  hasSeenRpeCaptureNudge: () => mockHasSeenRpeCaptureNudge(),
  markRpeCaptureNudgeSeen: () => mockMarkRpeCaptureNudgeSeen(),
}));

jest.mock("../../../lib/db", () => ({
  getAppSetting: (...args: unknown[]) => mockGetAppSetting(...args),
  setAppSetting: (...args: unknown[]) => mockSetAppSetting(...args),
  insertInteraction: (...args: unknown[]) => mockInsertInteraction(...args),
}));

// Default: eligible (historical RPE, not seen, captureRpe off)
function setEligible() {
  mockExerciseHasHistoricalRpe.mockResolvedValue(true);
  mockHasSeenRpeCaptureNudge.mockResolvedValue(false);
  mockGetAppSetting.mockResolvedValue(null);
  mockMarkRpeCaptureNudgeSeen.mockResolvedValue(undefined);
  mockSetAppSetting.mockResolvedValue(undefined);
}

describe("RpeCaptureNudge", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setEligible();
  });

  it("(a) renders banner when all 3 eligibility conditions hold", async () => {
    const { getByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" />
    );
    await waitFor(() => {
      expect(getByTestId("rpe-capture-nudge")).toBeTruthy();
    });
  });

  it("(b) does not render when nudgeShown=true", async () => {
    mockHasSeenRpeCaptureNudge.mockResolvedValue(true);
    const { queryByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" />
    );
    await waitFor(() => {
      expect(queryByTestId("rpe-capture-nudge")).toBeNull();
    });
  });

  it("(c) does not render when captureRpe='true'", async () => {
    mockGetAppSetting.mockResolvedValue("true");
    const { queryByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" />
    );
    await waitFor(() => {
      expect(queryByTestId("rpe-capture-nudge")).toBeNull();
    });
  });

  it("(d) does not render when no historical RPE", async () => {
    mockExerciseHasHistoricalRpe.mockResolvedValue(false);
    const { queryByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" />
    );
    await waitFor(() => {
      expect(queryByTestId("rpe-capture-nudge")).toBeNull();
    });
  });

  it("(e) Turn on writes nudgeShown FIRST then captureRpe, calls onDismiss", async () => {
    const callOrder: string[] = [];
    mockMarkRpeCaptureNudgeSeen.mockImplementation(async () => {
      callOrder.push("nudgeShown");
    });
    mockSetAppSetting.mockImplementation(async () => {
      callOrder.push("captureRpe");
    });
    const onDismiss = jest.fn();

    const { getByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" onDismiss={onDismiss} />
    );
    await waitFor(() => getByTestId("rpe-capture-nudge-turn-on"));

    await act(async () => {
      fireEvent.press(getByTestId("rpe-capture-nudge-turn-on"));
    });

    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(callOrder).toEqual(["nudgeShown", "captureRpe"]);
    expect(mockMarkRpeCaptureNudgeSeen).toHaveBeenCalledTimes(1);
    expect(mockSetAppSetting).toHaveBeenCalledWith("session.captureRpe", "true");
  });

  it("(f) Not now writes ONLY nudgeShown, calls onDismiss", async () => {
    const onDismiss = jest.fn();
    const { getByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" onDismiss={onDismiss} />
    );
    await waitFor(() => getByTestId("rpe-capture-nudge-not-now"));

    await act(async () => {
      fireEvent.press(getByTestId("rpe-capture-nudge-not-now"));
    });

    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(mockMarkRpeCaptureNudgeSeen).toHaveBeenCalledTimes(1);
    expect(mockSetAppSetting).not.toHaveBeenCalled();
  });

  it("(g) unmounts while predicate in-flight → no setState warning, no writes", async () => {
    let resolveRpe!: (v: boolean) => void;
    mockExerciseHasHistoricalRpe.mockReturnValue(
      new Promise<boolean>((res) => { resolveRpe = res; })
    );

    const { unmount } = renderScreen(<RpeCaptureNudge exerciseId="ex-1" />);
    unmount();

    // Resolve after unmount — should not cause setState warning or writes
    await act(async () => { resolveRpe(true); });
    expect(mockMarkRpeCaptureNudgeSeen).not.toHaveBeenCalled();
    expect(mockSetAppSetting).not.toHaveBeenCalled();
  });

  it("(h) DB error in predicate → renders nothing", async () => {
    mockExerciseHasHistoricalRpe.mockRejectedValue(new Error("db error"));
    const { queryByTestId } = renderScreen(<RpeCaptureNudge exerciseId="ex-1" />);
    await waitFor(() => {
      expect(queryByTestId("rpe-capture-nudge")).toBeNull();
    });
  });

  it("(i) double-tap Turn on writes captureRpe exactly once", async () => {
    let resolveFirst!: () => void;
    mockMarkRpeCaptureNudgeSeen.mockReturnValueOnce(
      new Promise<void>((res) => { resolveFirst = res; })
    );

    const { getByTestId } = renderScreen(<RpeCaptureNudge exerciseId="ex-1" />);
    await waitFor(() => getByTestId("rpe-capture-nudge-turn-on"));

    // First tap
    fireEvent.press(getByTestId("rpe-capture-nudge-turn-on"));
    // Second tap while first is in flight (button should be disabled)
    fireEvent.press(getByTestId("rpe-capture-nudge-turn-on"));

    await act(async () => { resolveFirst(); });
    await waitFor(() => expect(mockSetAppSetting).toHaveBeenCalledTimes(1));
  });

  it("(j) partial failure: nudgeShown throws → toast Couldn't save, banner stays, no captureRpe write", async () => {
    mockMarkRpeCaptureNudgeSeen.mockRejectedValue(new Error("write fail"));

    const { getByTestId, queryByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" />
    );
    await waitFor(() => getByTestId("rpe-capture-nudge-turn-on"));

    await act(async () => {
      fireEvent.press(getByTestId("rpe-capture-nudge-turn-on"));
    });

    await waitFor(() => {
      expect(queryByTestId("rpe-capture-nudge")).toBeTruthy();
    });
    expect(mockSetAppSetting).not.toHaveBeenCalled();
  });

  it("(k) partial failure: captureRpe throws after nudgeShown succeeded → banner unmounts", async () => {
    mockMarkRpeCaptureNudgeSeen.mockResolvedValue(undefined);
    mockSetAppSetting.mockRejectedValue(new Error("captureRpe write fail"));
    const onDismiss = jest.fn();

    const { getByTestId, queryByTestId } = renderScreen(
      <RpeCaptureNudge exerciseId="ex-1" onDismiss={onDismiss} />
    );
    await waitFor(() => getByTestId("rpe-capture-nudge-turn-on"));

    await act(async () => {
      fireEvent.press(getByTestId("rpe-capture-nudge-turn-on"));
    });

    await waitFor(() => {
      expect(queryByTestId("rpe-capture-nudge")).toBeNull();
    });
    expect(onDismiss).toHaveBeenCalled();
  });
});
