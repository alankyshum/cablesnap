import { parseDraftToolCall } from "@/components/coach/CoachConversation";

const valid = {
  draftId: "draft-1", revision: 2,
  equipment: [{ label: "cable", confidence: 0.9 }],
  draft: { name: "Draft", exercises: [{ exercise_id: "ex-1", sets: 3, reps: 10, rest_seconds: 60 }] },
  reasons: [{ input: "history", rule: "bounded volume" }],
};
const result = (data: unknown) => JSON.stringify([{ name: "create_gym_workout_draft", output: { ok: true, operation: "create_draft", data } }]);

describe("persisted draft card validation", () => {
  it.each([
    ["non-array equipment", { ...valid, equipment: {} }],
    ["invalid equipment item", { ...valid, equipment: [{ label: "cable", confidence: 2 }] }],
    ["non-array exercises", { ...valid, draft: { ...valid.draft, exercises: {} } }],
    ["invalid exercise item", { ...valid, draft: { ...valid.draft, exercises: [{ exercise_id: "ex-1", sets: 0, reps: 10, rest_seconds: 60 }] } }],
    ["non-array reasons", { ...valid, reasons: {} }],
    ["invalid reason item", { ...valid, reasons: [{ input: 42, rule: "bad" }] }],
    ["legacy incomplete card", { draftId: "draft-1", revision: 1, equipment: [], draft: {}, reasons: [] }],
  ])("rejects %s as ordinary markdown", (_label, data) => {
    expect(parseDraftToolCall(result(data), "message-1")).toBeNull();
  });

  it("accepts only a complete structured result", () => {
    expect(parseDraftToolCall(result(valid), "message-1")).toMatchObject({ messageId: "message-1", draftId: "draft-1", revision: 2 });
  });

  it("accepts AI SDK JSON tool-result wrappers", () => {
    const wrapped = JSON.stringify([{ name: "create_gym_workout_draft", output: {
      type: "json",
      value: JSON.stringify({ ok: true, operation: "create_draft", data: valid }),
    } }]);
    expect(parseDraftToolCall(wrapped, "message-wrapped")).toMatchObject({ draftId: "draft-1", revision: 2 });
  });

  it("accepts the actual persisted direct output and object-valued replay wrapper", () => {
    const direct = JSON.stringify([{ toolCallId: "create-1", name: "create_gym_workout_draft", input: {}, output: { ok: true, operation: "create_draft", data: valid } }]);
    const wrapped = JSON.stringify([{ toolCallId: "create-1", toolName: "create_gym_workout_draft", input: {}, output: { type: "json", value: { ok: true, operation: "create_draft", data: valid } } }]);
    expect(parseDraftToolCall(direct, "message-direct")).toMatchObject({ draftId: "draft-1", revision: 2 });
    expect(parseDraftToolCall(wrapped, "message-object-wrapper")).toMatchObject({ draftId: "draft-1", revision: 2 });
  });

  it("keeps the latest valid card when a later operation fails", () => {
    const ledger = JSON.stringify([
      { toolCallId: "create-1", name: "create_gym_workout_draft", input: {}, output: { ok: true, operation: "create_draft", data: valid } },
      { toolCallId: "modify-1", name: "modify_gym_workout_draft", input: {}, output: { ok: false, error: { kind: "conflict" } } },
      { toolCallId: "restore-1", name: "restore_gym_workout_revision", input: {}, output: { ok: false, error: { kind: "conflict" } } },
    ]);
    expect(parseDraftToolCall(ledger, "message-latest-valid")).toMatchObject({ draftId: "draft-1", revision: 2 });
  });
});
