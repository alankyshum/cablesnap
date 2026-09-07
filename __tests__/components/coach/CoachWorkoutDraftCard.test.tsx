import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { CoachWorkoutDraftCard } from "@/components/coach/CoachWorkoutDraftCard";

const draft = { name: "Equipment workout draft", estimatedMinutes: 30, exercises: [{ exercise_id: "press", sets: 3, reps: 10, rest_seconds: 60, load: { kind: "conservative" } }] };

describe("CoachWorkoutDraftCard", () => {
  it("renders equipment, prescription, ordered reasons and guards duplicate starts", async () => {
    let resolveStart: (() => void) | undefined;
    const onStart = jest.fn(() => new Promise<void>((resolve) => { resolveStart = resolve; }));
    const view = render(<CoachWorkoutDraftCard draft={draft} equipment={[{ label: "cable", confidence: 0.6 }]} revision={1} reasons={[{ source: "history", rule: "bounded volume" }]} onStart={onStart} />);

    expect(view.getByTestId("coach-workout-draft-card")).toBeTruthy();
    expect(view.getByText("cable · ?")).toBeTruthy();
    expect(view.getByText("Why this draft")).toBeTruthy();
    expect(view.getByText("3 × 10 · 60s · Start light and adjust after a controlled first set")).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId("coach-workout-draft-start")); fireEvent.press(view.getByTestId("coach-workout-draft-start")); });
    expect(onStart).toHaveBeenCalledTimes(1);
    await act(async () => resolveStart?.());
  });

  it("starts from an explicit card press", async () => {
    const onStart = jest.fn();
    const view = render(<CoachWorkoutDraftCard draft={draft} revision={1} onStart={onStart} />);
    await act(async () => { fireEvent.press(view.getByLabelText("Equipment workout draft")); await Promise.resolve(); });
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it("keeps restore as a latest revision while showing the restored card", async () => {
    const onRestore = jest.fn(async () => ({ draft: { ...draft, name: "Restored draft" }, revision: 3, reasons: [{ rule: "restored" }] }));
    const view = render(<CoachWorkoutDraftCard draft={draft} revision={2} revisions={[{ version: 1, change_reason: "created", created_at: 1 }, { version: 2, change_reason: "updated", created_at: 2 }]} reasons={[]} onStart={jest.fn()} onRestore={onRestore} />);
    await act(async () => { fireEvent.press(view.getByLabelText("Open workout revision history")); await Promise.resolve(); });
    await act(async () => fireEvent.press(view.getByLabelText("Restore revision 1")));
    expect(onRestore).toHaveBeenCalledWith(1);
    expect(view.getByText("Restored draft")).toBeTruthy();
    expect(view.getByText("Saved · revision 3")).toBeTruthy();
  });

  it("syncs later durable revisions without erasing an in-progress restore", async () => {
    const view = render(<CoachWorkoutDraftCard draft={{ ...draft, name: "Initial" }} revision={1} reasons={[{ rule: "initial" }]} onStart={jest.fn()} />);
    view.rerender(<CoachWorkoutDraftCard draft={{ ...draft, name: "Durable latest" }} revision={2} reasons={[{ input: "latest", rule: "updated" }]} onStart={jest.fn()} />);
    await act(async () => Promise.resolve());
    expect(view.getByText("Durable latest")).toBeTruthy();
    expect(view.getByText("Saved · revision 2")).toBeTruthy();
    view.unmount();
    const remounted = render(<CoachWorkoutDraftCard draft={{ ...draft, name: "Durable latest" }} revision={2} reasons={[{ input: "latest", rule: "updated" }]} onStart={jest.fn()} />);
    expect(remounted.getByText("Durable latest")).toBeTruthy();
    expect(remounted.getByText("Saved · revision 2")).toBeTruthy();
  });

  it("renders typed start and restore failures without navigation or state corruption", async () => {
    const onStart = jest.fn(async () => { throw new Error("start failed"); });
    const onRestore = jest.fn(async () => { throw new Error("restore failed"); });
    const view = render(<CoachWorkoutDraftCard draft={draft} revision={2} revisions={[{ version: 1, change_reason: "created", created_at: 1 }, { version: 2, change_reason: "updated", created_at: 2 }]} onStart={onStart} onRestore={onRestore} />);
    await act(async () => { fireEvent.press(view.getByTestId("coach-workout-draft-start")); await Promise.resolve(); });
    expect(view.getByText("start failed")).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByLabelText("Open workout revision history")); await Promise.resolve(); });
    await act(async () => { fireEvent.press(view.getByLabelText("Restore revision 1")); await Promise.resolve(); });
    expect(view.getByText("restore failed")).toBeTruthy();
    expect(view.getByText("Saved · revision 2")).toBeTruthy();
  });
});
