import { STARTER_TEMPLATES, STARTER_PROGRAMS, STARTER_VERSION } from "../../lib/starter-templates";
import { DIFFICULTY_LABELS } from "../../lib/types";
import { seedExercises } from "../../lib/seed";

describe("starter-templates data", () => {
  it("has at least 8 starter templates", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(8);
  });

  it("has unique template IDs", () => {
    const ids = STARTER_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each template has at least 1 exercise", () => {
    for (const tpl of STARTER_TEMPLATES) {
      expect(tpl.exercises.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("each exercise has a unique ID within its template", () => {
    for (const tpl of STARTER_TEMPLATES) {
      const ids = tpl.exercises.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("all exercise IDs are globally unique", () => {
    const ids = STARTER_TEMPLATES.flatMap((t) => t.exercises.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all exercise_ids reference known exercises", () => {
    for (const tpl of STARTER_TEMPLATES) {
      for (const ex of tpl.exercises) {
        expect(ex.exercise_id).toMatch(/^(voltra-\d{3}|mw-bw-\d{3}|mw-bb-\d{3})$/);
      }
    }
  });

  it("template 1 (Full Body) is marked recommended", () => {
    const full = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-1");
    expect(full).toBeDefined();
    expect(full!.recommended).toBe(true);
  });

  it("non-recommended templates have no recommended flag", () => {
    const others = STARTER_TEMPLATES.filter((t) => t.id !== "starter-tpl-1");
    for (const tpl of others) {
      expect(tpl.recommended).toBeFalsy();
    }
  });

  it("each template has valid difficulty", () => {
    for (const tpl of STARTER_TEMPLATES) {
      expect(DIFFICULTY_LABELS[tpl.difficulty]).toBeDefined();
    }
  });

  it("each template has a duration string", () => {
    for (const tpl of STARTER_TEMPLATES) {
      expect(tpl.duration).toMatch(/^~\d+ min$/);
    }
  });

  it("each exercise has valid sets, reps, rest", () => {
    for (const tpl of STARTER_TEMPLATES) {
      for (const ex of tpl.exercises) {
        expect(ex.target_sets).toBeGreaterThanOrEqual(1);
        expect(ex.target_reps).toMatch(/^\d+(-\d+)?(, \d+(-\d+)?)?$/);
        expect(ex.rest_seconds).toBeGreaterThan(0);
      }
    }
  });

  it("STARTER_VERSION is a positive integer", () => {
    expect(STARTER_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(STARTER_VERSION)).toBe(true);
  });
});

describe("starter program data", () => {
  it("has at least 2 programs", () => {
    expect(STARTER_PROGRAMS.length).toBeGreaterThanOrEqual(2);
  });

  it("each program has valid fields", () => {
    for (const prog of STARTER_PROGRAMS) {
      expect(prog.id).toBeTruthy();
      expect(prog.name).toBeTruthy();
      expect(prog.description).toBeTruthy();
      expect(prog.days.length).toBeGreaterThan(0);
    }
  });

  it("each day references a valid starter template", () => {
    const tplIds = new Set(STARTER_TEMPLATES.map((t) => t.id));
    for (const prog of STARTER_PROGRAMS) {
      for (const day of prog.days) {
        expect(tplIds.has(day.template_id)).toBe(true);
      }
    }
  });

  it("days have unique IDs across all programs", () => {
    const ids = STARTER_PROGRAMS.flatMap((p) => p.days.map((d) => d.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("days have labels", () => {
    for (const prog of STARTER_PROGRAMS) {
      for (const day of prog.days) {
        expect(day.label).toBeTruthy();
      }
    }
  });

  it("PPL program references Push, Pull, Legs templates", () => {
    const ppl = STARTER_PROGRAMS.find((p) => p.id === "starter-prog-1")!;
    expect(ppl.days[0].template_id).toBe("starter-tpl-2");
    expect(ppl.days[1].template_id).toBe("starter-tpl-3");
    expect(ppl.days[2].template_id).toBe("starter-tpl-4");
  });

  it("Founder's Favourite program has 2 alternating days", () => {
    const ff = STARTER_PROGRAMS.find((p) => p.id === "starter-prog-2")!;
    expect(ff.days).toHaveLength(2);
    expect(ff.days[0].template_id).toBe("starter-tpl-7a");
    expect(ff.days[1].template_id).toBe("starter-tpl-7b");
  });
});

// --- Regression: BLD-255 — exercise references must exist in seed data ---
describe("starter template exercise references (BLD-255 regression)", () => {
  const allExercises = seedExercises();
  const exerciseIds = new Set(allExercises.map((e) => e.id));

  it("all starter template exercises reference valid seed exercise IDs", () => {
    for (const tpl of STARTER_TEMPLATES) {
      for (const ex of tpl.exercises) {
        expect(exerciseIds.has(ex.exercise_id)).toBe(true);
      }
    }
  });

  it("every starter template has non-empty exercises array", () => {
    for (const tpl of STARTER_TEMPLATES) {
      expect(tpl.exercises.length).toBeGreaterThan(0);
    }
  });

  it("every starter template exercise has all required fields", () => {
    for (const tpl of STARTER_TEMPLATES) {
      for (const ex of tpl.exercises) {
        expect(ex.id).toBeTruthy();
        expect(ex.exercise_id).toBeTruthy();
        expect(ex.target_sets).toBeGreaterThanOrEqual(1);
        expect(ex.target_reps).toBeTruthy();
        expect(ex.rest_seconds).toBeGreaterThan(0);
      }
    }
  });

  it("Founder's Favourite templates have exercises and metadata", () => {
    const dayA = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-7a");
    const dayB = STARTER_TEMPLATES.find((t) => t.id === "starter-tpl-7b");
    expect(dayA).toBeDefined();
    expect(dayB).toBeDefined();
    expect(dayA!.exercises).toHaveLength(5);
    expect(dayB!.exercises).toHaveLength(5);
    expect(dayA!.difficulty).toBe("advanced");
    expect(dayB!.difficulty).toBe("advanced");
  });
});
