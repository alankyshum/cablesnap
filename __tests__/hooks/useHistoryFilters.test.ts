/**
 * Unit tests for historyFiltersReducer — BLD-938.
 *
 * Covers SET / CLEAR_ONE / CLEAR_ALL plus the no-op (referential identity)
 * behavior that lets memoized consumers skip re-renders.
 */
import {
  INITIAL_HISTORY_FILTERS,
  historyFiltersReducer,
  isAnyFilterActive,
} from "../../hooks/useHistoryFilters";

describe("historyFiltersReducer", () => {
  describe("SET_TEMPLATE", () => {
    it("sets a template id", () => {
      const next = historyFiltersReducer(INITIAL_HISTORY_FILTERS, {
        type: "SET_TEMPLATE",
        templateId: "tpl-1",
      });
      expect(next.templateId).toBe("tpl-1");
      expect(next.muscleGroup).toBeNull();
      expect(next.datePreset).toBeNull();
    });

    it("clears the template id (passes null)", () => {
      const seeded = { ...INITIAL_HISTORY_FILTERS, templateId: "tpl-1" };
      const next = historyFiltersReducer(seeded, {
        type: "SET_TEMPLATE",
        templateId: null,
      });
      expect(next.templateId).toBeNull();
    });

    it("returns the same reference when value is unchanged (memoization)", () => {
      const seeded = { ...INITIAL_HISTORY_FILTERS, templateId: "tpl-1" };
      const next = historyFiltersReducer(seeded, {
        type: "SET_TEMPLATE",
        templateId: "tpl-1",
      });
      expect(next).toBe(seeded);
    });
  });

  describe("SET_MUSCLE_GROUP", () => {
    it("sets a muscle group", () => {
      const next = historyFiltersReducer(INITIAL_HISTORY_FILTERS, {
        type: "SET_MUSCLE_GROUP",
        muscleGroup: "chest",
      });
      expect(next.muscleGroup).toBe("chest");
    });

    it("does not affect other filters", () => {
      const seeded = { ...INITIAL_HISTORY_FILTERS, templateId: "tpl-1" };
      const next = historyFiltersReducer(seeded, {
        type: "SET_MUSCLE_GROUP",
        muscleGroup: "chest",
      });
      expect(next.templateId).toBe("tpl-1");
      expect(next.muscleGroup).toBe("chest");
    });
  });

  describe("SET_DATE_PRESET", () => {
    it("sets a date preset", () => {
      const next = historyFiltersReducer(INITIAL_HISTORY_FILTERS, {
        type: "SET_DATE_PRESET",
        datePreset: "30d",
      });
      expect(next.datePreset).toBe("30d");
    });

    it("clears the date preset (passes null)", () => {
      const seeded = { ...INITIAL_HISTORY_FILTERS, datePreset: "7d" as const };
      const next = historyFiltersReducer(seeded, {
        type: "SET_DATE_PRESET",
        datePreset: null,
      });
      expect(next.datePreset).toBeNull();
    });
  });

  describe("CLEAR_ONE", () => {
    it("clears a specific filter while leaving others intact", () => {
      const seeded = {
        templateId: "tpl-1",
        muscleGroup: "chest",
        datePreset: "30d" as const,
      };
      const next = historyFiltersReducer(seeded, {
        type: "CLEAR_ONE",
        key: "muscleGroup",
      });
      expect(next.templateId).toBe("tpl-1");
      expect(next.muscleGroup).toBeNull();
      expect(next.datePreset).toBe("30d");
    });

    it("returns the same reference when the target is already null", () => {
      const seeded = { ...INITIAL_HISTORY_FILTERS, templateId: "tpl-1" };
      const next = historyFiltersReducer(seeded, {
        type: "CLEAR_ONE",
        key: "muscleGroup",
      });
      expect(next).toBe(seeded);
    });
  });

  describe("CLEAR_ALL", () => {
    it("clears every filter", () => {
      const seeded = {
        templateId: "tpl-1",
        muscleGroup: "chest",
        datePreset: "30d" as const,
      };
      const next = historyFiltersReducer(seeded, { type: "CLEAR_ALL" });
      expect(next).toEqual(INITIAL_HISTORY_FILTERS);
    });

    it("is a no-op when state is already initial (referential identity)", () => {
      const next = historyFiltersReducer(INITIAL_HISTORY_FILTERS, {
        type: "CLEAR_ALL",
      });
      expect(next).toBe(INITIAL_HISTORY_FILTERS);
    });
  });

  describe("isAnyFilterActive", () => {
    it("returns false for the initial state", () => {
      expect(isAnyFilterActive(INITIAL_HISTORY_FILTERS)).toBe(false);
    });

    it("returns true when any single filter is set", () => {
      expect(
        isAnyFilterActive({ ...INITIAL_HISTORY_FILTERS, templateId: "x" })
      ).toBe(true);
      expect(
        isAnyFilterActive({ ...INITIAL_HISTORY_FILTERS, muscleGroup: "chest" })
      ).toBe(true);
      expect(
        isAnyFilterActive({ ...INITIAL_HISTORY_FILTERS, datePreset: "7d" })
      ).toBe(true);
    });
  });
});
