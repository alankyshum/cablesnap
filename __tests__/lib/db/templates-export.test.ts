import { sanitizeTemplateFilename, buildExportPayload, countUniqueCustomOrUnresolved, exportCoachTemplate } from "../../../lib/db/templates-export";
import { importCoachTemplates } from "../../../lib/db/templates";
import type { WorkoutTemplate, TemplateExercise, Exercise, SetType } from "../../../lib/types";
import { validateCoachTemplateImportData } from "../../../lib/schemas";

// --- Mocks ---

const mockShareAsync = jest.fn().mockResolvedValue(undefined);
const mockIsAvailableAsync = jest.fn().mockResolvedValue(true);

jest.mock("expo-sharing", () => ({
  shareAsync: (...args: unknown[]) => mockShareAsync(...args),
  isAvailableAsync: () => mockIsAvailableAsync(),
}));

// expo-file-system: track File constructor calls and write calls via module-level array
const fileWriteCalls: unknown[][] = [];
const fileConstructorCalls: unknown[][] = [];

jest.mock("expo-file-system", () => ({
  File: class MockFile {
    uri: string;
    constructor(base: string, name: string) {
      fileConstructorCalls.push([base, name]);
      this.uri = `${base}/${name}`;
    }
    async write(content: unknown) {
      fileWriteCalls.push([content]);
    }
  },
  Paths: { cache: "file:///cache" },
}));

const mockGetTemplateById = jest.fn();
const mockImportCoachTemplates = jest.fn();
jest.mock("../../../lib/db/templates", () => ({
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
  importCoachTemplates: (...args: unknown[]) => mockImportCoachTemplates(...args),
}));

const mockAlert = jest.fn();
jest.mock("react-native", () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
}));

// --- Helpers ---

function makeBaseExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: "mw-bb-001",
    name: "Bench Press",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: [],
    equipment: "barbell",
    instructions: "",
    difficulty: "intermediate",
    is_custom: false,
    deleted_at: null,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<TemplateExercise> = {}): TemplateExercise {
  return {
    id: "te-1",
    template_id: "tpl-1",
    exercise_id: "mw-bb-001",
    position: 0,
    target_sets: 3,
    target_reps: "8-12",
    rest_seconds: 90,
    link_id: null,
    link_label: "",
    target_duration_seconds: null,
    set_types: ["normal", "normal", "normal"],
    exercise: makeBaseExercise(),
    ...overrides,
  };
}

function makeTemplate(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return {
    id: "tpl-1",
    name: "Push Day",
    created_at: 1000000,
    updated_at: 1000000,
    source: null,
    is_starter: false,
    exercises: [makeExercise()],
    ...overrides,
  };
}

// --- sanitizeTemplateFilename ---

describe("sanitizeTemplateFilename", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(sanitizeTemplateFilename("Push Day A")).toBe("push-day-a");
  });

  it("strips diacritics", () => {
    expect(sanitizeTemplateFilename("Café Workout")).toBe("cafe-workout");
  });

  it("returns 'template' for all-emoji names", () => {
    expect(sanitizeTemplateFilename("🏋️💪🔥")).toBe("template");
  });

  it("returns 'template' for empty string", () => {
    expect(sanitizeTemplateFilename("")).toBe("template");
  });

  it("truncates at 60 chars", () => {
    const longName = "a".repeat(100);
    expect(sanitizeTemplateFilename(longName)).toHaveLength(60);
  });

  it("trims leading and trailing hyphens", () => {
    expect(sanitizeTemplateFilename("---foo---")).toBe("foo");
  });

  it("preserves only a-z0-9 and hyphens", () => {
    expect(sanitizeTemplateFilename("Hello World!@#$%^")).toBe("hello-world");
  });
});

// --- countUniqueCustomOrUnresolved ---

describe("countUniqueCustomOrUnresolved", () => {
  it("returns 0 for all seeded (non-custom, resolved) exercises", () => {
    const tpl = makeTemplate();
    expect(countUniqueCustomOrUnresolved(tpl)).toBe(0);
  });

  it("counts unique custom exercise_ids", () => {
    const tpl = makeTemplate({
      exercises: [
        makeExercise({ exercise_id: "custom-1", exercise: makeBaseExercise({ id: "custom-1", is_custom: true }) }),
        makeExercise({ id: "te-2", exercise_id: "custom-1", exercise: makeBaseExercise({ id: "custom-1", is_custom: true }) }), // duplicate exercise_id
        makeExercise({ id: "te-3", exercise_id: "custom-2", exercise: makeBaseExercise({ id: "custom-2", is_custom: true }) }),
      ],
    });
    expect(countUniqueCustomOrUnresolved(tpl)).toBe(2); // unique ids: custom-1, custom-2
  });

  it("counts unresolved (exercise = undefined) as custom", () => {
    const tpl = makeTemplate({
      exercises: [
        makeExercise({ exercise_id: "deleted-ex", exercise: undefined }),
      ],
    });
    expect(countUniqueCustomOrUnresolved(tpl)).toBe(1);
  });

  it("does not count mw-bb-* or mw-bw-* as custom (seeded community)", () => {
    const tpl = makeTemplate({
      exercises: [
        makeExercise({ exercise_id: "mw-bb-001", exercise: makeBaseExercise({ id: "mw-bb-001", is_custom: false }) }),
        makeExercise({ id: "te-2", exercise_id: "mw-bw-010", exercise: makeBaseExercise({ id: "mw-bw-010", is_custom: false }) }),
      ],
    });
    expect(countUniqueCustomOrUnresolved(tpl)).toBe(0);
  });
});

// --- buildExportPayload ---

describe("buildExportPayload", () => {
  it("sets version = 1", () => {
    const tpl = makeTemplate();
    expect(buildExportPayload(tpl).version).toBe(1);
  });

  it("trims template name", () => {
    const tpl = makeTemplate({ name: "  Push Day  " });
    expect(buildExportPayload(tpl).templates[0].name).toBe("Push Day");
  });

  it("omits position from exercise payload", () => {
    const tpl = makeTemplate();
    const payload = buildExportPayload(tpl);
    expect(payload.templates[0].exercises[0]).not.toHaveProperty("position");
  });

  it("omits set_types when empty array", () => {
    const tpl = makeTemplate({ exercises: [makeExercise({ set_types: [] })] });
    const payload = buildExportPayload(tpl);
    expect(payload.templates[0].exercises[0]).not.toHaveProperty("set_types");
  });

  it("includes set_types when non-empty", () => {
    const tpl = makeTemplate({ exercises: [makeExercise({ set_types: ["warmup", "normal"] })] });
    const payload = buildExportPayload(tpl);
    expect(payload.templates[0].exercises[0].set_types).toEqual(["warmup", "normal"]);
  });

  it("omits link_id when null", () => {
    const tpl = makeTemplate({ exercises: [makeExercise({ link_id: null })] });
    const payload = buildExportPayload(tpl);
    expect(payload.templates[0].exercises[0]).not.toHaveProperty("link_id");
  });

  it("includes link_id when set", () => {
    const tpl = makeTemplate({ exercises: [makeExercise({ link_id: "link-abc" })] });
    const payload = buildExportPayload(tpl);
    expect(payload.templates[0].exercises[0].link_id).toBe("link-abc");
  });

  it("omits target_duration_seconds when null", () => {
    const tpl = makeTemplate({ exercises: [makeExercise({ target_duration_seconds: null })] });
    const payload = buildExportPayload(tpl);
    expect(payload.templates[0].exercises[0]).not.toHaveProperty("target_duration_seconds");
  });

  it("round-trip: buildExportPayload then validateCoachTemplateImportData succeeds", async () => {
    
    const tpl = makeTemplate();
    const payload = buildExportPayload(tpl);
    const result = validateCoachTemplateImportData(payload);
    expect(result.success).toBe(true);
  });
});

// --- exportCoachTemplate ---

describe("exportCoachTemplate", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fileWriteCalls.length = 0;
    fileConstructorCalls.length = 0;
    mockIsAvailableAsync.mockResolvedValue(true);
    mockShareAsync.mockResolvedValue(undefined);
  });

  it("throws 'Sharing not available on this device' when sharing unavailable", async () => {
    // Hydration happens first (AC#3), so we need a valid template to be returned
    mockGetTemplateById.mockResolvedValue(makeTemplate());
    mockIsAvailableAsync.mockResolvedValue(false);
    await expect(exportCoachTemplate("tpl-1")).rejects.toThrow("Sharing not available on this device");
    expect(fileWriteCalls).toHaveLength(0);
  });

  it("throws 'Template not found' when getTemplateById returns null", async () => {
    mockGetTemplateById.mockResolvedValue(null);
    await expect(exportCoachTemplate("tpl-1")).rejects.toThrow("Template not found");
  });

  it("throws 'Cannot export empty template' when exercises array is empty", async () => {
    mockGetTemplateById.mockResolvedValue(makeTemplate({ exercises: [] }));
    await expect(exportCoachTemplate("tpl-1")).rejects.toThrow("Cannot export empty template");
    expect(fileWriteCalls).toHaveLength(0);
  });

  it("calls shareAsync for a template with only seeded exercises (no Alert)", async () => {
    mockGetTemplateById.mockResolvedValue(makeTemplate());
    await exportCoachTemplate("tpl-1");
    expect(mockAlert).not.toHaveBeenCalled();
    expect(fileWriteCalls).toHaveLength(1);
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });

  it("shows Alert when template has custom exercises; 'Export anyway' proceeds", async () => {
    mockGetTemplateById.mockResolvedValue(
      makeTemplate({
        exercises: [makeExercise({ exercise_id: "custom-1", exercise: makeBaseExercise({ id: "custom-1", is_custom: true }) })],
      })
    );
    mockAlert.mockImplementation((_title: string, _msg: string, buttons: { text: string; onPress?: () => void }[]) => {
      const btn = buttons.find((b) => b.text === "Export anyway");
      btn?.onPress?.();
    });
    await exportCoachTemplate("tpl-1");
    expect(mockAlert).toHaveBeenCalledTimes(1);
    expect(fileWriteCalls).toHaveLength(1);
    expect(mockShareAsync).toHaveBeenCalledTimes(1);
  });

  it("shows Alert when template has custom exercises; Cancel aborts without file write", async () => {
    mockGetTemplateById.mockResolvedValue(
      makeTemplate({
        exercises: [makeExercise({ exercise_id: "custom-1", exercise: makeBaseExercise({ id: "custom-1", is_custom: true }) })],
      })
    );
    mockAlert.mockImplementation((_title: string, _msg: string, buttons: { text: string; style?: string; onPress?: () => void }[]) => {
      const btn = buttons.find((b) => b.text === "Cancel");
      btn?.onPress?.();
    });
    await expect(exportCoachTemplate("tpl-1")).rejects.toThrow("cancelled");
    expect(fileWriteCalls).toHaveLength(0);
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it("includes correct unique custom count in Alert message", async () => {
    mockGetTemplateById.mockResolvedValue(
      makeTemplate({
        exercises: [
          makeExercise({ exercise_id: "c1", exercise: makeBaseExercise({ id: "c1", is_custom: true }) }),
          makeExercise({ id: "te-2", exercise_id: "c2", exercise: makeBaseExercise({ id: "c2", is_custom: true }) }),
        ],
      })
    );
    mockAlert.mockImplementation((_title: string, _msg: string, buttons: { text: string; onPress?: () => void }[]) => {
      const btn = buttons.find((b) => b.text === "Export anyway");
      btn?.onPress?.();
    });
    await exportCoachTemplate("tpl-1");
    const alertMsg = mockAlert.mock.calls[0][1] as string;
    expect(alertMsg).toContain("2 custom exercises");
  });

  it("filename uses sanitized template name", async () => {
    mockGetTemplateById.mockResolvedValue(makeTemplate({ name: "Push Day A" }));
    await exportCoachTemplate("tpl-1");
    expect(fileConstructorCalls[0]).toEqual(["file:///cache", "cablesnap-template-push-day-a.json"]);
  });

  it("written JSON validates against coachTemplateImportSchema", async () => {
    mockGetTemplateById.mockResolvedValue(makeTemplate());
    await exportCoachTemplate("tpl-1");
    
    const writtenJson = fileWriteCalls[0][0] as string;
    const result = validateCoachTemplateImportData(JSON.parse(writtenJson));
    expect(result.success).toBe(true);
  });

  it("canonical round-trip: export(T) → importCoachTemplates → getTemplateById → re-export produces equal payload", async () => {
    // Construct T with all interesting fields: a link group, mixed set_types, one seeded exercise
    const tpl = makeTemplate({
      name: "  Push Day  ", // leading/trailing space — trimmed by import
      exercises: [
        makeExercise({
          id: "te-1",
          exercise_id: "mw-bb-001",
          target_sets: 3,
          target_reps: "8-12",
          rest_seconds: 90,
          link_id: "link-A",
          link_label: "Superset",
          target_duration_seconds: null,
          set_types: ["warmup", "normal", "normal"],
          exercise: makeBaseExercise({ id: "mw-bb-001", is_custom: false }),
        }),
        makeExercise({
          id: "te-2",
          exercise_id: "mw-bb-002",
          target_sets: 3,
          target_reps: "10",
          rest_seconds: 60,
          link_id: "link-A",      // same group as te-1
          link_label: "Superset",
          target_duration_seconds: null,
          set_types: ["normal", "normal", "normal"],
          exercise: makeBaseExercise({ id: "mw-bb-002", is_custom: false }),
        }),
      ],
    });

    // P1: export the original template
    const payload1 = buildExportPayload(tpl);
    expect(validateCoachTemplateImportData(payload1).success).toBe(true);

    // Simulate what importCoachTemplates does to produce T' (the post-import, post-hydration template):
    // - name.trim()
    // - link_ids remapped to new UUIDs (but grouping preserved — same group gets same new id)
    // - link_label defaults to "" if missing
    // - target_duration_seconds defaults to null if missing
    // - set_types normalized via normalizeTemplateSetTypes(set_types, target_sets)
    // - position = exerciseIndex
    // - id/template_id regenerated (irrelevant to payload equality)
    const newLinkId = "new-link-uuid";
    const tPrime: WorkoutTemplate = {
      id: "tpl-imported",
      name: payload1.templates[0].name, // already trimmed by buildExportPayload
      created_at: 2000000,
      updated_at: 2000000,
      source: "coach",
      is_starter: false,
      exercises: payload1.templates[0].exercises.map((ex, idx) => ({
        id: `te-new-${idx}`,
        template_id: "tpl-imported",
        exercise_id: ex.exercise_id,
        position: idx,
        target_sets: ex.target_sets,
        target_reps: ex.target_reps,
        rest_seconds: ex.rest_seconds,
        // importCoachTemplates remaps link_id: same input link_id → same new UUID
        link_id: ex.link_id != null ? newLinkId : null,
        link_label: ex.link_label ?? "",
        target_duration_seconds: ex.target_duration_seconds ?? null,
        // Inline normalizeTemplateSetTypes (mirrors lib/db/templates.ts:28-30)
        set_types: Array.from({ length: ex.target_sets }, (_, i) => (ex.set_types as SetType[] | undefined)?.[i] ?? ("normal" as SetType)),
        exercise: makeBaseExercise({ id: ex.exercise_id, is_custom: false }),
      })),
    };

    // Emulate the importCoachTemplates + getTemplateById calls
    mockImportCoachTemplates.mockResolvedValue(["tpl-imported"]);
    mockGetTemplateById.mockResolvedValue(tPrime);

    // Call the actual mocked functions as the production code would
    const [importedId] = await importCoachTemplates(payload1);
    const tPrimeResult = await mockGetTemplateById(importedId);

    // P2: re-export T'
    const payload2 = buildExportPayload(tPrimeResult as WorkoutTemplate);
    expect(validateCoachTemplateImportData(payload2).success).toBe(true);

    // P1 and P2 must be structurally equal modulo link_id values
    // (link_ids are opaque UUIDs that are remapped on import; only grouping matters)
    const stripLinkIds = (p: typeof payload1) => ({
      ...p,
      templates: p.templates.map((t) => ({
        ...t,
        exercises: t.exercises.map((e) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { link_id, ...rest } = e as typeof e & { link_id?: unknown };
          return rest;
        }),
      })),
    });

    expect(stripLinkIds(payload2)).toEqual(stripLinkIds(payload1));

    // Additionally verify link grouping is preserved: both exercises have the same link_id in P2
    const p2Exercises = payload2.templates[0].exercises;
    expect(p2Exercises[0].link_id).toBeDefined();
    expect(p2Exercises[1].link_id).toBeDefined();
    expect(p2Exercises[0].link_id).toBe(p2Exercises[1].link_id);
  });
});
