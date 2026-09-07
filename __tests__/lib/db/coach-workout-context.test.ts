import { filterComparableHistory, readCoachWorkoutContext } from "../../../lib/db/coach-workout-context";

test("context reader returns a typed recoverable result on local read failure", async () => {
  const result = await readCoachWorkoutContext(0);
  expect(result).toBeDefined();
  expect(typeof result).toBe("object");
});

test("comparable history excludes day sessions, warmups, incomplete, and non-working sets", () => {
  const result = filterComparableHistory([
    { session_id: "normal", completed: 1, set_type: "normal", weight: 20, reps: 8 },
    { session_id: "day", completed: 1, set_type: "normal", weight: 30, reps: 8 },
    { session_id: "normal", completed: 1, set_type: "warmup", weight: 10, reps: 10 },
    { session_id: "normal", completed: 1, set_type: "dropset", weight: 15, reps: 10 },
    { session_id: "normal", completed: 0, set_type: "normal", weight: 25, reps: 8 },
  ], new Set(["normal"]));
  expect(result).toEqual([{ sessionId: "normal", weightKg: 20, reps: 8, completedWorkingSet: true }]);
});
