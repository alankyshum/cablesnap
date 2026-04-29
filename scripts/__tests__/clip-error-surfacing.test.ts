/**
 * @jest-environment node
 *
 * BLD-846 — Tests for clip.sh error surfacing.
 *
 * Bug background:
 *   The original `/skills/scripts/clip.sh` used `curl -sf` for write
 *   endpoints. With `-f`, curl exits non-zero on HTTP errors but the
 *   response body (containing the structured API error like
 *   "Issue is checked out by another agent") is silently discarded.
 *   Combined with downstream pipelines that didn't reliably surface
 *   the exit code, this swallowed real failures (BLD-743 incident:
 *   knowledge-curator's status flip 409'd against a CEO-locked issue
 *   and the agent thought it succeeded).
 *
 * Acceptance criteria (from BLD-846):
 *   1. On 4xx/5xx response, clip.sh writes the response body to stderr.
 *   2. On 409 specifically, the structured error body (e.g.
 *      `{"error":"Issue is checked out by another agent","holderRunId":"..."}`)
 *      is preserved verbatim so callers can read who holds the lock.
 *   3. Exit code is non-zero so callers using `set -e` see the failure.
 *   4. No regression on 2xx — current happy-path output unchanged.
 *
 * Test strategy:
 *   We spin up a tiny http server on a random port that responds with
 *   scripted status codes + bodies, point clip.sh at it via
 *   PAPERCLIP_API_BASE, and invoke real subcommands. This validates
 *   the end-to-end behaviour through the actual `api()` helper without
 *   mocking curl.
 */
import { spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';
import { AddressInfo } from 'net';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const SCRIPT = path.resolve(__dirname, '..', 'clip.sh');

function startMockServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    // Aggressively short timeouts so a stuck/keep-alive connection from curl
    // can't hang the test runner.
    server.keepAliveTimeout = 100;
    server.headersTimeout = 500;
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) => {
            // closeAllConnections is required on Node 18+ to drop sockets
            // that curl left in keep-alive — without it close() blocks
            // until they time out.
            (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
            server.close(() => res());
          }),
      });
    });
  });
}

function runClip(
  args: string[],
  apiBase: string,
  extraEnv: Record<string, string> = {},
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [SCRIPT, ...args], {
      env: {
        ...process.env,
        PAPERCLIP_API_BASE: apiBase,
        PAPERCLIP_AGENT_API_KEY: 'test-key',
        CLIP_COMPANY: '00000000-0000-0000-0000-000000000001',
        CLIP_AGENT: '00000000-0000-0000-0000-000000000002',
        ...extraEnv,
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

describe('clip.sh — BLD-846 error surfacing', () => {
  describe('happy path (2xx) — must not regress', () => {
    it('comment-issue 201 prints body to stdout, exits 0, stderr empty', async () => {
      const server = await startMockServer((req, res) => {
        let body = '';
        req.on('data', (c) => (body += c));
        req.on('end', () => {
          expect(req.method).toBe('POST');
          expect(req.url).toBe('/api/issues/abc/comments');
          // Echo back a created-comment shape
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: 'cm-1', body: JSON.parse(body).body }));
        });
      });
      try {
        const r = await runClip(['comment-issue', 'abc', '--body', 'hello'], server.url);
        expect(r.status).toBe(0);
        expect(r.stderr).toBe('');
        // jq pretty-prints the body
        expect(r.stdout).toContain('"id"');
        expect(r.stdout).toContain('cm-1');
        expect(r.stdout).toContain('hello');
      } finally {
        await server.close();
      }
    });

    it('get-issue 200 returns body on stdout, no stderr noise', async () => {
      const server = await startMockServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ identifier: 'BLD-1', status: 'todo' }));
      });
      try {
        const r = await runClip(['get-issue', 'BLD-1'], server.url);
        expect(r.status).toBe(0);
        expect(r.stderr).toBe('');
        expect(r.stdout).toContain('BLD-1');
        expect(r.stdout).toContain('todo');
      } finally {
        await server.close();
      }
    });
  });

  describe('409 — the BLD-743 regression case', () => {
    it('comment-issue 409 surfaces holderRunId on stderr and exits non-zero', async () => {
      const errorBody = {
        error: 'Issue is checked out by another agent',
        holderRunId: 'run-owned-by-ceo-12345',
        holderAgentId: 'agent-ceo',
      };
      const server = await startMockServer((_req, res) => {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(errorBody));
      });
      try {
        const r = await runClip(['comment-issue', 'BLD-743', '--body', 'kc note'], server.url);
        expect(r.status).not.toBe(0);
        // Body must be preserved verbatim on stderr.
        expect(r.stderr).toContain('Issue is checked out by another agent');
        expect(r.stderr).toContain('run-owned-by-ceo-12345');
        expect(r.stderr).toContain('agent-ceo');
        // Status code must be visible too.
        expect(r.stderr).toContain('409');
        // Stdout MUST NOT contain the body — agents that pipe stdout
        // (e.g. into jq) should not see the error as if it were data.
        expect(r.stdout).not.toContain('Issue is checked out');
      } finally {
        await server.close();
      }
    });

    it('update-issue 409 also surfaces error body and non-zero exit', async () => {
      const server = await startMockServer((_req, res) => {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'locked', holderRunId: 'r-9' }));
      });
      try {
        const r = await runClip(['update-issue', 'BLD-743', '--status', 'done'], server.url);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain('locked');
        expect(r.stderr).toContain('r-9');
        expect(r.stderr).toContain('409');
      } finally {
        await server.close();
      }
    });
  });

  describe('other 4xx / 5xx', () => {
    it('400 bad request surfaces validation error body on stderr', async () => {
      const server = await startMockServer((_req, res) => {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'priority must be one of urgent|high|...' }));
      });
      try {
        const r = await runClip(['create-issue', '--title', 't', '--priority', 'bogus'], server.url);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain('priority must be one of');
        expect(r.stderr).toContain('400');
      } finally {
        await server.close();
      }
    });

    it('500 internal error surfaces body and exits non-zero', async () => {
      const server = await startMockServer((_req, res) => {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('internal kaboom');
      });
      try {
        const r = await runClip(['get-issue', 'BLD-1'], server.url);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain('internal kaboom');
        expect(r.stderr).toContain('500');
      } finally {
        await server.close();
      }
    });

    it('401 unauthorized — empty body still surfaces a useful message', async () => {
      const server = await startMockServer((_req, res) => {
        res.writeHead(401);
        res.end();
      });
      try {
        const r = await runClip(['get-issue', 'BLD-1'], server.url);
        expect(r.status).not.toBe(0);
        expect(r.stderr).toContain('401');
        // Empty body marker so agents know the server returned nothing.
        expect(r.stderr).toContain('empty response body');
      } finally {
        await server.close();
      }
    });
  });

  describe('exit code propagation', () => {
    it('the failure is detectable under `set -e`', async () => {
      const server = await startMockServer((_req, res) => {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'locked' }));
      });
      try {
        // Run the script in a parent shell with `set -e` and verify the
        // outer shell aborts. Use spawn (not spawnSync) so the mock
        // server's event loop isn't blocked while curl waits.
        const r = await new Promise<{ status: number | null }>((resolve, reject) => {
          const child = spawn('bash', ['-c', `set -e; bash "${SCRIPT}" comment-issue x --body y`], {
            env: {
              ...process.env,
              PAPERCLIP_API_BASE: server.url,
              PAPERCLIP_AGENT_API_KEY: 'test-key',
              CLIP_COMPANY: 'c',
              CLIP_AGENT: 'a',
            },
          });
          // Drain pipes so the child can exit.
          child.stdout.resume();
          child.stderr.resume();
          child.on('error', reject);
          child.on('close', (status) => resolve({ status }));
        });
        expect(r.status).not.toBe(0);
      } finally {
        await server.close();
      }
    });
  });
});
