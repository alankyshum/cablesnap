import { sanitizeTemplateFilename, buildExportPayload, countUniqueCustomOrUnresolved, exportCoachTemplate } from "../../../lib/db/templates-export";
import type { WorkoutTemplate, TemplateExercise, Exercise } from "../../../lib/types";
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
jest.mock("../../../lib/db/templates", () => ({
  getTemplateById: (...args: unknown[]) => mockGetTemplateById(...args),
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

  it("canonical round-trip: export payload equals re-export of imported name", async () => {
    const tpl = makeTemplate();
    

    const payload1 = buildExportPayload(tpl);
    const validated = validateCoachTemplateImportData(payload1);
    expect(validated.success).toBe(true);
    if (!validated.success) return;

    // Simulate what importCoachTemplates normalizes: name is trimmed
    const importedName = validated.data.templates[0].name;
    const reimportedTpl = makeTemplate({ name: importedName });
    const payload2 = buildExportPayload(reimportedTpl);
    expect(payload2).toEqual(payload1);
  });
});
