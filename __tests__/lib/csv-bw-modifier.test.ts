// BLD-541: workout CSV must carry the bodyweight_modifier_kg column.
import { workoutCSV } from "@/lib/csv-format";
import type { WorkoutCSVRow } from "@/lib/db";

describe("workoutCSV — bodyweight_modifier_kg column (BLD-541)", () => {
  const base: Omit<WorkoutCSVRow, "bodyweight_modifier_kg"> = {
    date: "2026-04-20",
    exercise: "Pull-ups",
    set_number: 1,
    weight: 0,
    reps: 8,
    duration_seconds: null,
    notes: "",
    set_rpe: null,
    set_notes: "",
    link_id: null,
    tempo: null,
  };

  it.each([
    { name: "header includes column + positive modifier", modifier: 20, expected: "20" },
    { name: "assisted modifier", modifier: -15, expected: "-15" },
    { name: "null modifier", modifier: null, expected: "" },
    { name: "fractional modifier", modifier: 2.5, expected: "2.5" },
  ])("$name", ({ modifier, expected }) => {
    const row: WorkoutCSVRow = { ...base, bodyweight_modifier_kg: modifier };
    const out = workoutCSV([row]);
    const [header, data] = out.split("\n");
    expect(header).toBe(
      "date,exercise,set_number,weight,reps,duration_seconds,notes,set_rpe,set_notes,link_id,bodyweight_modifier_kg"
    );
    const cells = data.split(",");
    expect(cells[cells.length - 1]).toBe(expected);
  });
});
