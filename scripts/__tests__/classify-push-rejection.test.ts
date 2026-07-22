import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCRIPT = path.join(REPO_ROOT, "scripts", "classify-push-rejection.sh");

interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

function runScript(stderrContent: string | null, provideFile = true): RunResult {
    let tempFile = "";
    if (provideFile && stderrContent !== null) {
        tempFile = path.join(os.tmpdir(), `test-stderr-${Math.random().toString(36).substring(7)}.txt`);
        fs.writeFileSync(tempFile, stderrContent);
    } else if (provideFile) {
        // Provide a non-existent file
        tempFile = path.join(os.tmpdir(), `non-existent-${Math.random().toString(36).substring(7)}.txt`);
    }

    try {
        const args = provideFile ? [tempFile] : [];
        const proc = spawnSync("bash", [SCRIPT, ...args], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return {
            stdout: (proc.stdout ?? "").toString(),
            stderr: (proc.stderr ?? "").toString(),
            exitCode: proc.status ?? -1,
        };
    } finally {
        if (tempFile && fs.existsSync(tempFile) && provideFile && stderrContent !== null) {
            fs.unlinkSync(tempFile);
        }
    }
}

describe("scripts/classify-push-rejection.sh (BLD-3505)", () => {
    it("script is executable", () => {
        expect(fs.existsSync(SCRIPT)).toBe(true);
        const mode = fs.statSync(SCRIPT).mode & 0o111;
        expect(mode).not.toBe(0);
    });

    it("returns exit code 1 and prints GitHub Action error annotation on GH006 protected branch rejection", () => {
        const stderr = [
            "remote: error: GH006: Protected branch update failed for refs/heads/main.",
            "remote: - 4 of 4 required status checks are expected.",
            "To github.com/alankyshum/cablesnap.git",
            " ! [remote rejected] main -> main (protected branch hook declined)",
            "error: failed to push some refs to 'github.com/alankyshum/cablesnap.git'"
        ].join("\n");

        const r = runScript(stderr);
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toContain("::error title=Protected branch push rejected::");
        expect(r.stderr).toContain("GitHub branch protection on main rejected the release-bot direct push");
        expect(r.stderr).toContain("bypass allowlist");
    });

    it("returns exit code 1 and prints GitHub Action error annotation on required status checks rejection", () => {
        const stderr = [
            "remote: error: Protected branch update failed for refs/heads/main.",
            "remote: - required status checks are expected.",
            "To github.com/alankyshum/cablesnap.git"
        ].join("\n");

        const r = runScript(stderr);
        expect(r.exitCode).toBe(1);
        expect(r.stderr).toContain("::error title=Protected branch push rejected::");
    });

    it("returns exit code 0 on typical concurrent-race rejection (non-fast-forward/behind)", () => {
        const stderr = [
            "To github.com/alankyshum/cablesnap.git",
            " ! [rejected]        main -> main (fetch first)",
            "error: failed to push some refs to 'github.com/alankyshum/cablesnap.git'",
            "hint: Updates were rejected because the remote contains work that you do",
            "hint: not have locally. This is usually caused by another repository pushing",
            "hint: to the same ref. You may want to first integrate the remote changes",
            "hint: (e.g., 'git pull ...') before pushing again.",
            "hint: See the 'Note about fast-forwards' in 'git push --help' for details."
        ].join("\n");

        const r = runScript(stderr);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe("");
        expect(r.stderr).toBe("");
    });

    it("returns exit code 0 on non-ff 'behind' rejection", () => {
        const stderr = [
            "To github.com/alankyshum/cablesnap.git",
            " ! [rejected]        main -> main (non-fast-forward)",
            "error: failed to push some refs to 'github.com/alankyshum/cablesnap.git'"
        ].join("\n");

        const r = runScript(stderr);
        expect(r.exitCode).toBe(0);
        expect(r.stdout).toBe("");
        expect(r.stderr).toBe("");
    });

    it("returns exit code 2 and usage error if no file is provided", () => {
        const r = runScript(null, false);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain("usage:");
    });

    it("returns exit code 2 if non-existent file is provided", () => {
        const r = runScript(null, true);
        expect(r.exitCode).toBe(2);
        expect(r.stderr).toContain("does not exist");
    });
});
