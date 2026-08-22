import { test, expect, type Page } from "@playwright/test";
import { navigateTo, skipOnboarding, enablePerWorkerDb } from "../helpers";

const MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
const VALID_TEST_KEY = `sk-or-v1-${"a".repeat(64)}`;
const CATALOG = {
  data: [
    { id: MODEL, name: "Nemotron test model", context_length: 32768, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
    ...Array.from({ length: 30 }, (_, index) => ({
      id: `test/model-${String(index + 1).padStart(2, "0")}`,
      name: `Scrollable model ${String(index + 1).padStart(2, "0")}`,
      context_length: 32768,
      pricing: { prompt: "0", completion: "0" },
      supported_parameters: ["tools"],
    })),
  ],
};

async function mockCatalog(page: Page) {
  await page.route("**openrouter.ai/api/v1/models", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(CATALOG) }));
  await page.route("**openrouter.ai/api/v1/key", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: {} }) }));
}

async function openCoach(page: Page, testInfo: { parallelIndex: number }) {
  await enablePerWorkerDb(page, testInfo.parallelIndex);
  // Deterministic tier always starts without credentials, even when a local
  // browser profile was used for a preceding live run.
  await page.addInitScript(() => {
    if (localStorage.getItem("cablesnap.e2e.live-key") !== "1") {
      sessionStorage.removeItem("cablesnap.secure-store.openrouter_api_key");
    }
  });
  await mockCatalog(page);
  await skipOnboarding(page);
  await navigateTo(page, "/ai-coach");
  await expect(page.getByRole("button", { name: "Select AI Model" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel(/chat\.\.\.|AI Coach anything|model above/)).toBeVisible({ timeout: 10_000 });
  const update = page.getByText("Skip this version", { exact: true });
  if (await update.isVisible().catch(() => false)) await update.click({ force: true });
}

async function seedKeyThroughSettings(page: Page) {
  // key-vault.ts uses this exact namespaced sessionStorage key on web. The real
  // live key is read only from the environment and is never written to disk.
  await page.evaluate((key) => {
    localStorage.setItem("cablesnap.e2e.live-key", "1");
    sessionStorage.setItem("cablesnap.secure-store.openrouter_api_key", key);
  }, process.env.OPENROUTER_TEST_API_KEY ?? VALID_TEST_KEY);
  await page.reload();
  await expect(page.getByRole("button", { name: "Select AI Model" })).toBeVisible({ timeout: 20_000 });
}

function composer(page: Page) {
  return page.locator("textarea").last();
}

function sse(text: string, done = true) {
  return [
    `data: ${JSON.stringify({ id: "chatcmpl-e2e", choices: [{ delta: { content: text } }] })}\n\n`,
    ...(done ? [`data: ${JSON.stringify({ choices: [{ finish_reason: "stop" }] })}\n\n`, "data: [DONE]\n\n"] : []),
  ].join("");
}

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
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
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
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
    await expect(page.getByTestId(`model-row-${MODEL}`)).toBeAttached({ timeout: 20_000 });
    await expect(page.getByText("Nemotron test model", { exact: true })).toBeVisible();
  });

  test("scrolls the model catalog and selects an offscreen model", async ({ page }, testInfo) => {
    await openCoach(page, testInfo);
    await seedKeyThroughSettings(page);
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
    const lastModel = page.getByTestId("model-row-test/model-30");
    await lastModel.scrollIntoViewIfNeeded();
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
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
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
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
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
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
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
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
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
    await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
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

  for (const [status, expected] of [[401, "That OpenRouter key was rejected"], [429, "OpenRouter rate limit reached"], [502, "OpenRouter encountered a server error"]] as const) {
    test(`shows the translated provider error for HTTP ${status}`, async ({ page }, testInfo) => {
      await openCoach(page, testInfo);
      await seedKeyThroughSettings(page);
      await page.goto("/ai-coach");
      await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
      await expect(page.getByTestId(`model-row-${MODEL}`)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId(`model-row-${MODEL}`).dispatchEvent("click");
      await page.route("**openrouter.ai/api/v1/chat/completions", (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: { message: "synthetic provider error" } }) }));
      await composer(page).fill("trigger error");
      await page.getByRole("button", { name: "send message" }).dispatchEvent("click");
      await expect(page.getByText(new RegExp(expected))).toBeVisible({ timeout: 20_000 });
    });
  }

  test.describe("live (key-gated)", () => {
    test.skip(!process.env.OPENROUTER_TEST_API_KEY, "OPENROUTER_TEST_API_KEY is not set");
    test("sends a real prompt and persists the streamed answer across reload", async ({ page }, testInfo) => {
      await openCoach(page, testInfo);
      await seedKeyThroughSettings(page);
      await page.goto("/ai-coach");
      await page.getByRole("button", { name: "Select AI Model" }).click({ force: true });
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
