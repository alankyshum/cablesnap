/**
 * @jest-environment node
 *
 * BLD-969 — Tests for `scripts/audit-create-finding.sh` deterministic dedup.
 *
 * Bug background:
 *   The ux-designer agent created two parallel issues (BLD-952, BLD-956)
 *   with the same fingerprint cbe59de55e00 on 2026-05-02. The dedup
 *   instruction in the agent's prompt is LLM-enforced and was skipped.
 *   This wrapper makes dedup deterministic by code.
 *
 * Acceptance criteria (from BLD-969):
 *   1. When the audit runs twice with the same fingerprint, only ONE
 *      Paperclip issue is created. The second invocation comments on the
 *      first.
 *   2. The de-dup check matches by exact, case-sensitive `Fingerprint: <hash>`
 *      substring in the issue description.
 *   3. Cancelled and `done` issues are NOT considered matches — a
 *      re-occurrence after fix MUST file a fresh ticket.
 *   4. On a duplicate, a comment is posted on the existing issue:
 *      `Same finding reproduced in audit-YYYY-MM-DD-<commit> (run <id>)`.
 *
 * Test strategy:
 *   We spin up a tiny http server on a random port that mocks the
 *   Paperclip API endpoints clip.sh hits (`/api/companies/.../issues`,
 *   `/api/issues/<id>`, `/api/issues/<id>/comments`). The wrapper invokes
 *   the real clip.sh which, via PAPERCLIP_API_BASE, hits our mock. This
 *   exercises the actual shell parsing/grep/jq logic end-to-end.
 */
import { spawn } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AddressInfo } from 'net';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const SCRIPT = path.resolve(__dirname, '..', 'audit-create-finding.sh');
const CLIP = path.resolve(__dirname, '..', 'clip.sh');

interface IssueFixture {
  identifier: string;
  status: string;
  description: string;
  title?: string;
  priority?: string;
}

function startMockServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.keepAliveTimeout = 100;
    server.headersTimeout = 500;
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) => {
            (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
            server.close(() => res());
          }),
      });
    });
  });
}

interface MockState {
  issues: IssueFixture[];
  /** Calls to POST .../comments — recorded for assertions. */
  commentCalls: { issueId: string; body: string }[];
  /** Calls to POST .../issues — recorded for assertions. */
  createCalls: { title: string; description: string; priority?: string }[];
  /** Auto-incrementing identifier suffix for newly-created issues. */
  nextId: number;
}

function makeMock(state: MockState): Handler {
  return (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = req.url || '';
      const method = req.method || 'GET';

      // GET /api/companies/<UUID>/issues?... — list-issues
      if (method === 'GET' && /^\/api\/companies\/[^/]+\/issues/.test(url)) {
        const qs = url.includes('?') ? url.split('?')[1] : '';
        const params = new URLSearchParams(qs);
        const q = params.get('q') || '';
        const matches = state.issues.filter((i) =>
          q ? i.description.includes(q) || (i.title || '').includes(q) : true,
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(matches));
        return;
      }

      // GET /api/issues/<id> — get-issue
      const getMatch = url.match(/^\/api\/issues\/([A-Z]+-\d+)$/);
      if (method === 'GET' && getMatch) {
        const ident = getMatch[1];
        const issue = state.issues.find((i) => i.identifier === ident);
        if (!issue) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(issue));
        return;
      }

      // POST /api/issues/<id>/comments — comment-issue
      const commentMatch = url.match(/^\/api\/issues\/([A-Z]+-\d+)\/comments$/);
      if (method === 'POST' && commentMatch) {
        const ident = commentMatch[1];
        const parsed = body ? JSON.parse(body) : {};
        state.commentCalls.push({ issueId: ident, body: parsed.body || '' });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'cm-mock', body: parsed.body }));
        return;
      }

      // POST /api/companies/<UUID>/issues — create-issue
      if (method === 'POST' && /^\/api\/companies\/[^/]+\/issues/.test(url)) {
        const parsed = body ? JSON.parse(body) : {};
        state.createCalls.push({
          title: parsed.title,
          description: parsed.description,
          priority: parsed.priority,
        });
        const ident = `BLD-${state.nextId++}`;
        const created: IssueFixture = {
          identifier: ident,
          status: 'todo',
          description: parsed.description,
          title: parsed.title,
          priority: parsed.priority,
        };
        state.issues.push(created);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(created));
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unhandled mock route', method, url }));
    });
  };
}

function runWrapper(
  args: string[],
  apiBase: string,
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [SCRIPT, '--clip', CLIP, ...args], {
      env: {
        ...process.env,
        PAPERCLIP_API_BASE: apiBase,
        PAPERCLIP_AGENT_API_KEY: 'test-key',
        CLIP_COMPANY: '00000000-0000-0000-0000-000000000001',
        CLIP_AGENT: '00000000-0000-0000-0000-000000000002',
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += c.toString()));
    child.stderr.on('data', (c) => (stderr += c.toString()));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

let __descSeq = 0;
function writeDescFile(fingerprint: string, body = 'mock description body'): string {
  const file = path.join(
    os.tmpdir(),
    `audit-finding-desc-${process.pid}-${Date.now()}-${++__descSeq}.md`,
  );
  // Match the real ux-designer template: a `Fingerprint: <hash>` line.
  fs.writeFileSync(
    file,
    `## UX: mock finding\n\n**Fingerprint**: \`${fingerprint}\`\n\n${body}\n`,
  );
  return file;
}

const COMMON_ARGS = (descFile: string, fp: string) => [
  '--fingerprint', fp,
  '--title', `UX: mock finding (${fp})`,
  '--description-file', descFile,
  '--audit-tag', 'audit-2026-05-02-266dbbee',
  '--run-id', 'run-test-123',
  '--project-id', '00000000-0000-0000-0000-0000000000aa',
];

describe('audit-create-finding.sh — BLD-969 deterministic dedup', () => {
  describe('AC#1: dedup by fingerprint', () => {
    it('first call CREATES; second call with same fingerprint COMMENTS', async () => {
      const fp = 'cbe59de55e00';
      const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 100 };
      const server = await startMockServer(makeMock(state));
      const desc = writeDescFile(fp);
      try {
        const first = await runWrapper(COMMON_ARGS(desc, fp), server.url);
        expect(first.status).toBe(0);
        expect(first.stdout).toMatch(/^CREATED BLD-\d+/);
        expect(state.createCalls).toHaveLength(1);
        expect(state.commentCalls).toHaveLength(0);

        const second = await runWrapper(COMMON_ARGS(desc, fp), server.url);
        expect(second.status).toBe(0);
        expect(second.stdout).toMatch(/^RECURRENCE BLD-\d+/);
        // No second issue created.
        expect(state.createCalls).toHaveLength(1);
        // Recurrence comment posted on the existing issue.
        expect(state.commentCalls).toHaveLength(1);
        expect(state.commentCalls[0].body).toContain('Same finding reproduced in audit-2026-05-02-266dbbee');
        expect(state.commentCalls[0].body).toContain('run-test-123');
      } finally {
        fs.unlinkSync(desc);
        await server.close();
      }
    });

    it('different fingerprints CREATE separate issues', async () => {
      const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 200 };
      const server = await startMockServer(makeMock(state));
      const fpA = 'aaaaaaaaaaaa';
      const fpB = 'bbbbbbbbbbbb';
      const descA = writeDescFile(fpA);
      const descB = writeDescFile(fpB);
      try {
        const a = await runWrapper(COMMON_ARGS(descA, fpA), server.url);
        const b = await runWrapper(COMMON_ARGS(descB, fpB), server.url);
        expect(a.status).toBe(0);
        expect(b.status).toBe(0);
        expect(a.stdout).toMatch(/^CREATED BLD-/);
        expect(b.stdout).toMatch(/^CREATED BLD-/);
        expect(state.createCalls).toHaveLength(2);
        expect(state.commentCalls).toHaveLength(0);
      } finally {
        fs.unlinkSync(descA);
        fs.unlinkSync(descB);
        await server.close();
      }
    });
  });

  describe('AC#3: cancelled/done are not matches — re-occurrence files fresh ticket', () => {
    it.each(['cancelled', 'done'])(
      'pre-existing %s issue with same fingerprint is IGNORED — new issue is CREATED',
      async (closedStatus) => {
        const fp = 'deadbeef0001';
        const state: MockState = {
          issues: [
            {
              identifier: 'BLD-50',
              status: closedStatus,
              description: `## prior finding\n\n**Fingerprint**: \`${fp}\`\n`,
              title: 'old finding',
            },
          ],
          commentCalls: [],
          createCalls: [],
          nextId: 300,
        };
        const server = await startMockServer(makeMock(state));
        const desc = writeDescFile(fp);
        try {
          const r = await runWrapper(COMMON_ARGS(desc, fp), server.url);
          expect(r.status).toBe(0);
          expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
          expect(state.createCalls).toHaveLength(1);
          expect(state.commentCalls).toHaveLength(0);
        } finally {
          fs.unlinkSync(desc);
          await server.close();
        }
      },
    );

    it.each(['todo', 'in_progress', 'in_review', 'backlog'])(
      'pre-existing %s issue with same fingerprint IS matched — comment posted',
      async (openStatus) => {
        const fp = 'deadbeef0002';
        const state: MockState = {
          issues: [
            {
              identifier: 'BLD-60',
              status: openStatus,
              description: `## existing finding\n\n**Fingerprint**: \`${fp}\`\n`,
              title: 'existing',
            },
          ],
          commentCalls: [],
          createCalls: [],
          nextId: 400,
        };
        const server = await startMockServer(makeMock(state));
        const desc = writeDescFile(fp);
        try {
          const r = await runWrapper(COMMON_ARGS(desc, fp), server.url);
          expect(r.status).toBe(0);
          expect(r.stdout).toMatch(/^RECURRENCE BLD-60/);
          expect(state.createCalls).toHaveLength(0);
          expect(state.commentCalls).toEqual([
            expect.objectContaining({
              issueId: 'BLD-60',
              body: expect.stringContaining('Same finding reproduced in audit-2026-05-02-266dbbee'),
            }),
          ]);
        } finally {
          fs.unlinkSync(desc);
          await server.close();
        }
      },
    );
  });

  describe('AC#2: case-sensitive exact-match', () => {
    it('substring of a longer fingerprint does NOT match', async () => {
      // Issue stored with a 16-char fingerprint; lookup uses a 12-char prefix.
      // The longer issue contains the shorter as a substring, but our query
      // searches for the exact line `Fingerprint: <12-hex>` — which the
      // longer fingerprint's line does NOT contain (it has an extra suffix).
      // Without exact-line matching this would falsely dedup.
      const longFp = 'aabbccddeeff0011';
      const shortFp = 'aabbccddeeff';
      const state: MockState = {
        issues: [
          {
            identifier: 'BLD-70',
            status: 'todo',
            description: `## prior\n\n**Fingerprint**: \`${longFp}\`\n`,
            title: 'long fingerprint',
          },
        ],
        commentCalls: [],
        createCalls: [],
        nextId: 500,
      };
      const server = await startMockServer(makeMock(state));
      const desc = writeDescFile(shortFp);
      try {
        const r = await runWrapper(COMMON_ARGS(desc, shortFp), server.url);
        expect(r.status).toBe(0);
        // Should NOT recurrence-match. Must create fresh.
        expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
        expect(state.createCalls).toHaveLength(1);
        expect(state.commentCalls).toHaveLength(0);
      } finally {
        fs.unlinkSync(desc);
        await server.close();
      }
    });

    it('PLAIN-format substring of a longer fingerprint does NOT match (regression for QD block)', async () => {
      // QD blocked PR #488: with the original `grep -F "Fingerprint: $FP"`,
      // a new fingerprint that is a PREFIX of an existing plain-format
      // fingerprint would falsely dedup. The original test only covered
      // the bold/backticked format, so the plain-format path was unguarded.
      // Repro from QD: existing `Fingerprint: aabbccddeeff0011` (plain), new
      // fingerprint `aabbccddeeff` returned `RECURRENCE BLD-70` instead of
      // `CREATED BLD-...`. The fix enforces a non-hex token boundary after
      // the hash on the plain-format match.
      const longFp = 'aabbccddeeff0011';
      const shortFp = 'aabbccddeeff';
      const state: MockState = {
        issues: [
          {
            identifier: 'BLD-70',
            status: 'todo',
            // PLAIN format — no bold, no backticks. This is the path the
            // original grep -F mishandled.
            description: `## prior\n\nFingerprint: ${longFp}\nMore detail.\n`,
            title: 'long fingerprint plain',
          },
        ],
        commentCalls: [],
        createCalls: [],
        nextId: 500,
      };
      const server = await startMockServer(makeMock(state));
      const desc = writeDescFile(shortFp);
      try {
        const r = await runWrapper(COMMON_ARGS(desc, shortFp), server.url);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
        expect(state.createCalls).toHaveLength(1);
        expect(state.commentCalls).toHaveLength(0);
      } finally {
        fs.unlinkSync(desc);
        await server.close();
      }
    });

    it('PLAIN-format EXACT fingerprint match still recurrence-matches', async () => {
      // Guard the positive case for the plain format so the boundary fix
      // doesn't accidentally regress real dedup. Description carries
      // `Fingerprint: <hash>` followed by a newline (typical token boundary
      // in audit descriptions).
      const fp = 'cbe59de55e00';
      const state: MockState = {
        issues: [
          {
            identifier: 'BLD-71',
            status: 'in_review',
            description: `## prior finding\n\nFingerprint: ${fp}\nScenario: workout-history\n`,
            title: 'prior finding plain',
          },
        ],
        commentCalls: [],
        createCalls: [],
        nextId: 600,
      };
      const server = await startMockServer(makeMock(state));
      const desc = writeDescFile(fp);
      try {
        const r = await runWrapper(COMMON_ARGS(desc, fp), server.url);
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/^RECURRENCE BLD-71/);
        expect(state.createCalls).toHaveLength(0);
        expect(state.commentCalls).toEqual([
          expect.objectContaining({
            issueId: 'BLD-71',
            body: expect.stringContaining('Same finding reproduced in audit-2026-05-02-266dbbee'),
          }),
        ]);
      } finally {
        fs.unlinkSync(desc);
        await server.close();
      }
    });
  });

  describe('argument validation', () => {
    it('rejects missing --fingerprint', async () => {
      const desc = writeDescFile('xxxxxxxxxxxx');
      try {
        const r = await runWrapper(
          [
            '--title', 't',
            '--description-file', desc,
            '--audit-tag', 'tag',
            '--run-id', 'r',
          ],
          'http://127.0.0.1:1', // unused — script exits before any HTTP
        );
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('missing --fingerprint');
      } finally {
        fs.unlinkSync(desc);
      }
    });

    it('rejects non-hex fingerprint', async () => {
      const desc = writeDescFile('not-hex!');
      try {
        const r = await runWrapper(
          [
            ...COMMON_ARGS(desc, 'not-hex!'),
          ],
          'http://127.0.0.1:1',
        );
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('fingerprint must be 6-64 hex chars');
      } finally {
        fs.unlinkSync(desc);
      }
    });

    it('rejects missing description file', async () => {
      const r = await runWrapper(
        [
          '--fingerprint', 'aabbccddeeff',
          '--title', 't',
          '--description-file', '/tmp/definitely-does-not-exist-bld969.md',
          '--audit-tag', 'tag',
          '--run-id', 'r',
        ],
        'http://127.0.0.1:1',
      );
      expect(r.status).toBe(2);
      expect(r.stderr).toContain('description file not found');
    });
  });
});
