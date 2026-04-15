import { STARTER_TEMPLATES, STARTER_PROGRAM, STARTER_VERSION } from "../../lib/starter-templates";
import { DIFFICULTY_LABELS } from "../../lib/types";

describe("starter-templates data", () => {
  it("has at least 6 starter templates", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(6);
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

  it("all exercise_ids reference voltra exercises", () => {
    for (const tpl of STARTER_TEMPLATES) {
      for (const ex of tpl.exercises) {
        expect(ex.exercise_id).toMatch(/^voltra-\d{3}$/);
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
        expect(ex.target_reps).toMatch(/^\d+(-\d+)?$/);
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
  it("has a valid program", () => {
    expect(STARTER_PROGRAM.id).toBe("starter-prog-1");
    expect(STARTER_PROGRAM.name).toBeTruthy();
    expect(STARTER_PROGRAM.description).toBeTruthy();
  });

  it("has 3 days", () => {
    expect(STARTER_PROGRAM.days).toHaveLength(3);
  });

  it("each day references a valid starter template", () => {
    const tplIds = new Set(STARTER_TEMPLATES.map((t) => t.id));
    for (const day of STARTER_PROGRAM.days) {
      expect(tplIds.has(day.template_id)).toBe(true);
    }
  });

  it("days have unique IDs", () => {
    const ids = STARTER_PROGRAM.days.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("days have labels", () => {
    for (const day of STARTER_PROGRAM.days) {
      expect(day.label).toBeTruthy();
    }
  });

  it("PPL program references Push, Pull, Legs templates", () => {
    expect(STARTER_PROGRAM.days[0].template_id).toBe("starter-tpl-2");
    expect(STARTER_PROGRAM.days[1].template_id).toBe("starter-tpl-3");
    expect(STARTER_PROGRAM.days[2].template_id).toBe("starter-tpl-4");
  });
});
