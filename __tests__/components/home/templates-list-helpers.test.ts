import { buildMetaBadges, buildMenuItems } from "../../../components/home/TemplatesList";
import type { WorkoutTemplate } from "../../../lib/types";

describe("buildMetaBadges", () => {
  const starterMeta = {
    id: "starter-1",
    name: "Full Body",
    difficulty: "beginner" as const,
    duration: "~35 min",
    recommended: true,
    exercises: [
      { id: "e1", exercise_id: "voltra-001", target_sets: 3, target_reps: "10", rest_seconds: 60 },
      { id: "e2", exercise_id: "voltra-002", target_sets: 3, target_reps: "10", rest_seconds: 60 },
    ],
  };

  it("returns difficulty + clock + exercise count badges for starter templates", () => {
    const badges = buildMetaBadges(starterMeta, {}, {}, "starter-1");
    expect(badges).toHaveLength(3);
    expect(badges[0]).toMatchObject({ label: "Beginner", difficulty: "beginner" });
    expect(badges[1]).toMatchObject({ icon: "clock-outline", label: "~35 min" });
    expect(badges[2]).toMatchObject({ icon: "dumbbell", label: "2 exercises" });
  });

  it("returns clock + exercise count badges for user template with duration estimate", () => {
    const counts = { "tpl-1": 5 };
    const durations = { "tpl-1": 2700 }; // 45 min
    const badges = buildMetaBadges(undefined, counts, durations, "tpl-1");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toMatchObject({ icon: "clock-outline", label: "~45m" });
    expect(badges[1]).toMatchObject({ icon: "dumbbell", label: "5 exercises" });
  });

  it("omits clock badge when duration estimate is null", () => {
    const counts = { "tpl-2": 3 };
    const durations = { "tpl-2": null };
    const badges = buildMetaBadges(undefined, counts, durations, "tpl-2");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ icon: "dumbbell", label: "3 exercises" });
  });

  it("omits clock badge when template has no duration entry", () => {
    const badges = buildMetaBadges(undefined, { "tpl-3": 4 }, {}, "tpl-3");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ icon: "dumbbell", label: "4 exercises" });
  });

  it("defaults exercise count to 0 when missing from counts map", () => {
    const badges = buildMetaBadges(undefined, {}, {}, "tpl-unknown");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ icon: "dumbbell", label: "0 exercises" });
  });
});

describe("buildMenuItems", () => {
  const mockTemplate: WorkoutTemplate = {
    id: "tpl-1",
    name: "Push Day",
    is_starter: false,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const noop = () => {};

  it("returns only Duplicate for starter templates", () => {
    const items = buildMenuItems(true, mockTemplate, noop, noop, noop);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("Duplicate");
    expect(items[0].icon).toBe("content-copy");
  });

  it("returns Edit + Duplicate + Delete for user templates", () => {
    const items = buildMenuItems(false, mockTemplate, noop, noop, noop);
    expect(items).toHaveLength(3);
    expect(items[0].label).toBe("Edit");
    expect(items[1].label).toBe("Duplicate");
    expect(items[2].label).toBe("Delete");
    expect(items[2].destructive).toBe(true);
  });

  it("calls onEdit with template id when Edit is pressed", () => {
    const onEdit = jest.fn();
    const items = buildMenuItems(false, mockTemplate, noop, onEdit, noop);
    items[0].onPress();
    expect(onEdit).toHaveBeenCalledWith("tpl-1");
  });

  it("calls onOptions with template when Duplicate is pressed (user template)", () => {
    const onOptions = jest.fn();
    const items = buildMenuItems(false, mockTemplate, onOptions, noop, noop);
    items[1].onPress();
    expect(onOptions).toHaveBeenCalledWith(mockTemplate);
  });

  it("calls onDelete with template when Delete is pressed", () => {
    const onDelete = jest.fn();
    const items = buildMenuItems(false, mockTemplate, noop, noop, onDelete);
    items[2].onPress();
    expect(onDelete).toHaveBeenCalledWith(mockTemplate);
  });

  it("calls onOptions with template when Duplicate is pressed (starter)", () => {
    const onOptions = jest.fn();
    const items = buildMenuItems(true, mockTemplate, onOptions, noop, noop);
    items[0].onPress();
    expect(onOptions).toHaveBeenCalledWith(mockTemplate);
  });
});
