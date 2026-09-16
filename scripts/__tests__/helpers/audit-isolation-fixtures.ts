import { spawn } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AddressInfo } from 'net';

type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

const SCRIPT = path.resolve(__dirname, '..', '..', 'audit-create-finding.sh');
const CLIP = path.resolve(__dirname, '..', '..', 'clip.sh');

interface IssueFixture {
  identifier: string;
  status: string;
  description: string;
  title?: string;
  priority?: string;
}

export interface MockState {
  issues: IssueFixture[];
  commentCalls: { issueId: string; body: string }[];
  createCalls: { title: string; description: string; priority?: string }[];
  nextId: number;
}

function searchIssues(url: string, state: MockState) {
  const qs = url.includes('?') ? url.split('?')[1] : '';
  const params = new URLSearchParams(qs);
  const q = params.get('q') || '';
  return state.issues.filter((i) =>
    q ? i.description.includes(q) || (i.title || '').includes(q) : true,
  );
}

export function makeMock(state: MockState): Handler {
  return (req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const url = req.url || '';
      const method = req.method || 'GET';

      if (method === 'GET' && /^\/api\/companies\/[^/]+\/issues/.test(url)) {
        const matches = searchIssues(url, state);
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

export function startMockServer(handler: Handler): Promise<{ url: string; close: () => Promise<void> }> {
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
            server.closeAllConnections?.();
            server.close(() => res());
          }),
      });
    });
  });
}

/** Write a minimal allowlist JSON containing exactly the given scenarios. */
export function writeAllowlist(scenarios: string[]): string {
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

/**
 * Write an allowlist with a bld-480-prefix entry that includes the
 * QD#2 crop expectedDefectRegex, matching the production entry in
 * audit-isolation-harness-allowlist.json (BLD-2460).
 * Optionally also includes stack-marker (without expectedDefectRegex).
 */
export function writeAllowlistWithExpectedDefect(
  includeStackMarker = true,
): string {
  const file = path.join(
    os.tmpdir(),
    `allowlist-edr-${process.pid}-${Date.now()}.json`,
  );
  const entries: object[] = [];
  if (includeStackMarker) {
    entries.push({
      scenario: 'stack-marker',
      reason: 'Test harness — near-empty only (no expectedDefectRegex)',
      introducedBy: 'BLD-1126',
      suppressionTicket: 'BLD-1773',
    });
  }
  entries.push({
    scenario: 'bld-480-prefix',
    reason: 'Expected-defect anchor for BLD-480 trust anchor — crop is intentional.',
    introducedBy: 'BLD-951',
    suppressionTicket: 'BLD-2460',
    expectedDefectRegex: 'crop|truncat|clip|maxHeight|cut off|MusclesWorkedCard|body-figure',
  });
  fs.writeFileSync(file, JSON.stringify({ isolationHarnesses: entries }, null, 2));
  return file;
}

/** Write a description file whose body contains a near-empty phrase. */
export function writeNearEmptyDesc(fp: string, phrase: string): string {
  const file = path.join(os.tmpdir(), `desc-near-empty-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(
    file,
    `## UX: ${phrase}\n\n**Fingerprint**: \`${fp}\`\n\nThe screen has ${phrase}.\n`,
  );
  return file;
}

/** Write a description file whose body does NOT contain near-empty language. */
export function writeRegularDesc(fp: string): string {
  const file = path.join(os.tmpdir(), `desc-regular-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(
    file,
    `## UX: touch target too small\n\n**Fingerprint**: \`${fp}\`\n\nThe pill tap target is 32dp, below the 44dp minimum.\n`,
  );
  return file;
}

/** Write a description file whose body contains a crop-defect phrase (QD#2 regex). */
export function writeCropDesc(fp: string, phrase: string): string {
  const file = path.join(os.tmpdir(), `desc-crop-${process.pid}-${Date.now()}.md`);
  fs.writeFileSync(
    file,
    `## UX: ${phrase}\n\n**Fingerprint**: \`${fp}\`\n\nThe MusclesWorkedCard body-figure is cropped by maxHeight clamp.\n`,
  );
  return file;
}

export function runWrapper(
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

/** Write a description file matching the CVD coral→olive no-info-loss pattern. */
export function writeCvdNoInfoLossDesc(fp: string, cvdMode: string, scenario: string): string {
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
export function writeCvdInfoLossDesc(fp: string, cvdMode: string, scenario: string): string {
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
