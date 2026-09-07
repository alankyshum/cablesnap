/* eslint-disable max-lines */
import { test, expect, type Page } from "@playwright/test";
import { navigateTo, skipOnboarding, enablePerWorkerDb, enableGymPhotoFixture, enableExerciseFixture, dismissUpdateDialog, clearGymPhotoConsent } from "../helpers";

const MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const VALID_TEST_KEY = `sk-or-v1-${"a".repeat(64)}`;
const CATALOG = {
  data: [
    { id: MODEL, name: "Nemotron test model", context_length: 32768, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"], architecture: { input_modalities: ["text"] } },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `test/model-${String(index + 1).padStart(2, "0")}`,
      name: `Scrollable model ${String(index + 1).padStart(2, "0")}`,
      context_length: 32768,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools"],
    })),
  ],
};

const CATALOG_WITH_SELECTED_MODEL_UNSUPPORTED = {
  data: CATALOG.data.map((model) => model.id === MODEL ? { ...model, supported_parameters: [] } : model),
};
async function mockCatalog(page: Page, response: { readonly status?: number; readonly body?: unknown } = {}) {
  await page.route("**openrouter.ai/api/v1/models", (route) => route.fulfill({
    status: response.status ?? 200,
    contentType: "application/json",
    body: JSON.stringify(response.body ?? CATALOG),
  }));
  await page.route("**openrouter.ai/api/v1/key", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) }));
}

async function openCoach(page: Page, testInfo: { parallelIndex: number }, catalogResponse?: { readonly status?: number; readonly body?: unknown }) {
  await enablePerWorkerDb(page, testInfo.parallelIndex);
  // Deterministic tier always starts without credentials, even when a local
  // browser profile was used for a preceding live run.
  await page.addInitScript(() => {
    if (localStorage.getItem("cablesnap.e2e.live-key") !== "1") {
      sessionStorage.removeItem("cablesnap.secure-store.openrouter_api_key");
    }
  });
  await mockCatalog(page, catalogResponse);
  await skipOnboarding(page);
  await navigateTo(page, "/ai-coach");
  await expect(page.getByRole("button", { name: "Select AI Model" }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/chat\.\.\.|AI Coach anything|model above/)).toBeVisible({ timeout: 10_000 });
  await dismissUpdateDialog(page);
}

const VISION_MODEL = "test/vision-tools";
const VISION_CATALOG = {
  data: [{ id: VISION_MODEL, name: "Synthetic vision tools", context_length: 32768, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"], architecture: { input_modalities: ["text", "image"] } }],
};

const GYM_EXERCISE = {
  id: "e2e-dumbbell-press", name: "E2E Dumbbell Press", category: "chest",
  primary_muscles: ["chest"], secondary_muscles: [], equipment: "dumbbell",
  instructions: "Press.", difficulty: "beginner", is_custom: false,
};

test("text/tool-only catalog model blocks gym-photo upload", async ({ page }, testInfo) => {
  await enableGymPhotoFixture(page);
  await enableExerciseFixture(page, [GYM_EXERCISE]);
  await enablePerWorkerDb(page, testInfo.parallelIndex);
  await page.addInitScript((key) => {
    localStorage.setItem("cablesnap.e2e.live-key", "1");
    sessionStorage.setItem("cablesnap.secure-store.openrouter_api_key", key);
  }, VALID_TEST_KEY);
  await page.route("**openrouter.ai/api/v1/models", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ id: "test/text-tools", name: "Text tools", supported_parameters: ["tools"], architecture: { input_modalities: ["text"] } }] }) }));
  await page.route("**openrouter.ai/api/v1/key", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) }));
  await skipOnboarding(page);
  await page.goto("/ai-coach");
   await expect(page.getByRole("button", { name: "Select AI Model" }).first()).toBeVisible({ timeout: 20_000 });
  await dismissUpdateDialog(page);
   await page.getByText("Select Model", { exact: true }).click();
  await expect(page.getByTestId("model-catalog-list")).toBeAttached({ timeout: 15_000 });
  await page.getByTestId("model-search-input").fill("text-tools", { force: true });
  await expect(page.getByTestId("model-row-test/text-tools")).toBeAttached({ timeout: 15_000 });
  await page.getByTestId("model-row-test/text-tools").click({ force: true });
  await expect(page.getByRole("button", { name: /Active Model: test\/text-tools/ })).toBeVisible();
  await page.getByRole("button", { name: "Choose a gym photo from your library" }).dispatchEvent("click");
  await expect(page.getByText(/cannot receive gym photos|image input and tools/i)).toBeVisible({ timeout: 15_000 });
});

test("mocked gym-photo selection sends one bounded image request and keeps media out of durable chat", async ({ page }, testInfo) => {
  await enableGymPhotoFixture(page);
  await enablePerWorkerDb(page, testInfo.parallelIndex);
  await page.addInitScript((key) => {
    localStorage.setItem("cablesnap.e2e.live-key", "1");
    sessionStorage.setItem("cablesnap.secure-store.openrouter_api_key", key);
  }, VALID_TEST_KEY);
  await page.route("**openrouter.ai/api/v1/models", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VISION_CATALOG) }));
  await page.route("**openrouter.ai/api/v1/key", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) }));
  await skipOnboarding(page);
  await page.goto("/ai-coach");
  await expect(page.getByRole("button", { name: "Select AI Model" }).first()).toBeVisible({ timeout: 20_000 });
  await dismissUpdateDialog(page);
  await clearGymPhotoConsent(page);
   await page.getByText("Select Model", { exact: true }).click();
   await page.getByTestId(`model-row-${VISION_MODEL}`).dispatchEvent("click");
   await expect(page.getByRole("button", { name: /Active Model: test\/vision-tools/ })).toBeVisible();
  const requestBodies: string[] = [];
  await page.route("**openrouter.ai/api/v1/chat/completions", async (route) => {
    requestBodies.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("Photo request accepted") });
  });
   await page.getByRole("button", { name: "Choose a gym photo from your library" }).dispatchEvent("click");
   await expect(page.getByText("Gym photo privacy", { exact: true })).toBeVisible({ timeout: 10_000 });
   await page.getByRole("button", { name: "I understand", exact: true }).click({ force: true });
   await expect(page.getByLabel("Selected gym photo ready to send", { exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
  await expect(page.getByText("Photo request accepted", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(requestBodies).toHaveLength(1);
  expect(requestBodies[0]).toContain("image");
  const request = JSON.parse(requestBodies[0]) as { messages?: Array<{ content?: Array<{ type?: string; image?: unknown; image_url?: unknown }> }> };
  const imagePart = request.messages?.at(-1)?.content?.find((part) => part.type === "image" || part.type === "image_url");
  expect(imagePart).toBeDefined();
  const userPayload = JSON.stringify(request.messages?.filter((message) => Array.isArray(message.content)));
  expect(userPayload).not.toMatch(/e2e:\/\/synthetic|file:\/\/|exif|location/i);
   await page.reload();
   await expect(page.getByTestId("GC_CONTENT").getByText("[Gym photo uploaded]", { exact: true })).toBeVisible({ timeout: 20_000 });
   await page.getByRole("button", { name: "Choose a gym photo from your library" }).dispatchEvent("click");
   await expect(page.getByText("Gym photo privacy", { exact: true })).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toMatch(/e2e:\/\/synthetic|file:\/\/|base64|exif|location/i);
});

test("gym photo follows the persisted structured draft, revision, restore, and explicit start flow", async ({ page }, testInfo) => {
  await enableGymPhotoFixture(page);
  await enableExerciseFixture(page, [GYM_EXERCISE]);
  await enablePerWorkerDb(page, testInfo.parallelIndex);
  await page.addInitScript((key) => {
    localStorage.setItem("cablesnap.e2e.live-key", "1");
    sessionStorage.setItem("cablesnap.secure-store.openrouter_api_key", key);
  }, VALID_TEST_KEY);
  await page.route("**openrouter.ai/api/v1/models", (route) => {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(VISION_CATALOG) });
  });
  await page.route("**openrouter.ai/api/v1/key", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) }));
  await skipOnboarding(page);
  await page.goto("/ai-coach");
   await expect(page.getByRole("button", { name: "Select AI Model" }).first()).toBeVisible({ timeout: 20_000 });
  await clearGymPhotoConsent(page);
  const update = page.getByText("Skip this version", { exact: true });
  if (await update.isVisible({ timeout: 5_000 }).catch(() => false)) await update.click({ force: true });

   await page.getByText("Select Model", { exact: true }).click();
  await expect(page.getByTestId("model-catalog-list")).toBeAttached({ timeout: 15_000 });
  await page.getByTestId("model-search-input").fill("vision-tools", { force: true });
  await expect(page.getByTestId(`model-row-${VISION_MODEL}`)).toBeAttached({ timeout: 15_000 });
  await page.getByTestId(`model-row-${VISION_MODEL}`).click({ force: true });
  await expect(page.getByRole("button", { name: /Active Model: test\/vision-tools/ })).toBeVisible();
    await page.getByRole("button", { name: "Choose a gym photo from your library" }).dispatchEvent("click");
    await expect(page.getByText("Gym photo privacy", { exact: true })).toBeVisible();
     await page.getByRole("button", { name: "Cancel", exact: true }).click({ force: true });
     await expect(page.getByLabel("Selected gym photo ready to send", { exact: true })).toHaveCount(0);
     await expect(page.getByText("Gym photo privacy", { exact: true })).toHaveCount(0);
     // Reload deliberately proves cancellation did not persist consent and avoids
     // depending on the composer hook's in-memory hydration timing.
     await page.reload();
     await expect(page.getByRole("button", { name: /Active Model: test\/vision-tools/ })).toBeVisible({ timeout: 20_000 });
     await page.getByRole("button", { name: "Choose a gym photo from your library" }).click({ force: true });
     await page.getByRole("button", { name: "I understand", exact: true }).click({ force: true });
     await expect(page.getByText("Gym photo privacy", { exact: true })).toHaveCount(0);
     await expect(page.getByLabel("Selected gym photo ready to send", { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/Gym photos are sent directly/i)).toBeVisible();

  const requests: string[] = [];
  let toolRound = 0;
   await page.route("**openrouter.ai/api/v1/chat/completions", async (route) => {
    const body = route.request().postData() ?? "";
    requests.push(body);
    const parsed = JSON.parse(body) as { messages?: unknown[] };
    console.log(`[gym-e2e] round=${toolRound} roles=${JSON.stringify((parsed.messages ?? []).map((m) => typeof m === "object" && m !== null ? (m as { role?: string }).role : null))}`);
    if (toolRound === 0) {
      toolRound += 1;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: toolCallSse("detect-1", "detect_gym_equipment", { equipment: [{ label: "dumbbell", confidence: 0.94 }] }) });
      return;
    }
    if (toolRound === 1) {
      toolRound += 1;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: toolCallSse("create-1", "create_gym_workout_draft", { equipment: [{ label: "dumbbell", confidence: 0.94 }] }) });
      return;
    }
    const messages = parsed.messages as Array<{ role?: string; content?: unknown }>;
    const lastUser = [...messages].reverse().find((message) => message.role === "user");
    const currentPrompt = typeof lastUser?.content === "string" ? lastUser.content : JSON.stringify(lastUser?.content ?? "");
    const draftId = JSON.stringify(messages).match(/draftId[^a-zA-Z0-9]+([a-zA-Z0-9-]+)/)?.[1] ?? "";
    if (currentPrompt.includes("Make it a 30 minute plan")) {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: toolCallSse("modify-1", "modify_gym_workout_draft", { draftId, expectedRevision: 1, change: { kind: "time_cap", minutes: 30 } }) });
      return;
    }
    if (/restore/i.test(currentPrompt)) {
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: toolCallSse("restore-1", "restore_gym_workout_revision", { draftId, version: 1, expectedRevision: 2 }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("Saved draft.") });
  });
  await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
  await expect(page.getByTestId("coach-workout-draft-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("dumbbell", { exact: true })).toBeVisible();
  await expect(page.getByText(/Saved · revision 1/)).toBeVisible();
  await expect(page.getByText(/Why this plan|Reasons|duration/i).first()).toBeVisible();
  expect(page.url()).toMatch(/ai-coach/);
  expect(requests.length).toBeGreaterThanOrEqual(1);
  expect(requests[0]).toContain("image_url");
  const firstRequest = JSON.parse(requests[0]) as { messages?: unknown[] };
  expect(JSON.stringify(firstRequest.messages?.filter((message) => typeof message === "object" && message !== null && "content" in message && Array.isArray((message as { content?: unknown }).content))))
    .not.toMatch(/e2e:\/\/synthetic|file:\/\/|location/i);

  // Chat modification must append a durable revision without navigating.
  const beforeModify = page.url();
  await composer(page).fill("Make it a 30 minute plan", { force: true });
  await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
  await expect(page.getByText(/Saved · revision 2/)).toBeVisible({ timeout: 30_000 });
  expect(page.url()).toBe(beforeModify);
  await page.reload();
  await expect(page.getByText(/Saved · revision 2/)).toBeVisible({ timeout: 30_000 });

  // History restore appends a new latest revision rather than replacing rows.
  await page.getByRole("button", { name: "Open workout revision history" }).click({ force: true });
  await expect(page.getByText(/Revision 1/i)).toBeVisible();
  const restore = page.getByRole("button", { name: /Restore revision 1/i });
  if (await restore.count()) await restore.dispatchEvent("click");
  else await page.getByText(/Restore/i).first().dispatchEvent("click");
  await expect(page.getByText("Saved · revision 3", { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(page.url()).toBe(beforeModify);

  // Two rapid card presses create one session and one navigation.
  let sessionNavigations = 0;
  page.on("framenavigated", (frame) => { if (frame.url().includes("/session/")) sessionNavigations += 1; });
  const start = page.getByTestId("coach-workout-draft-start");
  await Promise.all([start.dispatchEvent("click"), start.dispatchEvent("click")]);
  await expect(page).toHaveURL(/\/session\/[^/]+/, { timeout: 30_000 });
  expect(sessionNavigations).toBe(1);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  const sessionState = await page.evaluate(async () => {
    const db = (globalThis as typeof globalThis & { __cablesnap_db?: { getAllAsync<T>(sql: string): Promise<T[]> } }).__cablesnap_db;
    const rows = await db?.getAllAsync<{ id: string; set_count: number }>("SELECT id, (SELECT COUNT(*) FROM workout_sets WHERE session_id = workout_sessions.id) AS set_count FROM workout_sessions WHERE kind = 'workout' AND completed_at IS NULL");
    return rows ?? [];
  });
  expect(sessionState).toHaveLength(1);
  expect(sessionState[0].id).toBe(sessionId);
  expect(sessionState[0].set_count).toBeGreaterThan(0);
});

async function seedKeyThroughSettings(page: Page) {
  // key-vault.ts uses this exact namespaced sessionStorage key on web. The real
  // live key is read only from the environment and is never written to disk.
  await page.evaluate((key) => {
    localStorage.setItem("cablesnap.e2e.live-key", "1");
    sessionStorage.setItem("cablesnap.secure-store.openrouter_api_key", key);
  }, process.env.OPENROUTER_TEST_API_KEY ?? VALID_TEST_KEY);
  await page.reload();
  await expect(page.getByRole("button", { name: "Select AI Model" }).first()).toBeVisible({ timeout: 20_000 });
}

function composer(page: Page) {
  return page.locator("textarea").last();
}

function sse(text: string, done = true) {
  const base = { id: "chatcmpl-e2e", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: VISION_MODEL };
  return [
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }] })}\n\n`,
    ...(done ? [`data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`, "data: [DONE]\n\n"] : []),
  ].join("");
}

function toolCallSse(callId: string, name: string, args: unknown) {
  const base = { id: "chatcmpl-gym-e2e", object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: VISION_MODEL };
  return [
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: callId, type: "function", function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
    "data: [DONE]\n\n",
  ].join("");
}

function parseRgb(colorStr: string): [number, number, number] {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function calcLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function getContrast(fgStr: string, bgStr: string): number {
  const [r1, g1, b1] = parseRgb(fgStr);
  const [r2, g2, b2] = parseRgb(bgStr);
  const l1 = calcLuminance(r1, g1, b1);
  const l2 = calcLuminance(r2, g2, b2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// The scenario suite intentionally keeps related Coach regression flows together.
// eslint-disable-next-line max-lines-per-function
test.describe("@scenario ai-coach", () => {
  test("renders the chat surface, missing-key affordance, and has no page errors", async ({ page }, testInfo) => {
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    await openCoach(page, testInfo);
    await expect(page.getByText("API Key Required", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Add OpenRouter API Key", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "send message" })).toBeDisabled();
    expect(errors).toEqual([]);
    expect(consoleErrors.filter((message) => !message.includes("Failed to load resource"))).toEqual([]);
  });

  test("composer only enables send for non-empty input", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
    await expect(page.getByLabel("Ask your AI Coach anything...")).toBeEditable({ timeout: 10_000 });
    const input = composer(page);
    await expect(input).toBeVisible();
    await expect(page.getByRole("button", { name: "send message" })).toBeDisabled();
    await input.fill("hello");
    await expect(page.getByRole("button", { name: "send message" })).toBeEnabled();
  });

  test("opens the model picker and lists the catalog", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await expect(page.getByTestId(`model-row-${MODEL}`)).toBeAttached({ timeout: 20_000 });
    await expect(page.getByText("Nemotron test model", { exact: true })).toBeVisible();
  });

  test("scrolls the model catalog and selects an offscreen model", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    const catalog = page.getByTestId("model-catalog-list");
    const lastModel = page.getByTestId("model-row-test/model-30");
    for (let attempt = 0; attempt < 10 && !(await lastModel.isVisible()); attempt += 1) {
      await catalog.evaluate((element) => {
        element.scrollBy({ top: element.clientHeight });
      });
      await page.waitForTimeout(100);
    }
    await expect(lastModel).toBeVisible();
    await lastModel.dispatchEvent("click");
    await expect(page.getByRole("button", { name: /Active Model: test\/model-30/ })).toBeVisible();
    await expect(page.getByLabel("Bottom sheet backdrop")).toBeHidden({ timeout: 10_000 });
  });

  test("phone sidebar opens and closes", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Sheet behavior is phone-only");
    await openCoach(page, testInfo);
    const toggle = page.getByRole("button", { name: "Toggle sessions sidebar" });
    await toggle.dispatchEvent("click");
    await expect(page.getByText("No conversations yet", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByLabel("Close sheet").click({ force: true }).catch(() => page.keyboard.press("Escape"));
    await expect(page.getByText("No conversations yet", { exact: true })).toBeHidden({ timeout: 10_000 });
  });

  test("tablet sidebar collapse rail expands again", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "Rail behavior is tablet-only");
    await openCoach(page, testInfo);
    await expect(page.getByRole("button", { name: "Collapse sessions sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse sessions sidebar" }).click();
    await expect(page.getByRole("button", { name: "Expand sessions sidebar" })).toBeVisible();
    await page.getByRole("button", { name: "Expand sessions sidebar" }).click();
    await expect(page.getByRole("button", { name: "Collapse sessions sidebar" })).toBeVisible();
  });

  test("persists two streamed conversations and switches between sessions", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "One browser viewport is sufficient for persistence flow");
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
    await page.route("**openrouter.ai/api/v1/chat/completions", async (route) => {
      const requestText = route.request().postData() ?? "";
      const reply = requestText.includes("second session prompt") ? "second streamed answer" : "first streamed answer";
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(reply) });
    });

    await composer(page).fill("first session prompt");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByText("first streamed answer", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Toggle sessions sidebar" }).dispatchEvent("click");
    await expect(page.getByText("New Chat", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText("New Chat", { exact: true }).dispatchEvent("click");

    await composer(page).fill("second session prompt");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByText("second streamed answer", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Toggle sessions sidebar" }).dispatchEvent("click");
    await page.getByRole("button", { name: "Session: first session prompt" }).dispatchEvent("click");
    await expect(page.getByText("first streamed answer", { exact: true })).toBeVisible();
    await expect(page.getByText("second streamed answer", { exact: true })).toHaveCount(0);
  });

  test("renders deterministic streamed markdown without exposing source markers", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.goto("/ai-coach");
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await expect(page.getByTestId(`model-row-${MODEL}`)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
    const markdown = [
      "# Training review",
      "",
      "**Strong week** with *controlled effort*.",
      "",
      "- Keep one easy day",
      "1. Add load gradually",
      "",
      "Use `RPE 7` for the first set.",
      "",
      "```text",
      "rest: 90s",
      "```",
      "",
      "[Recovery guide](https://example.com/recovery)",
    ].join("\n");
    await page.route("**openrouter.ai/api/v1/chat/completions", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(markdown) }));
    await composer(page).fill("Tell me something");
    // The model picker sheet's close animation can leave its backdrop mounted for
    // a frame on web; dispatch directly so this assertion stays about chat text.
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByText("Training review", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Strong week", { exact: true })).toBeVisible();
    await expect(page.getByText("controlled effort", { exact: true })).toBeVisible();
    await expect(page.getByText("Keep one easy day", { exact: true })).toBeVisible();
    await expect(page.getByText("1.", { exact: true })).toBeVisible();
    await expect(page.getByText("RPE 7", { exact: true })).toBeVisible();
    await expect(page.getByText("rest: 90s", { exact: true })).toBeVisible();
    await expect(page.getByText("Recovery guide", { exact: true })).toBeVisible();
    await expect(page.getByText("**Strong week**", { exact: true })).toHaveCount(0);
  });

  test("Stop aborts a pending stream without persisting an assistant bubble", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.goto("/ai-coach");
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await expect(page.getByTestId(`model-row-${MODEL}`)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**openrouter.ai/api/v1/chat/completions", async (route) => {
      await held;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("orphan") });
    });
    await composer(page).fill("stop this");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Stop generating" }).dispatchEvent("click");
    release();
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeHidden();
    await expect(page.getByText("orphan", { exact: true })).toHaveCount(0);
  });

  test("changing models mid-stream preserves the original turn", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "One browser viewport is sufficient for stream ownership");
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let requestedModel = "";
    await page.route("**openrouter.ai/api/v1/chat/completions", async (route) => {
      requestedModel = JSON.parse(route.request().postData() ?? "{}").model ?? "";
      await held;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("original model answer") });
    });

    await composer(page).fill("keep this turn on the original model");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: new RegExp(`Active Model: ${MODEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).dispatchEvent("click");
    await page.getByTestId("model-row-test/model-01").dispatchEvent("click");
    await expect(page.getByRole("button", { name: /Active Model: test\/model-01/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible();
    release();
    await expect(page.getByText("original model answer", { exact: true })).toBeVisible({ timeout: 20_000 });
    expect(requestedModel).toBe(MODEL);
  });

  test("switching sessions mid-stream aborts and removes the orphan bubble", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "One browser viewport is sufficient for stream ownership");
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
    await page.route("**openrouter.ai/api/v1/chat/completions", (route) => route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: sse("first session complete"),
    }));
    await composer(page).fill("first owner session");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByText("first session complete", { exact: true })).toBeVisible({ timeout: 20_000 });
    await page.unroute("**openrouter.ai/api/v1/chat/completions");
    await page.getByRole("button", { name: "Toggle sessions sidebar" }).dispatchEvent("click");
    await page.getByText("New Chat", { exact: true }).dispatchEvent("click");

    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**openrouter.ai/api/v1/chat/completions", async (route) => {
      await held;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("orphan session answer") });
    });
    await composer(page).fill("second pending session");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Toggle sessions sidebar" }).dispatchEvent("click");
    await page.getByRole("button", { name: "Session: first owner session" }).dispatchEvent("click");
    await expect(page.getByRole("button", { name: "Stop generating" })).toBeHidden();
    release();
    await expect(page.getByText("first session complete", { exact: true })).toBeVisible();
    await expect(page.getByText("orphan session answer", { exact: true })).toHaveCount(0);
  });

  for (const [status, body, expected, recovery] of [
    [401, { error: { message: "synthetic invalid key" } }, "That OpenRouter key was rejected", "Check key"],
    [429, { error: { message: "synthetic rate limit" } }, "OpenRouter rate limit reached", "Retry later"],
    // This deliberately remains untyped: status-only 5xx responses are server errors,
    // not provider-unavailable responses.
    [502, { error: { message: "synthetic untyped server error" } }, "OpenRouter encountered a server error", "Retry"],
    [429, { error: { code: 429, message: "synthetic shared pool", metadata: { limit_source: "upstream_provider_shared_pool", provider_name: "Chutes" } } }, "The selected model's upstream provider is unavailable.", "Open model picker"],
    [502, { error: { code: 502, message: "synthetic unavailable provider", metadata: { error_type: "provider_unavailable", provider_name: "Chutes" } } }, "The selected model's upstream provider is unavailable.", "Open model picker"],
    [503, { error: { code: 503, message: "synthetic overloaded provider", metadata: { error_type: "provider_overloaded", provider_name: "Chutes" } } }, "The selected model's upstream provider is unavailable.", "Open model picker"],
  ] as const) {
    test(`renders HTTP ${status} ${body.error.metadata?.error_type ?? body.error.metadata?.limit_source ?? (expected === "OpenRouter encountered a server error" ? "untyped server error" : "typed error")} with recovery`, async ({ page }, testInfo) => {
      await openCoach(page, testInfo);
      await seedKeyThroughSettings(page);
      await page.goto("/ai-coach");
      await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
      await expect(page.getByTestId(`model-row-${MODEL}`)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
      await page.route("**openrouter.ai/api/v1/chat/completions", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }));
      await composer(page).fill("trigger error");
      await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
      await expect(page.getByText(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))).toBeVisible({ timeout: 20_000 });
      // Button's RN-web primitive exposes the recovery action through its
      // accessibility label (rather than a native button role in every
      // viewport), so assert the actual labelled control.
      await expect(page.getByLabel(recovery, { exact: true })).toBeVisible();
    });
  }

  test("renders catalog-unavailable copy and refresh-catalog recovery", async ({ page }, testInfo) => {
    await openCoach(page, testInfo, { status: 500, body: {} });
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await expect(page.getByText("The model catalog is unavailable, so no model can be selected safely.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Refresh catalog", { exact: true })).toBeVisible();
  });

  // This single end-to-end flow intentionally covers all reported visual regressions.
  // eslint-disable-next-line max-lines-per-function
  test("dark mode assistant and user bubbles meet WCAG AA contrast (≥ 4.5:1), table is contained, avatar adjacent with 8px gap", async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");

    const complexMarkdown = [
      "# High Performance Plan",
      "",
      "This is regular assistant paragraph text that must remain legible.",
      "",
      "**Important Focus**: Prioritize recovery between heavy sets.",
      "",
      "*Controlled tempo* on every eccentric phase.",
      "",
      "- Bullet one with key details",
      "- Bullet two with additional notes",
      "1. First sequential milestone",
      "2. Second sequential milestone",
      "",
      "> Quality over quantity in every session.",
      "",
      "Use `RPE 8.5` for working sets.",
      "",
      "```typescript",
      "const sets = 4;\nconst reps = 8;",
      "```",
      "",
      "| Exercise | Sets | Reps | Load | Notes |",
      "| :--- | :---: | :---: | :---: | :--- |",
      "| Barbell Back Squat | 4 | 8 | 225 lbs | Solid depth, 3 min rest |",
      "| Romanian Deadlift | 3 | 10 | 185 lbs | Hamstring focus |",
      "",
      "[Official Training Guide](https://example.com/training)",
    ].join("\n");

    await page.route("**openrouter.ai/api/v1/chat/completions", (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(complexMarkdown) })
    );

    await composer(page).fill("What is my plan?");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");

    await expect(page.getByText("High Performance Plan", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("This is regular assistant paragraph text that must remain legible.", { exact: true })).toBeVisible();
    await expect(page.getByText("Barbell Back Squat", { exact: true })).toBeVisible();

    // 1. Contrast checks on dark assistant message
    const getElColors = async (text: string | RegExp) => {
      const el = page.getByText(text).first();
      return el.evaluate((node) => {
        let curr: HTMLElement | null = node as HTMLElement;
        let bg = "transparent";
        while (curr) {
          const style = window.getComputedStyle(curr);
          if (style.backgroundColor && style.backgroundColor !== "transparent" && style.backgroundColor !== "rgba(0, 0, 0, 0)") {
            bg = style.backgroundColor;
            break;
          }
          curr = curr.parentElement;
        }
        const color = window.getComputedStyle(node as HTMLElement).color;
        return { color, bg };
      });
    };

    const paragraphColors = await getElColors("This is regular assistant paragraph text that must remain legible.");
    const pContrast = getContrast(paragraphColors.color, paragraphColors.bg);
    console.log(`[DARK CONTRAST] Assistant paragraph: ${pContrast.toFixed(2)}:1 (fg: ${paragraphColors.color}, bg: ${paragraphColors.bg})`);
    expect(pContrast).toBeGreaterThanOrEqual(4.5);

    const listColors = await getElColors("Bullet one with key details");
    const listContrast = getContrast(listColors.color, listColors.bg);
    console.log(`[DARK CONTRAST] Assistant list: ${listContrast.toFixed(2)}:1 (fg: ${listColors.color}, bg: ${listColors.bg})`);
    expect(listContrast).toBeGreaterThanOrEqual(4.5);

    const headerCellColors = await getElColors("Exercise");
    const thContrast = getContrast(headerCellColors.color, headerCellColors.bg);
    console.log(`[DARK CONTRAST] Assistant table header: ${thContrast.toFixed(2)}:1 (fg: ${headerCellColors.color}, bg: ${headerCellColors.bg})`);
    expect(thContrast).toBeGreaterThanOrEqual(4.5);

    const bodyCellColors = await getElColors("Barbell Back Squat");
    const tdContrast = getContrast(bodyCellColors.color, bodyCellColors.bg);
    console.log(`[DARK CONTRAST] Assistant table body: ${tdContrast.toFixed(2)}:1 (fg: ${bodyCellColors.color}, bg: ${bodyCellColors.bg})`);
    expect(tdContrast).toBeGreaterThanOrEqual(4.5);

    const codeColors = await getElColors(/const sets = 4;/);
    const codeContrast = getContrast(codeColors.color, codeColors.bg);
    console.log(`[DARK CONTRAST] Assistant code block: ${codeContrast.toFixed(2)}:1 (fg: ${codeColors.color}, bg: ${codeColors.bg})`);
    expect(codeContrast).toBeGreaterThanOrEqual(4.5);

    const inlineCodeColors = await getElColors("RPE 8.5");
    const inlineCodeContrast = getContrast(inlineCodeColors.color, inlineCodeColors.bg);
    console.log(`[DARK CONTRAST] Assistant inline code: ${inlineCodeContrast.toFixed(2)}:1 (fg: ${inlineCodeColors.color}, bg: ${inlineCodeColors.bg})`);
    expect(inlineCodeContrast).toBeGreaterThanOrEqual(4.5);

    const linkColors = await getElColors("Official Training Guide");
    const linkContrast = getContrast(linkColors.color, linkColors.bg);
    console.log(`[DARK CONTRAST] Assistant link: ${linkContrast.toFixed(2)}:1 (fg: ${linkColors.color}, bg: ${linkColors.bg})`);
    expect(linkContrast).toBeGreaterThanOrEqual(4.5);

    // 2. Table Containment Check
    const tableContainer = page.getByTestId("coach-markdown-table-container").first();
    await expect(tableContainer).toBeVisible();

    const containment = await tableContainer.evaluate((tableNode) => {
      let curr = tableNode.parentElement;
      let bubble: HTMLElement | null = null;
      while (curr) {
        const style = window.getComputedStyle(curr);
        if (style.borderRadius && parseInt(style.borderRadius, 10) >= 12) {
          bubble = curr;
          break;
        }
        curr = curr.parentElement;
      }
      const tRect = tableNode.getBoundingClientRect();
      const bRect = (bubble ?? tableNode.parentElement!).getBoundingClientRect();
      
      const scrollEl = tableNode.querySelector("[data-testid='coach-markdown-table-scroll']") as HTMLElement | null;
      const scrollWidth = scrollEl ? scrollEl.scrollWidth : tableNode.scrollWidth;
      const clientWidth = scrollEl ? scrollEl.clientWidth : tableNode.clientWidth;

      return {
        tableLeft: tRect.left,
        tableRight: tRect.right,
        tableWidth: tRect.width,
        bubbleLeft: bRect.left,
        bubbleRight: bRect.right,
        bubbleWidth: bRect.width,
        isScrollable: scrollWidth > clientWidth,
        scrollWidth,
        clientWidth,
      };
    });

    console.log(`[TABLE CONTAINMENT] table: [${containment.tableLeft}, ${containment.tableRight}] (width: ${containment.tableWidth}px), bubble: [${containment.bubbleLeft}, ${containment.bubbleRight}] (width: ${containment.bubbleWidth}px), scrollWidth: ${containment.scrollWidth}px, clientWidth: ${containment.clientWidth}px`);
    expect(containment.tableLeft).toBeGreaterThanOrEqual(containment.bubbleLeft - 2);
    expect(containment.tableRight).toBeLessThanOrEqual(containment.bubbleRight + 2);
    expect(containment.isScrollable).toBe(true);

    // 3. Avatar Alignment & Gap
    const avatar = page.getByLabel("AI Coach", { exact: true }).first();
    await expect(avatar).toBeVisible();
    const avatarBox = await avatar.boundingBox();
    const bubbleBox = await tableContainer.evaluate((node) => {
      let curr = node.parentElement;
      while (curr) {
        const style = window.getComputedStyle(curr);
        if (style.borderRadius && parseInt(style.borderRadius, 10) >= 12) {
          const rect = curr.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        }
        curr = curr.parentElement;
      }
      const rect = node.parentElement!.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });

    if (avatarBox && bubbleBox) {
      const horizontalGap = bubbleBox.x - (avatarBox.x + avatarBox.width);
      const verticalOffset = Math.abs(avatarBox.y - bubbleBox.y);
      console.log(`[AVATAR] horizontal gap: ${horizontalGap}px (target: 8px), vertical offset: ${verticalOffset}px`);
      // Gap between avatar right edge and bubble left edge should be ~8px
      expect(Math.abs(horizontalGap - 8)).toBeLessThanOrEqual(4);
      // Avatar top should sit adjacent to the message top (within 24px)
      expect(verticalOffset).toBeLessThanOrEqual(24);
    }

    // 4. User Bubble Contrast Check
    const userTextColors = await getElColors("What is my plan?");
    const userContrast = getContrast(userTextColors.color, userTextColors.bg);
    console.log(`[DARK CONTRAST] User bubble text: ${userContrast.toFixed(2)}:1 (fg: ${userTextColors.color}, bg: ${userTextColors.bg})`);
    expect(userContrast).toBeGreaterThanOrEqual(4.5);
  });

  test("light mode assistant and user bubbles meet WCAG AA contrast (≥ 4.5:1)", async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");

    const lightMarkdown = [
      "# Training Overview",
      "",
      "Regular assistant summary text for light theme verification.",
      "",
      "- Focus on consistent recovery",
      "1. Follow the scheduled progression",
      "",
      "Use `RPE 8` for the top set.",
      "",
      "```typescript",
      "const sets = 3;\nconst reps = 10;",
      "```",
      "",
      "| Exercise | Sets | Reps |",
      "| :--- | :---: | :---: |",
      "| Overhead Press | 3 | 10 |",
      "",
      "[Detailed Guide](https://example.com/guide)",
    ].join("\n");

    await page.route("**openrouter.ai/api/v1/chat/completions", (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", body: sse(lightMarkdown) })
    );

    await composer(page).fill("How is my light mode plan?");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");

    await expect(page.getByText("Training Overview", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Regular assistant summary text for light theme verification.", { exact: true })).toBeVisible();

    const getElColors = async (text: string | RegExp) => {
      const el = page.getByText(text).first();
      return el.evaluate((node) => {
        let curr: HTMLElement | null = node as HTMLElement;
        let bg = "transparent";
        while (curr) {
          const style = window.getComputedStyle(curr);
          if (style.backgroundColor && style.backgroundColor !== "transparent" && style.backgroundColor !== "rgba(0, 0, 0, 0)") {
            bg = style.backgroundColor;
            break;
          }
          curr = curr.parentElement;
        }
        const color = window.getComputedStyle(node as HTMLElement).color;
        return { color, bg };
      });
    };

    const paragraphColors = await getElColors("Regular assistant summary text for light theme verification.");
    const pContrast = getContrast(paragraphColors.color, paragraphColors.bg);
    console.log(`[LIGHT CONTRAST] Assistant paragraph: ${pContrast.toFixed(2)}:1 (fg: ${paragraphColors.color}, bg: ${paragraphColors.bg})`);
    expect(pContrast).toBeGreaterThanOrEqual(4.5);

    const listColors = await getElColors("Focus on consistent recovery");
    const listContrast = getContrast(listColors.color, listColors.bg);
    console.log(`[LIGHT CONTRAST] Assistant list: ${listContrast.toFixed(2)}:1 (fg: ${listColors.color}, bg: ${listColors.bg})`);
    expect(listContrast).toBeGreaterThanOrEqual(4.5);

    const headerCellColors = await getElColors("Exercise");
    const thContrast = getContrast(headerCellColors.color, headerCellColors.bg);
    console.log(`[LIGHT CONTRAST] Assistant table header: ${thContrast.toFixed(2)}:1 (fg: ${headerCellColors.color}, bg: ${headerCellColors.bg})`);
    expect(thContrast).toBeGreaterThanOrEqual(4.5);

    const bodyCellColors = await getElColors("Overhead Press");
    const tdContrast = getContrast(bodyCellColors.color, bodyCellColors.bg);
    console.log(`[LIGHT CONTRAST] Assistant table body: ${tdContrast.toFixed(2)}:1 (fg: ${bodyCellColors.color}, bg: ${bodyCellColors.bg})`);
    expect(tdContrast).toBeGreaterThanOrEqual(4.5);

    const codeColors = await getElColors(/const sets = 3;/);
    const codeContrast = getContrast(codeColors.color, codeColors.bg);
    console.log(`[LIGHT CONTRAST] Assistant code block: ${codeContrast.toFixed(2)}:1 (fg: ${codeColors.color}, bg: ${codeColors.bg})`);
    expect(codeContrast).toBeGreaterThanOrEqual(4.5);

    const inlineCodeColors = await getElColors("RPE 8");
    const inlineCodeContrast = getContrast(inlineCodeColors.color, inlineCodeColors.bg);
    console.log(`[LIGHT CONTRAST] Assistant inline code: ${inlineCodeContrast.toFixed(2)}:1 (fg: ${inlineCodeColors.color}, bg: ${inlineCodeColors.bg})`);
    expect(inlineCodeContrast).toBeGreaterThanOrEqual(4.5);

    const linkColors = await getElColors("Detailed Guide");
    const linkContrast = getContrast(linkColors.color, linkColors.bg);
    console.log(`[LIGHT CONTRAST] Assistant link: ${linkContrast.toFixed(2)}:1 (fg: ${linkColors.color}, bg: ${linkColors.bg})`);
    expect(linkContrast).toBeGreaterThanOrEqual(4.5);

    const userTextColors = await getElColors("How is my light mode plan?");
    const userContrast = getContrast(userTextColors.color, userTextColors.bg);
    console.log(`[LIGHT CONTRAST] User bubble text: ${userContrast.toFixed(2)}:1 (fg: ${userTextColors.color}, bg: ${userTextColors.bg})`);
    expect(userContrast).toBeGreaterThanOrEqual(4.5);
  });

  for (const themeMode of ["dark", "light"] as const) {
    test(`header to conversation content gap is bounded (> 0 and <= 24px) in ${themeMode} mode`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: themeMode });
      await openCoach(page, testInfo);
      await seedKeyThroughSettings(page);
      await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
      await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");

      await page.route("**openrouter.ai/api/v1/chat/completions", (route) =>
        route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("First message for gap verification") })
      );

      await composer(page).fill("Hello Coach");
      await page.getByRole("button", { name: "send message" }).dispatchEvent("click");

      await expect(page.getByText("First message for gap verification", { exact: true })).toBeVisible({ timeout: 20_000 });

      // If on tablet, also test both expanded and collapsed sidebar states
      const isTablet = testInfo.project.name === "tablet";
      const collapseButton = page.getByRole("button", { name: "Collapse sessions sidebar" }).first();
      const expandButton = page.getByRole("button", { name: "Expand sessions sidebar" }).first();

      const verifyGap = async () => {
        const header = page.getByTestId("coach-header");
        await expect(header).toBeVisible();

        const modelChip = page.getByRole("button", { name: /Active Model|Select AI Model/ }).first();
        await expect(modelChip).toBeVisible();

        // The first message sent by the user inside the chat pane (avoid matching sidebar item on tablet/desktop)
        const userPrompt = page.getByText("Hello Coach").last();
        await expect(userPrompt).toBeVisible();

        // The day badge if rendered
        const todayBadge = page.getByText("Today", { exact: true });
        const hasToday = await todayBadge.isVisible().catch(() => false);

        const headerBox = await header.boundingBox();
        const modelChipBox = await modelChip.boundingBox();
        const userPromptBox = await userPrompt.boundingBox();
        const todayBox = hasToday ? await todayBadge.boundingBox() : null;

        // Verify model chip sits inside CoachHeader with standard token padding (8px spacing.sm)
        expect(modelChipBox?.y).toBeGreaterThanOrEqual(headerBox?.y ?? 0);
        expect((modelChipBox?.y ?? 0) - (headerBox?.y ?? 0)).toBeLessThanOrEqual(16);

        const headerBottom = (headerBox?.y ?? 0) + (headerBox?.height ?? 0);
        // The first content element in the conversation is either the Today badge or the first message
        const firstContentTop = todayBox ? todayBox.y : (userPromptBox?.y ?? 0);
        const gap = firstContentTop - headerBottom;

        console.log(`[GAP MEASUREMENT] ${testInfo.project.name} (${themeMode}): headerBottom=${headerBottom}px, firstContentTop=${firstContentTop}px, gap=${gap}px (hasToday=${hasToday})`);

        // Gap must be strictly positive (no occlusion) and <= 24px (standard design token spacing: spacing.base 16px or spacing.xl 24px)
        expect(gap).toBeGreaterThan(0);
        expect(gap).toBeLessThanOrEqual(24);
      };

      await verifyGap();

      if (isTablet && await collapseButton.isVisible()) {
        await collapseButton.dispatchEvent("click");
        await expect(expandButton).toBeVisible({ timeout: 10_000 });
        await verifyGap();
      }
    });
  }

  test("renders model-lacks-tools copy and pick-model recovery", async ({ page }, testInfo) => {
    // Select the model while it is tool-capable, then make its mocked catalog
    // entry incompatible. This exercises getModel's capability guard through
    // the real chat surface without making a live request.
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
    await expect(page.getByLabel(new RegExp(`Active Model: ${MODEL}`))).toBeVisible();
    await page.waitForTimeout(750);
    await page.unroute("**openrouter.ai/api/v1/models");
    await page.route("**openrouter.ai/api/v1/models", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(CATALOG_WITH_SELECTED_MODEL_UNSUPPORTED),
    }));
    await page.reload();
    await expect(page.getByLabel(new RegExp(`Active Model: ${MODEL}`))).toBeVisible({ timeout: 20_000 });
    await composer(page).fill("trigger unsupported model");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
    await expect(page.getByText("That model does not support the tools AI Coach needs.", { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("Pick another model", { exact: true })).toBeVisible();
  });

  test("regression: empty state is rendered upright and not vertically flipped or mirrored", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");

    const welcomeHeading = page.getByText("How can I help you today?", { exact: true });
    await expect(welcomeHeading).toBeVisible({ timeout: 10_000 });

    // Verify computed transform on the heading node and its parent containers
    const transformInfo = await welcomeHeading.evaluate((node) => {
      let curr: HTMLElement | null = node as HTMLElement;
      let effectiveScaleY = 1;
      while (curr && curr !== document.body) {
        const style = window.getComputedStyle(curr);
        const transform = style.transform;
        if (transform && transform !== "none") {
          // Parse 2D or 3D transform matrix
          const matrixMatch = transform.match(/^matrix\((.+)\)$/);
          if (matrixMatch) {
            const values = matrixMatch[1].split(",").map((v) => parseFloat(v.trim()));
            // In matrix(a, b, c, d, tx, ty), d is the scaleY factor
            if (values.length >= 4 && !isNaN(values[3])) {
              effectiveScaleY *= values[3];
            }
          }
        }
        curr = curr.parentElement;
      }
      return { effectiveScaleY };
    });

    expect(transformInfo.effectiveScaleY).toBeGreaterThan(0);
  });

  test("regression: error card has non-zero token-aligned padding and zero navbar overlap", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");

    // Route an empty response error
    await page.route("**openrouter.ai/api/v1/chat/completions", (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("", true) })
    );

    await composer(page).fill("trigger empty response error");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");

    const errorAlert = page.getByRole("alert");
    await expect(errorAlert).toBeVisible({ timeout: 20_000 });

    const errorMetrics = await errorAlert.evaluate((cardNode) => {
      const cardStyle = window.getComputedStyle(cardNode);
      const cardRect = cardNode.getBoundingClientRect();
      const button = cardNode.querySelector("div[role='button'], button, [class*='r-cursor-pointer']") as HTMLElement | null;
      const buttonStyle = button ? window.getComputedStyle(button) : null;
      const buttonRect = button ? button.getBoundingClientRect() : null;

      return {
        paddingTop: parseFloat(cardStyle.paddingTop) || 0,
        paddingBottom: parseFloat(cardStyle.paddingBottom) || 0,
        paddingLeft: parseFloat(cardStyle.paddingLeft) || 0,
        paddingRight: parseFloat(cardStyle.paddingRight) || 0,
        cardBottom: cardRect.bottom,
        buttonPaddingHorizontal: buttonStyle ? parseFloat(buttonStyle.paddingLeft) || 0 : 0,
        buttonHeight: buttonRect ? buttonRect.height : 0,
      };
    });

    // Card must have positive token-aligned padding (16px)
    expect(errorMetrics.paddingLeft).toBeGreaterThanOrEqual(12);
    expect(errorMetrics.paddingTop).toBeGreaterThanOrEqual(12);
    expect(errorMetrics.paddingLeft % 4).toBe(0);

    // Verify zero navbar overlap
    const tabNav = page.getByRole("tablist");
    if (await tabNav.isVisible()) {
      const navBox = await tabNav.boundingBox();
      if (navBox) {
        expect(errorMetrics.cardBottom).toBeLessThanOrEqual(navBox.y);
      }
    }
  });

  test("regression: tablet sidebar and conversation panel heights match with zero navbar overlap", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "tablet", "Tablet panel layout is tablet-only");
    await openCoach(page, testInfo);

    const header = page.getByTestId("coach-header");
    await expect(header).toBeVisible();

    const collapseButton = page.getByRole("button", { name: "Collapse sessions sidebar" });
    await expect(collapseButton).toBeVisible();

    // Verify collapse button is placed near the sidebar boundary (< 320px from screen left)
    const collapseBox = await collapseButton.boundingBox();
    expect(collapseBox).not.toBeNull();
    expect(collapseBox?.x).toBeLessThan(350);

    const tabNav = page.getByRole("tablist");
    await expect(tabNav).toBeVisible();
    const navBox = await tabNav.boundingBox();
    expect(navBox).not.toBeNull();

    // Verify sidebar and chat pane bounding box bottom edges terminate above tab bar
    const panels = await page.evaluate(() => {
      const sidebars = document.querySelectorAll("[class*='r-borderRightWidth-1'], [class*='r-width-1']");
      let sidebarEl: HTMLElement | null = null;
      for (const el of Array.from(sidebars)) {
        if (el.getBoundingClientRect().width > 200) {
          sidebarEl = el as HTMLElement;
          break;
        }
      }
      const chatCol = document.querySelector("[class*='r-maxWidth-3s8t3t'], [class*='r-maxWidth-']") as HTMLElement | null;
      return {
        sidebarBottom: sidebarEl ? sidebarEl.getBoundingClientRect().bottom : null,
        chatBottom: chatCol ? chatCol.getBoundingClientRect().bottom : null,
      };
    });

    if (panels.sidebarBottom && navBox) {
      expect(panels.sidebarBottom).toBeLessThanOrEqual(navBox.y + 4);
    }
  });

  test("regression: message text and date separators render chronologically and upright (not vertically flipped)", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");

    await page.route("**openrouter.ai/api/v1/chat/completions", (route) =>
      route.fulfill({ status: 200, contentType: "text/event-stream", body: sse("Chronological assistant response text") })
    );

    await composer(page).fill("Chronological user prompt text");
    await page.getByRole("button", { name: "send message" }).dispatchEvent("click");

    const assistantMsg = page.getByText("Chronological assistant response text", { exact: true });
    await expect(assistantMsg).toBeVisible({ timeout: 20_000 });

    const userMsg = page.getByText("Chronological user prompt text").last();
    await expect(userMsg).toBeVisible();

    // 1. Verify vertical orientation of both message texts (not scaleY: -1 or mirrored)
    for (const locator of [userMsg, assistantMsg]) {
      const scaleY = await locator.evaluate((node) => {
        let curr: HTMLElement | null = node as HTMLElement;
        let effectiveScale = 1;
        while (curr && curr !== document.body) {
          const style = window.getComputedStyle(curr);
          const transform = style.transform;
          if (transform && transform !== "none") {
            const matrixMatch = transform.match(/^matrix\((.+)\)$/);
            if (matrixMatch) {
              const values = matrixMatch[1].split(",").map((v) => parseFloat(v.trim()));
              if (values.length >= 4 && !isNaN(values[3])) {
                effectiveScale *= values[3];
              }
            }
          }
          curr = curr.parentElement;
        }
        return effectiveScale;
      });
      expect(scaleY).toBeGreaterThan(0);
    }

    // 2. Verify user prompt is visually ABOVE the assistant response (chronological top-to-bottom)
    const uBox = await userMsg.boundingBox();
    const aBox = await assistantMsg.boundingBox();
    expect(uBox).not.toBeNull();
    expect(aBox).not.toBeNull();
    expect(uBox!.y).toBeLessThan(aBox!.y);

    // 3. Verify composer, quick prompt chips, and message elements stay above FloatingTabBar
    const tabNav = page.getByRole("tablist");
    if (await tabNav.isVisible()) {
      const navBox = await tabNav.boundingBox();
      if (navBox) {
        const composerEl = composer(page);
        const compBox = await composerEl.boundingBox();
        if (compBox) {
          expect(compBox.y + compBox.height).toBeLessThanOrEqual(navBox.y + 4);
        }
      }
    }
  });

  test.describe("live (key-gated)", () => {
    test.skip(!process.env.OPENROUTER_TEST_API_KEY, "OPENROUTER_TEST_API_KEY is not set");
    test("sends a real prompt and persists the streamed answer across reload", async ({ page }, testInfo) => {
      await openCoach(page, testInfo);
      await seedKeyThroughSettings(page);
      await page.goto("/ai-coach");
      await page.getByRole("button", { name: "Select AI Model" }).first().click({ force: true });
      await expect(page.getByTestId(`model-row-${MODEL}`)).toBeVisible({ timeout: 20_000 });
      await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
      await composer(page).fill("Write four short markdown bullet points about recovery. Start the first bullet with sleep.");
      await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
      await expect(page.getByRole("button", { name: "Stop generating" })).toBeVisible({ timeout: 90_000 });
      const chatContent = page.getByTestId("GC_CONTENT");
      const initialFrame = await chatContent.innerText();
      await expect.poll(async () => chatContent.innerText(), { timeout: 90_000 })
        .not.toBe(initialFrame);
      const firstFrame = await chatContent.innerText();
      await expect.poll(async () => chatContent.innerText(), { timeout: 90_000 })
        .not.toBe(firstFrame);
      const laterFrame = await chatContent.innerText();
      expect(laterFrame.length).toBeGreaterThan(firstFrame.length);
      await expect(page.getByRole("button", { name: "Stop generating" })).toBeHidden({ timeout: 120_000 });
      const finalFrame = await chatContent.innerText();
      expect(finalFrame.length).toBeGreaterThan(firstFrame.length);
      await page.reload();
      await expect(page.getByText("Write four short markdown bullet points about recovery. Start the first bullet with sleep.", { exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/sleep/i).last()).toBeVisible({ timeout: 30_000 });
    });
  });
});
