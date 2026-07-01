/**
 * @jest-environment node
 *
 * BLD-1773 — Tests for the isolation-harness suppression feature in
 * `scripts/audit-create-finding.sh`.
 *
 * Problem: dev-only isolation harnesses (e.g. stack-marker) intentionally
 * render sparse — a single compact component on a blank padded <View>. The
 * automated ux-designer frames every capture as a full 390×844 viewport, so a
 * legitimately-tiny harness reads as '~90% blank / broken empty state'. Because
 * the QD#3 dedup fingerprint changes per-commit, the same benign finding evades
 * dedup and re-files every audit run.
 *
 * Fix: audit-create-finding.sh accepts --scenario and --allowlist flags. When
 * the scenario is in the isolation-harness allowlist AND the finding matches
 * near-empty/content-missing keywords, the script exits SUPPRESSED with exit
 * code 0 and makes no Paperclip API calls.
 *
 * Acceptance criteria (BLD-1773):
 *   AC1. Allowlisted scenario + near-empty finding => SUPPRESSED (no issue, no comment).
 *   AC3. Allowlisted scenario + non-near-empty finding => NOT suppressed (issue created).
 *   AC3. Non-allowlisted scenario + near-empty finding => NOT suppressed (issue created).
 *   Edge. Missing allowlist file => silently inert (no crash, normal create path).
 *   Edge. No --scenario flag => suppression check skipped (backward-compat).
 *   Edge. Allowlist typo / unknown scenario name => inert (normal create path).
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

interface MockState {
  issues: IssueFixture[];
  commentCalls: { issueId: string; body: string }[];
  createCalls: { title: string; description: string; priority?: string }[];
  nextId: number;
}

function makeMock(state: MockState): Handler {
  return (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    // eslint-disable-next-line complexity -- mock handler routes multiple HTTP paths; splitting would obscure intent
    req.on('end', () => {
      const url = req.url || '';
      const method = req.method || 'GET';

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

      const commentMatch = url.match(/^\/api\/issues\/([A-Z]+-\d+)\/comments$/);
      if (method === 'POST' && commentMatch) {
        const ident = commentMatch[1];
        const parsed = body ? JSON.parse(body) : {};
        state.commentCalls.push({ issueId: ident, body: parsed.body || '' });
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'cm-mock', body: parsed.body }));
        return;
      }

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

/** Write a minimal allowlist JSON containing exactly the given scenarios. */
function writeAllowlist(scenarios: string[]): string {
  const file = path.join(
    os.tmpdir(),
    `allowlist-${process.pid}-${Date.now()}.json`,
  );
  const entries = scenarios.map((s) => ({
    scenario: s,
    reason: `Test harness for ${s}`,
    introducedBy: 'BLD-TEST',
    suppressionTicket: 'BLD-1773',
  }));
  fs.writeFileSync(file, JSON.stringify({ isolationHarnesses: entries }, null, 2));
  return file;
}

/** Write a description file whose body contains a near-empty phrase. */
function writeNearEmptyDesc(fp: string, phrase: string): string {
  const file = path.join(os.tmpdir(), `desc-near-empty-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(
    file,
    `## UX: ${phrase}\n\n**Fingerprint**: \`${fp}\`\n\nThe screen has ${phrase}.\n`,
  );
  return file;
}

/** Write a description file whose body does NOT contain near-empty language. */
function writeRegularDesc(fp: string): string {
  const file = path.join(os.tmpdir(), `desc-regular-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(
    file,
    `## UX: touch target too small\n\n**Fingerprint**: \`${fp}\`\n\nThe pill tap target is 32dp, below the 44dp minimum.\n`,
  );
  return file;
}

function runWrapper(
  args: string[],
  allowlistFile: string,
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
        // Pass the custom allowlist via env so we don't need --allowlist flag
        // for every test (the script reads $ALLOWLIST from env if set).
        ALLOWLIST: allowlistFile,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c: Buffer) => (stdout += c.toString()));
    child.stderr.on('data', (c: Buffer) => (stderr += c.toString()));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('audit-create-finding.sh — BLD-1773 isolation-harness allowlist suppression', () => {
  it('AC1: allowlisted scenario + near-empty title => SUPPRESSED, no issue created', async () => {
    const fp = 'aabbcc112233';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeNearEmptyDesc(fp, 'near-empty screen');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 800 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: near-empty screen (stack-marker)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-06-23-abc123',
          '--run-id', 'run-suppression-test',
          '--scenario', 'stack-marker',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('SUPPRESSED stack-marker');
      // No Paperclip API calls made.
      expect(state.createCalls).toHaveLength(0);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('AC1: allowlisted scenario + "content missing" in description body => SUPPRESSED', async () => {
    const fp = 'bbccdd334455';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = path.join(os.tmpdir(), `desc-cm-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(
      desc,
      `## UX: layout defect\n\n**Fingerprint**: \`${fp}\`\n\nContent missing — only padding visible.\n`,
    );
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 810 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: layout defect (stack-marker)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-06-23-abc123',
          '--run-id', 'run-suppression-test',
          '--scenario', 'stack-marker',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('SUPPRESSED stack-marker');
      expect(state.createCalls).toHaveLength(0);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('AC3: allowlisted scenario + NON-near-empty finding => NOT suppressed, issue created normally', async () => {
    // A real defect on an isolation-harness scenario (e.g. tap target too small)
    // should still be filed — suppression is scoped to near-empty/content-missing only.
    const fp = 'ccddee445566';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeRegularDesc(fp);
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 820 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: touch target 32dp below 44dp minimum (stack-marker)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-06-23-abc123',
          '--run-id', 'run-suppression-test',
          '--scenario', 'stack-marker',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      // Must create an issue, NOT suppress.
      expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
      expect(state.createCalls).toHaveLength(1);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('AC3: non-allowlisted scenario + near-empty finding => NOT suppressed, issue created normally', async () => {
    // A real near-empty defect on a production scenario (e.g. workout-history)
    // should still be filed — suppression is allowlist-scoped.
    const fp = 'ddeeff556677';
    const allowlist = writeAllowlist(['stack-marker']); // workout-history is NOT in the allowlist
    const desc = writeNearEmptyDesc(fp, 'empty screen');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 830 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: empty screen — no workout entries shown',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-06-23-abc123',
          '--run-id', 'run-suppression-test',
          '--scenario', 'workout-history',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
      expect(state.createCalls).toHaveLength(1);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('edge case: missing allowlist file => suppression silently inert, issue created normally', async () => {
    // If the allowlist file is missing, the script must not crash — it should
    // proceed as if no suppression is in effect (BLD-1773 edge-case requirement).
    const fp = 'eeff00667788';
    const desc = writeNearEmptyDesc(fp, 'near-empty');
    const nonExistentAllowlist = '/tmp/does-not-exist-bld1773-allowlist.json';
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 840 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: near-empty (stack-marker)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-06-23-abc123',
          '--run-id', 'run-suppression-test',
          '--scenario', 'stack-marker',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        nonExistentAllowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      // No crash; allowlist missing => no suppression => normal create path.
      expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
      expect(state.createCalls).toHaveLength(1);
    } finally {
      fs.unlinkSync(desc);
      await server.close();
    }
  });

  it('edge case: no --scenario flag => suppression check skipped, issue created normally', async () => {
    // When --scenario is not passed, suppression must not fire even if the
    // finding title contains "near-empty" (backward-compat with callers that
    // don't pass --scenario yet).
    const fp = 'ff0011778899';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeNearEmptyDesc(fp, 'near-empty screen');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 850 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: near-empty screen — no --scenario passed',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-06-23-abc123',
          '--run-id', 'run-suppression-test',
          // Note: no --scenario flag
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      // No --scenario => no suppression check => normal create.
      expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
      expect(state.createCalls).toHaveLength(1);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('allowlist typo / unknown scenario name => inert, issue created normally', async () => {
    // A scenario name in --scenario that does not appear in the allowlist
    // should be treated as non-allowlisted (no suppression).
    const fp = '001122889900';
    const allowlist = writeAllowlist(['stack-marker']); // 'stack-markerr' typo is NOT in list
    const desc = writeNearEmptyDesc(fp, 'blank screen');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 860 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: blank screen (stack-markerr)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-06-23-abc123',
          '--run-id', 'run-suppression-test',
          '--scenario', 'stack-markerr', // typo — not in allowlist
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
      expect(state.createCalls).toHaveLength(1);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });
});

/**
 * BLD-2464 — Tests for the CVD no-info-loss hue-shift suppression in
 * `scripts/audit-create-finding.sh`.
 *
 * Problem: The daily audit re-files the same known CVD aesthetic finding every
 * run across every coral-CTA screen (BLD-2456, BLD-2457, BLD-2458) because the
 * dedup fingerprint includes the commit SHA. This is the CVD analogue of the
 * near-empty harness noise that BLD-1773 solved.
 *
 * Fix: audit-create-finding.sh globally suppresses a CVD finding when BOTH:
 *   1. The finding is a CVD-mode finding (deuteranopia/protanopia/tritanopia).
 *   2. The finding self-describes as a no-information-loss hue shift (the brand
 *      coral primary desaturates to olive/gold-brown but remains distinguishable
 *      and no state/category information is lost — purely aesthetic).
 * This suppression is global (not scenario-gated): print `SUPPRESSED-CVD
 * <scenario>` and exit 0. No issue created or commented on.
 *
 * Acceptance criteria (BLD-2464):
 *   CVD-AC1. CVD finding with olive hue-shift + no-info-loss language => SUPPRESSED-CVD
 *   CVD-AC2. CVD finding with actual information loss described => NOT suppressed (issue created)
 *   CVD-AC3. Non-CVD near-empty finding on an allowlisted scenario => still uses BLD-1773 path
 *   CVD-AC4. SUPPRESSED-CVD includes the --scenario name when provided
 *   CVD-AC5. SUPPRESSED-CVD when no --scenario provided (global, not gated)
 */

/** Write a description file matching the CVD coral→olive no-info-loss pattern. */
function writeCvdNoInfoLossDesc(fp: string, cvdMode: string, scenario: string): string {
  const file = path.join(os.tmpdir(), `desc-cvd-noloss-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(
    file,
    `## UX: CTA button desaturates to olive under ${cvdMode} (${scenario})\n\n` +
      `**Fingerprint**: \`${fp}\`\n\n` +
      `Under ${cvdMode} emulation, the primary CTA button (#FF6038 coral) desaturates ` +
      `to an olive/gold-brown hue. The button remains distinguishable and still clearly ` +
      `a button — no information loss or state confusion. This is a purely aesthetic ` +
      `hue shift; the element is still readable and visible.\n\n` +
      `**Suggested fix**: Add a non-color affordance (icon, border weight) to supplement ` +
      `hue distinction. Note: BLD-1901 explicitly deferred this as a separate additive ` +
      `concern after fixing legibility (navy foreground).\n`,
  );
  return file;
}

/** Write a description file for a CVD finding WITH actual information loss. */
function writeCvdInfoLossDesc(fp: string, cvdMode: string, scenario: string): string {
  const file = path.join(os.tmpdir(), `desc-cvd-infoloss-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(
    file,
    `## UX: Active and inactive tabs become indistinguishable under ${cvdMode} (${scenario})\n\n` +
      `**Fingerprint**: \`${fp}\`\n\n` +
      `Under ${cvdMode} emulation, both the active tab (coral) and the inactive tab (grey) ` +
      `collapse to the same olive/muted tone. Users cannot tell which tab is currently selected. ` +
      `Category information is lost: the distinction between active and inactive state is ` +
      `no longer conveyed by color alone, and there is no secondary visual channel.\n\n` +
      `**Suggested fix**: Add an underline or bold weight to the active tab indicator.\n`,
  );
  return file;
}

describe('audit-create-finding.sh — BLD-2464 CVD hue-shift suppression', () => {
  it('CVD-AC1: deuteranopia finding with coral→olive no-info-loss => SUPPRESSED-CVD', async () => {
    const fp = 'aa11bb22cc33';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeCvdNoInfoLossDesc(fp, 'deuteranopia', 'progress-tab');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 900 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title',
          'UX: progress-tab CTA button becomes olive-gold under deuteranopia (audit 2026-07-01, progress-tab)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-07-01-a1735164',
          '--run-id', 'run-cvd-suppression-test',
          '--scenario', 'progress-tab',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('SUPPRESSED-CVD progress-tab');
      // No Paperclip API calls made.
      expect(state.createCalls).toHaveLength(0);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('CVD-AC1: protanopia finding with coral→olive no-info-loss => SUPPRESSED-CVD', async () => {
    const fp = 'bb22cc33dd44';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeCvdNoInfoLossDesc(fp, 'protanopia', 'form-clips');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 910 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title',
          'UX: form-clips CTA button becomes olive-gold under protanopia (audit 2026-07-01, form-clips)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-07-01-a1735164',
          '--run-id', 'run-cvd-suppression-test',
          '--scenario', 'form-clips',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('SUPPRESSED-CVD form-clips');
      expect(state.createCalls).toHaveLength(0);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('CVD-AC2: CVD finding with actual information loss (indistinguishable states) => NOT suppressed, issue created', async () => {
    // A CVD finding where two states become indistinguishable MUST still file —
    // this is real information loss, not a no-info-loss hue shift.
    const fp = 'cc33dd44ee55';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeCvdInfoLossDesc(fp, 'deuteranopia', 'workout-history');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 920 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title',
          'UX: active vs inactive tabs indistinguishable under deuteranopia (workout-history)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-07-01-a1735164',
          '--run-id', 'run-cvd-suppression-test',
          '--scenario', 'workout-history',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      // Must NOT be suppressed — real information loss.
      expect(r.stdout).toMatch(/^CREATED BLD-\d+/);
      expect(state.createCalls).toHaveLength(1);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('CVD-AC3: non-CVD near-empty finding on allowlisted scenario => uses BLD-1773 SUPPRESSED path (unchanged)', async () => {
    // The BLD-1773 near-empty suppression must still work independently when
    // the finding is not a CVD finding. The BLD-2464 path must not interfere.
    const fp = 'dd44ee55ff66';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeNearEmptyDesc(fp, 'near-empty screen');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 930 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title', 'UX: near-empty screen (stack-marker)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-07-01-a1735164',
          '--run-id', 'run-cvd-suppression-test',
          '--scenario', 'stack-marker',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      // BLD-1773 path fires: SUPPRESSED (not SUPPRESSED-CVD)
      expect(r.stdout.trim()).toBe('SUPPRESSED stack-marker');
      expect(state.createCalls).toHaveLength(0);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('CVD-AC4: SUPPRESSED-CVD includes scenario name when --scenario provided', async () => {
    // Output must be `SUPPRESSED-CVD <scenario>` not bare `SUPPRESSED-CVD`.
    const fp = 'ee55ff660011';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeCvdNoInfoLossDesc(fp, 'protanopia', 'nutrition-tab');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 940 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title',
          'UX: nutrition meal-slot circles become olive-gold under protanopia (nutrition-tab)',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-07-01-a1735164',
          '--run-id', 'run-cvd-suppression-test',
          '--scenario', 'nutrition-tab',
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('SUPPRESSED-CVD nutrition-tab');
      expect(state.createCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });

  it('CVD-AC5: SUPPRESSED-CVD fires even without --scenario (global, not scenario-gated)', async () => {
    // Unlike BLD-1773 (allowlist-gated), CVD suppression must fire globally.
    // When --scenario is absent, output is just `SUPPRESSED-CVD` (no trailing name).
    const fp = 'ff66001122aa';
    const allowlist = writeAllowlist(['stack-marker']);
    const desc = writeCvdNoInfoLossDesc(fp, 'deuteranopia', 'any-screen');
    const state: MockState = { issues: [], commentCalls: [], createCalls: [], nextId: 950 };
    const server = await startMockServer(makeMock(state));
    try {
      const r = await runWrapper(
        [
          '--fingerprint', fp,
          '--title',
          'UX: coral CTA desaturates to olive under deuteranopia — still distinguishable, purely aesthetic',
          '--description-file', desc,
          '--audit-tag', 'audit-2026-07-01-a1735164',
          '--run-id', 'run-cvd-suppression-test',
          // Note: no --scenario flag — suppression must still fire
          '--project-id', '00000000-0000-0000-0000-0000000000aa',
        ],
        allowlist,
        server.url,
      );
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('SUPPRESSED-CVD');
      expect(state.createCalls).toHaveLength(0);
      expect(state.commentCalls).toHaveLength(0);
    } finally {
      fs.unlinkSync(desc);
      fs.unlinkSync(allowlist);
      await server.close();
    }
  });
});
