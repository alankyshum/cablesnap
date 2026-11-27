// BLD-5100: deployed hardening AC2-AC4 and AC10, AC13, AC21 acceptance evidence.
import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { enablePerWorkerDb } from "../helpers";
import { AGENT_ACCESS_JSON_SCHEMA, AGENT_ACCESS_SKILL } from "../../shared/agent-access";

const execFileAsync = promisify(execFile);
const EVIDENCE = "/tmp/bld-5100-evidence/final";
const AGENT_NAME = "Agent POST Progression";
const PASTE_NAME = "Browse-only Paste Progression";
const UNKNOWN_NAME = "Unknown Exercise Progression";
const redact = (value: string) => value
  .replace(/([?&]token=)[^\s&]+/gi, "$1[REDACTED]")
  .replace(/(Bearer\s+)[A-Za-z0-9_-]+/g, "$1[REDACTED]");

async function prepare(page: Page, parallelIndex: number) {
  await enablePerWorkerDb(page, parallelIndex);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__SKIP_ONBOARDING__ = true;
  });
  await page.goto("/settings/agent-access");
  await expect(page.getByTestId("agent-access-start")).toBeVisible({ timeout: 30_000 });
  await page.waitForFunction(() => Boolean((globalThis as typeof globalThis & { __cablesnap_db?: unknown }).__cablesnap_db));
  await page.evaluate(async () => {
    const db = (globalThis as typeof globalThis & { __cablesnap_db?: {
      runAsync(sql: string, params?: unknown[]): Promise<unknown>;
    } }).__cablesnap_db;
    if (!db) throw new Error("E2E database unavailable");
    await db.runAsync("DELETE FROM workout_sets");
    await db.runAsync("DELETE FROM workout_sessions");
    const recentDays = [7, 35, 72];
    for (const [index, daysAgo] of recentDays.entries()) {
      const started = Date.now() - daysAgo * 86_400_000;
      const completed = started + 45 * 60_000;
      const sessionId = `agent-e2e-session-${index + 1}`;
      await db.runAsync("INSERT INTO workout_sessions (id, name, started_at, completed_at, duration_seconds, notes, rating) VALUES (?, ?, ?, ?, ?, '', 4)", [sessionId, ["Push A", "Pull A", "Legs A"][index], started, completed, 2700]);
      await db.runAsync("INSERT INTO workout_sets (id, session_id, exercise_id, set_number, weight, reps, completed, completed_at, exercise_position, set_type) VALUES (?, ?, 'voltra-001', 1, ?, 8, 1, ?, 0, 'normal')", [`agent-e2e-set-${index + 1}`, sessionId, 60 + index * 10, completed]);
    }
    const oldStarted = Date.now() - 120 * 86_400_000;
    await db.runAsync("INSERT INTO workout_sessions (id, name, started_at, completed_at, duration_seconds, notes, rating) VALUES ('agent-e2e-old', 'Outside Range', ?, ?, 1800, '', 3)", [oldStarted, oldStarted + 1800_000]);
  });
}

async function assertSeededSnapshot(page: Page, snapshotUrl: string) {
  const response = await page.request.get(snapshotUrl);
  expect(response.status()).toBe(200);
  const snapshot = await response.json();
  expect(snapshot.range.days).toBe(90);
  expect(snapshot.sessions).toHaveLength(3);
  expect(snapshot.personalRecords.length).toBeGreaterThan(0);
  expect(snapshot.templates.length).toBeGreaterThan(0);
  expect(snapshot.exerciseLibrary.length).toBeGreaterThan(0);
  expect(JSON.stringify(snapshot)).not.toMatch(/nutrition/i);
  await writeFile(path.join(EVIDENCE, "snapshot-shape.txt"), `sessions=3\npersonalRecords=${snapshot.personalRecords.length}\ntemplates=${snapshot.templates.length}\nexerciseLibrary=${snapshot.exerciseLibrary.length}\nrangeDays=90\nnutrition=absent\n`);
}

async function runRealAgent(prompt: string) {
  const transcriptPath = path.join(EVIDENCE, "real-agent-transcript-redacted.txt");
  const requested = `${prompt}\n\nAcceptance requirements: use curl with User-Agent CableSnapAgent/1.0 for every relay request (Cloudflare blocks Python's default User-Agent with 1010); do not use Python for HTTP. Name the POSTed proposal exactly "${AGENT_NAME}" so the UI evidence can distinguish it from the later pasted proposal.`;
  const result = await execFileAsync("/bin/sh", [
    "-c",
    'exec codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C /tmp "$1" </dev/null',
    "agent-access", requested,
  ], { timeout: 150_000, maxBuffer: 4 * 1024 * 1024 }).catch(async (error) => {
    const child = error as { stdout?: string; stderr?: string; message?: string };
    await writeFile(transcriptPath, redact(`${child.stdout ?? ""}\n${child.stderr ?? ""}\n${child.message ?? String(error)}`));
    throw error;
  });
  await writeFile(transcriptPath, redact(`${result.stdout}\n${result.stderr}`));
}

async function pasteProposal(page: Page, proposal: unknown) {
  await page.getByTestId("agent-paste-json").fill(`\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\``);
  await page.getByTestId("agent-validate-paste").click();
}

test.describe("BLD-5100 Agent access hardening", () => {
  test("BLD-5100 AC5-AC12 deployed relay negative matrix", async ({ page }, testInfo) => {
    void page;
    test.skip(testInfo.project.name !== "mobile", "Single deployed matrix run");
    test.setTimeout(120_000);
    await execFileAsync(process.execPath, ["--import", "tsx", "scripts/verify-agent-relay.ts"], {
      cwd: process.cwd(), env: { ...process.env, AGENT_RELAY_EVIDENCE: path.join(EVIDENCE, "live-negative-matrix.txt") },
      timeout: 110_000,
    });
  });

  test("BLD-5100 AC2-AC4, AC10, AC13, AC21 seeded real-agent and paste-back flows", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Single evidence capture on mobile viewport");
    test.setTimeout(300_000);
    await mkdir(EVIDENCE, { recursive: true });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const servedSchema = await page.request.get("https://cablesnap-agent-relay.alankyshum.workers.dev/v1/schema.json");
    const servedSkill = await page.request.get("https://cablesnap-agent-relay.alankyshum.workers.dev/v1/skill.md");
    expect(await servedSchema.json()).toEqual(AGENT_ACCESS_JSON_SCHEMA);
    expect(await servedSkill.text()).toBe(AGENT_ACCESS_SKILL);
    await prepare(page, testInfo.parallelIndex);
    await page.getByTestId("agent-access-days").fill("90");
    await page.getByTestId("agent-access-start").click();
    await expect(page.getByTestId("agent-access-active-session")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "01-agent-access-active.png") });

    await page.getByTestId("agent-access-copy-prompt").click();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    const snapshotUrl = prompt.match(/https:\/\/[^\s]+\/snapshot\?token=[^\s.]+/)?.[0];
    expect(prompt).toContain("/v1/skill.md");
    expect(prompt).toContain("/v1/schema.json");
    expect(snapshotUrl).toBeTruthy();
    await writeFile(path.join(EVIDENCE, "copied-prompt-redacted.txt"), redact(prompt));
    await assertSeededSnapshot(page, snapshotUrl!);
    await runRealAgent(prompt);

    const proposal = page.getByTestId("agent-proposal-card").filter({ has: page.getByTestId("agent-proposal-name").filter({ hasText: AGENT_NAME }) });
    await expect(proposal.getByTestId("agent-proposal-name")).toHaveText(AGENT_NAME, { timeout: 45_000 });
    await expect(proposal.getByTestId("agent-proposal-exercise").first()).not.toContainText("voltra-");
    await expect(proposal.getByTestId("agent-import-proposal")).toBeVisible();
    await proposal.screenshot({ path: path.join(EVIDENCE, "02-agent-post-review.png") });
    await proposal.getByTestId("agent-import-proposal").click();
    await expect(proposal.getByText("Imported", { exact: true })).toBeVisible({ timeout: 15_000 });

    const pasted = { schemaVersion: "1", kind: "template-proposal", template: { name: PASTE_NAME, exercises: Array.from({ length: 30 }, () => ({ exerciseId: "voltra-001", targetSets: 3, targetReps: "8-10", restSeconds: 90 })) } };
    await pasteProposal(page, pasted);
    const pastedCard = page.getByTestId("agent-proposal-card").filter({ hasText: PASTE_NAME });
    await expect(pastedCard.getByTestId("agent-proposal-name")).toHaveText(PASTE_NAME);
    await expect(pastedCard.getByText("Abdominal Crunches").first()).toBeVisible();
    await expect(pastedCard.getByTestId("agent-import-proposal")).toBeVisible();
    await pastedCard.screenshot({ path: path.join(EVIDENCE, "03-paste-json-review.png") });
    await pastedCard.getByTestId("agent-import-proposal").click();
    await expect(pastedCard.getByText("Imported", { exact: true })).toBeVisible();

    const unknown = { schemaVersion: "1", kind: "template-proposal", template: { name: UNKNOWN_NAME, exercises: [{ exerciseId: "missing-exercise-5100", targetSets: 3, targetReps: "8", restSeconds: 60 }] } };
    await pasteProposal(page, unknown);
    const unknownCard = page.getByTestId("agent-proposal-card").filter({ hasText: UNKNOWN_NAME });
    await expect(unknownCard.getByTestId("agent-proposal-library-warning")).toBeVisible();
    await expect(unknownCard.getByTestId("agent-import-proposal")).toHaveAttribute("aria-disabled", "true");
    await unknownCard.screenshot({ path: path.join(EVIDENCE, "04-unknown-exercise-blocked.png") });

    await page.goto("/");
    await page.getByText("Templates", { exact: true }).last().click();
    const agentRow = page.getByText(AGENT_NAME, { exact: true }).first();
    const pasteRow = page.getByText(PASTE_NAME, { exact: true }).first();
    await expect(agentRow).toBeVisible({ timeout: 30_000 });
    await expect(pasteRow).toBeVisible({ timeout: 30_000 });
    await pasteRow.scrollIntoViewIfNeeded();
    await expect(agentRow).toBeVisible();
    await expect(pasteRow).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCE, "05-both-templates-imported.png") });
    await writeFile(path.join(EVIDENCE, "imported-template-assertions.txt"), `Agent POST template visible: ${AGENT_NAME}\nPasted JSON template visible: ${PASTE_NAME}\nUnknown-ID proposal blocked: ${UNKNOWN_NAME}\n`);
  });
});
