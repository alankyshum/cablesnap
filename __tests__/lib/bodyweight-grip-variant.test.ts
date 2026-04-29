// BLD-768 / BLD-822: Unit tests for bodyweight grip variant helpers.
// Sibling of `cable-variant.test.ts`. Same shape, grip vocabulary.
import {
  GRIP_TYPE_VALUES,
  GRIP_WIDTH_VALUES,
  isBodyweightGripExercise,
  formatGripTypeLabel,
  formatGripWidthLabel,
  getLastBodyweightGripVariant,
  isGripType,
  isGripWidth,
} from "../../lib/bodyweight-grip-variant";

describe("bodyweight-grip-variant helpers", () => {
  describe("GRIP_TYPE_VALUES / GRIP_WIDTH_VALUES", () => {
    it("contains all 4 grip type values in canonical order", () => {
      expect(GRIP_TYPE_VALUES).toEqual(["overhand", "underhand", "neutral", "mixed"]);
    });

    it("contains all 3 grip width values in canonical order", () => {
      expect(GRIP_WIDTH_VALUES).toEqual(["narrow", "shoulder", "wide"]);
    });
  });

  describe("isBodyweightGripExercise — sole gate (equipment + regex on name)", () => {
    it.each([
      // Phase 1 in-scope exercises — equipment="bodyweight" AND name matches.
      ["Pull-up", true],
      ["Pull-Up", true],
      ["Pullup", true],
      ["Pullups", true],
      ["Chin-up", true],
      ["Chin-Up", true],
      ["Chinup", true],
      ["Inverted Row", true],
      ["inverted row", true],
      ["TRX Row", true],
      ["trx row", true],
      ["Australian Pull-up", true],
      // Out-of-scope (Phase 2+ or wrong family) — equipment="bodyweight" but name does not match.
      ["Push-up", false],
      ["Pushup", false],
      ["Cable Row", false],
      ["Bent Over Row", false],
      ["Dip", false],
      ["Plank", false],
      // Edge cases
      ["", false],
      [null, false],
    ] as const)("equipment=bodyweight, name=%p → %p", (name, expected) => {
      expect(isBodyweightGripExercise({ equipment: "bodyweight", name })).toBe(expected);
    });

    it("returns false for null/undefined exercise", () => {
      expect(isBodyweightGripExercise(null)).toBe(false);
      expect(isBodyweightGripExercise(undefined)).toBe(false);
    });

    it("returns false when equipment != 'bodyweight' even if name matches", () => {
      // Asymmetry vs isCableExercise: a cable lat-pulldown named "Pull-Up" is
      // tracked by BLD-771's gate, not this one.
      expect(isBodyweightGripExercise({ equipment: "cable", name: "Pull-Up" })).toBe(false);
      expect(isBodyweightGripExercise({ equipment: "barbell", name: "Pull-up" })).toBe(false);
      expect(isBodyweightGripExercise({ equipment: null, name: "Pull-up" })).toBe(false);
      expect(isBodyweightGripExercise({ name: "Pull-up" })).toBe(false);
    });

    it("returns false for exercise with no name field even when equipment is bodyweight", () => {
      expect(isBodyweightGripExercise({ equipment: "bodyweight" })).toBe(false);
    });

    it("documented limitation: 'Pull Up' (space, no hyphen) does NOT match", () => {
      // Acceptable v1 trade-off — seed names use hyphens. BLD-818 will add
      // structural movement_pattern column that fixes this properly.
      expect(isBodyweightGripExercise({ equipment: "bodyweight", name: "Pull Up" })).toBe(false);
    });

    it("does NOT match push-ups (out of scope — already 6 seed exercises by grip)", () => {
      // Critical exclusion: BLD-822 scope is pull-family + inverted rows only.
      expect(isBodyweightGripExercise({ equipment: "bodyweight", name: "Push-up" })).toBe(false);
      expect(isBodyweightGripExercise({ equipment: "bodyweight", name: "Diamond Push-up" })).toBe(false);
      expect(isBodyweightGripExercise({ equipment: "bodyweight", name: "Wide Grip Pushup" })).toBe(false);
    });

    it("does NOT match dips (Phase 2 — BLD-818 will add separate gate)", () => {
      expect(isBodyweightGripExercise({ equipment: "bodyweight", name: "Dip" })).toBe(false);
      expect(isBodyweightGripExercise({ equipment: "bodyweight", name: "Ring Dip" })).toBe(false);
    });
  });

  describe("formatGripTypeLabel / formatGripWidthLabel", () => {
    it.each([
      ["overhand", "Overhand"],
      ["underhand", "Underhand"],
      ["neutral", "Neutral"],
      ["mixed", "Mixed"],
    ] as const)("grip type %s → %s", (input, label) => {
      expect(formatGripTypeLabel(input)).toBe(label);
    });

    it.each([
      ["narrow", "Narrow"],
      ["shoulder", "Shoulder-width"],
      ["wide", "Wide"],
    ] as const)("grip width %s → %s", (input, label) => {
      expect(formatGripWidthLabel(input)).toBe(label);
    });

    it("null/undefined → 'None'", () => {
      expect(formatGripTypeLabel(null)).toBe("None");
      expect(formatGripTypeLabel(undefined)).toBe("None");
      expect(formatGripWidthLabel(null)).toBe("None");
      expect(formatGripWidthLabel(undefined)).toBe("None");
    });
  });

  describe("getLastBodyweightGripVariant — autofill chain", () => {
    it("returns nulls when history is empty", () => {
      expect(getLastBodyweightGripVariant([])).toEqual({ grip_type: null, grip_width: null });
    });

    it("returns nulls when all rows have nulls", () => {
      expect(
        getLastBodyweightGripVariant([
          { grip_type: null, grip_width: null },
          { grip_type: null, grip_width: null },
        ])
      ).toEqual({ grip_type: null, grip_width: null });
    });

    it("most-recent row wins when both attributes set", () => {
      expect(
        getLastBodyweightGripVariant([
          { grip_type: "overhand", grip_width: "wide" },
          { grip_type: "underhand", grip_width: "narrow" },
        ])
      ).toEqual({ grip_type: "overhand", grip_width: "wide" });
    });

    it("each attribute resolves independently from nearest non-null", () => {
      // Most recent has grip_type but no grip_width; older has grip_width.
      expect(
        getLastBodyweightGripVariant([
          { grip_type: "overhand", grip_width: null },
          { grip_type: null, grip_width: "shoulder" },
        ])
      ).toEqual({ grip_type: "overhand", grip_width: "shoulder" });
    });

    it("stops scanning once both attributes are resolved", () => {
      const result = getLastBodyweightGripVariant([
        { grip_type: "overhand", grip_width: null },
        { grip_type: null, grip_width: "wide" },
        { grip_type: "underhand", grip_width: "narrow" },
      ]);
      expect(result).toEqual({ grip_type: "overhand", grip_width: "wide" });
    });

    it("does NOT silent-default — returns null when no row carries the attribute", () => {
      // grip_type present, grip_width never set → grip_width stays null.
      // NEVER fills from an exercise-level default (silent-default trap, QD-B2).
      expect(
        getLastBodyweightGripVariant([
          { grip_type: "overhand", grip_width: null },
          { grip_type: "overhand", grip_width: null },
        ])
      ).toEqual({ grip_type: "overhand", grip_width: null });
    });
  });

  describe("isGripType / isGripWidth type guards", () => {
    it.each(["overhand", "underhand", "neutral", "mixed"])(
      "isGripType(%p) === true",
      (v) => {
        expect(isGripType(v)).toBe(true);
      }
    );

    it.each(["narrow", "shoulder", "wide"])("isGripWidth(%p) === true", (v) => {
      expect(isGripWidth(v)).toBe(true);
    });

    it.each(["", null, undefined, 42, "Overhand", "OVERHAND", "supinated", {}])(
      "isGripType(%p) === false",
      (v) => {
        expect(isGripType(v)).toBe(false);
      }
    );

    it.each(["", null, undefined, "Narrow", "extra_wide", 0])(
      "isGripWidth(%p) === false",
      (v) => {
        expect(isGripWidth(v)).toBe(false);
      }
    );
  });
});
