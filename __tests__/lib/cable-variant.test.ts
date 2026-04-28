// BLD-771: Unit tests for cable variant helpers.
import {
  ATTACHMENT_VALUES,
  MOUNT_POSITION_VALUES,
  isCableExercise,
  formatAttachmentLabel,
  formatMountPositionLabel,
  getLastVariant,
  isAttachment,
  isMountPosition,
} from "../../lib/cable-variant";

describe("cable-variant helpers", () => {
  describe("ATTACHMENT_VALUES / MOUNT_POSITION_VALUES", () => {
    it("contains all 7 attachment values in canonical order", () => {
      expect(ATTACHMENT_VALUES).toEqual([
        "handle",
        "ring_handle",
        "ankle_strap",
        "rope",
        "bar",
        "squat_harness",
        "carabiner",
      ]);
    });

    it("contains all 4 mount position values in canonical order", () => {
      expect(MOUNT_POSITION_VALUES).toEqual(["high", "mid", "low", "floor"]);
    });
  });

  describe("isCableExercise — sole gate (8 cases per AC)", () => {
    it.each([
      ["cable", true],
      ["Cable", true],
      ["cable_machine", true],
      ["Cable, Dumbbell", true],
      ["dumbbell", false],
      ["", false],
      [null, false],
      [undefined, false],
    ] as const)("equipment=%p → %p", (equipment, expected) => {
      const exercise = equipment === undefined ? undefined : { equipment };
      expect(isCableExercise(exercise as { equipment?: string | null } | undefined)).toBe(expected);
    });

    it("returns false for null exercise", () => {
      expect(isCableExercise(null)).toBe(false);
    });

    it("returns false for exercise with no equipment field", () => {
      expect(isCableExercise({})).toBe(false);
    });

    it("matches case-insensitively for any cable substring placement", () => {
      expect(isCableExercise({ equipment: "BARBELL CABLE" })).toBe(true);
      expect(isCableExercise({ equipment: "MachineCable" })).toBe(true);
    });
  });

  describe("formatAttachmentLabel / formatMountPositionLabel", () => {
    it.each([
      ["handle", "Handle"],
      ["ring_handle", "Ring Handle"],
      ["ankle_strap", "Ankle Strap"],
      ["rope", "Rope"],
      ["bar", "Bar"],
      ["squat_harness", "Squat Harness"],
      ["carabiner", "Carabiner"],
    ] as const)("attachment %s → %s", (input, label) => {
      expect(formatAttachmentLabel(input)).toBe(label);
    });

    it.each([
      ["high", "High"],
      ["mid", "Mid"],
      ["low", "Low"],
      ["floor", "Floor"],
    ] as const)("mount %s → %s", (input, label) => {
      expect(formatMountPositionLabel(input)).toBe(label);
    });

    it("null/undefined → 'None'", () => {
      expect(formatAttachmentLabel(null)).toBe("None");
      expect(formatAttachmentLabel(undefined)).toBe("None");
      expect(formatMountPositionLabel(null)).toBe("None");
      expect(formatMountPositionLabel(undefined)).toBe("None");
    });
  });

  describe("getLastVariant — autofill chain", () => {
    it("returns nulls when history is empty", () => {
      expect(getLastVariant([])).toEqual({ attachment: null, mount_position: null });
    });

    it("returns nulls when all rows have nulls (caller must filter, but defense-in-depth)", () => {
      expect(
        getLastVariant([
          { attachment: null, mount_position: null },
          { attachment: null, mount_position: null },
        ])
      ).toEqual({ attachment: null, mount_position: null });
    });

    it("most-recent row wins when both attributes set", () => {
      expect(
        getLastVariant([
          { attachment: "rope", mount_position: "high" },
          { attachment: "bar", mount_position: "low" },
        ])
      ).toEqual({ attachment: "rope", mount_position: "high" });
    });

    it("each attribute resolves independently from nearest non-null", () => {
      // Most recent set has attachment but no mount; older set has mount.
      expect(
        getLastVariant([
          { attachment: "rope", mount_position: null },
          { attachment: null, mount_position: "high" },
        ])
      ).toEqual({ attachment: "rope", mount_position: "high" });
    });

    it("stops scanning once both attributes are resolved", () => {
      // Third row would otherwise overwrite mount_position, but loop must exit
      // after second row resolves both fields.
      const result = getLastVariant([
        { attachment: "rope", mount_position: null },
        { attachment: null, mount_position: "high" },
        { attachment: "bar", mount_position: "low" },
      ]);
      expect(result).toEqual({ attachment: "rope", mount_position: "high" });
    });

    it("does NOT silent-default — returns null when no row carries the attribute", () => {
      // attachment present, mount never set → mount stays null. NEVER fills
      // from an exercise-level default.
      expect(
        getLastVariant([
          { attachment: "rope", mount_position: null },
          { attachment: "rope", mount_position: null },
        ])
      ).toEqual({ attachment: "rope", mount_position: null });
    });
  });

  describe("isAttachment / isMountPosition type guards", () => {
    it.each(["handle", "rope", "bar", "ring_handle", "carabiner"])(
      "isAttachment(%p) === true",
      (v) => {
        expect(isAttachment(v)).toBe(true);
      }
    );

    it.each(["high", "mid", "low", "floor"])("isMountPosition(%p) === true", (v) => {
      expect(isMountPosition(v)).toBe(true);
    });

    it.each(["", null, undefined, 42, "Cable", "HANDLE", "v_bar", {}])(
      "isAttachment(%p) === false",
      (v) => {
        expect(isAttachment(v)).toBe(false);
      }
    );

    it.each(["", null, undefined, "High", "dual_high", 0])(
      "isMountPosition(%p) === false",
      (v) => {
        expect(isMountPosition(v)).toBe(false);
      }
    );
  });
});
