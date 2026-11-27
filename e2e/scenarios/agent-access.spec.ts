// BLD-5100: slice-one deployed Worker + real app + real agent acceptance evidence.
import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const EVIDENCE = "/tmp/bld-5100-evidence/integration";

function redactTokens(value: string): string {
  return value.replace(/([?&]token=)[A-Za-z0-9_-]+/g, "$1<redacted>")
    .replace(/(Bearer\s+)[A-Za-z0-9_-]+/gi, "$1<redacted>");
}

test.describe("BLD-5100 Agent access slice one", () => {
  test("BLD-5100 AC2-AC4 real deployed relay, agent, review and import", async ({ page, context }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "Single evidence capture on mobile viewport");
    test.setTimeout(240_000);
    await mkdir(EVIDENCE, { recursive: true });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.addInitScript(() => { (window as unknown as Record<string, unknown>).__SKIP_ONBOARDING__ = true; });
    await page.goto("/settings/agent-access");
    await expect(page.getByTestId("agent-access-start")).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("agent-access-start").click();
    await expect(page.getByTestId("agent-access-active-session")).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "01-agent-access-active.png") });

    await page.getByTestId("agent-access-copy-prompt").click();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain("/v1/skill.md");
    expect(prompt).toContain("/v1/schema.json");
    expect(prompt).toContain("/snapshot?token=");
    await writeFile(path.join(EVIDENCE, "copied-prompt.txt"), redactTokens(prompt));

    const transcriptPath = path.join(EVIDENCE, "real-agent-transcript.txt");
    let agentOutput = "";
    try {
      const result = await execFileAsync("/bin/sh", [
        "-c",
        'exec codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C /tmp "$1" </dev/null',
        "agent-access", prompt,
      ], { timeout: 150_000, maxBuffer: 4 * 1024 * 1024 });
      agentOutput = `${result.stdout}\n${result.stderr}`;
    } catch (error) {
      const child = error as { stdout?: string; stderr?: string; message?: string };
      agentOutput = `${child.stdout ?? ""}\n${child.stderr ?? ""}\n${child.message ?? String(error)}`;
      await writeFile(transcriptPath, redactTokens(agentOutput));
      throw error;
    }
    await writeFile(transcriptPath, redactTokens(agentOutput));

    const proposal = page.getByTestId("agent-proposal-card").first();
    await expect(proposal).toBeVisible({ timeout: 45_000 });
    const templateName = (await proposal.getByTestId("agent-proposal-name").textContent())?.trim() ?? "";
    expect(templateName.length).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(EVIDENCE, "02-proposal-review.png") });
    await proposal.getByTestId("agent-import-proposal").click();
    await expect(proposal.getByText("Imported", { exact: true })).toBeVisible({ timeout: 15_000 });

    await page.goto("/");
    await expect(page.getByText(templateName, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "03-template-imported.png") });
    await writeFile(path.join(EVIDENCE, "template-import-assertion.txt"), `Visible template after import: ${templateName}\n`);
  });
});
