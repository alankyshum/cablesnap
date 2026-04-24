/**
 * BLD-571: generate-changelog.ts parser + emitter tests.
 *
 * Covers:
 *  - Happy path: parses sections in file order, strips versionCode marker.
 *  - Malformed section is skipped with warning; others still parse.
 *  - Missing file → non-zero exit (throws in API path).
 *  - Zero entries → non-zero exit.
 *  - Atomic write: generated module + sidecars written atomically.
 *  - F-Droid sidecar emission gated by `<!-- versionCode: N -->` marker.
 *  - ≤500-byte path: body is byte-equivalent (modulo trailing newline).
 *  - >500-byte path: truncated with `…see in-app release notes`, ≤500 bytes.
 *  - Path-derived-from-app.config.ts regression lock: generator emits into
 *    `<android.package>` read dynamically from app.config.ts.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  generate,
  parseChangelog,
  readAndroidPackage,
  truncateForFdroid,
} from '../../scripts/generate-changelog';

function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'bld571-gen-'));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  return root;
}

const APP_CONFIG = `
import { ExpoConfig, ConfigContext } from "expo/config";
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  version: "0.26.8",
  android: {
    package: "com.persoack.cablesnap",
    versionCode: 57,
  },
});
`;

const APP_CONFIG_RENAMED = APP_CONFIG.replace(
  '"com.persoack.cablesnap"',
  '"com.example.renamedapp"'
);

const SIMPLE_CHANGELOG = `# Changelog
## v0.26.8 — 2026-04-24
<!-- versionCode: 57 -->
- Shiny bullet one
- Shiny bullet two

## v0.26.7 — 2026-04-20
- Older release
`;

describe('parseChangelog', () => {
  it('parses sections in file order and strips the versionCode marker', () => {
    const { entries, warnings } = parseChangelog(SIMPLE_CHANGELOG);
    expect(warnings).toHaveLength(0);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      version: '0.26.8',
      date: '2026-04-24',
      versionCode: 57,
    });
    expect(entries[0].body).not.toContain('<!-- versionCode');
    expect(entries[0].body).toContain('Shiny bullet one');
    expect(entries[1]).toMatchObject({
      version: '0.26.7',
      date: '2026-04-20',
      versionCode: null,
    });
  });

  it('skips malformed sections with a warning but continues parsing', () => {
    const source = `## Something not a version
- body

## v0.1.0 — 2026-04-01
- valid
`;
    const { entries, warnings } = parseChangelog(source);
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe('0.1.0');
    expect(warnings[0]).toMatch(/malformed/);
  });

  it('ignores sections inside fenced code blocks', () => {
    const source = `Docs:
\`\`\`
## v9.9.9 — 2099-01-01
- not a real entry
\`\`\`
## v0.1.0 — 2026-04-01
- real
`;
    const { entries, warnings } = parseChangelog(source);
    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe('0.1.0');
    expect(warnings).toHaveLength(0);
  });
});

describe('readAndroidPackage', () => {
  it('extracts android.package from app.config.ts', () => {
    expect(readAndroidPackage(APP_CONFIG)).toBe('com.persoack.cablesnap');
  });

  it('throws a descriptive error when the marker is missing', () => {
    expect(() => readAndroidPackage('export default {}')).toThrow(/android\.package/);
  });
});

describe('truncateForFdroid', () => {
  it('returns the body byte-equivalent when under 500 bytes', () => {
    const body = '- a\n- b\n';
    expect(truncateForFdroid(body)).toBe(body);
    expect(Buffer.byteLength(truncateForFdroid(body), 'utf8')).toBeLessThanOrEqual(500);
  });

  it('truncates with the overflow suffix when over 500 bytes, staying ≤500 bytes', () => {
    const body = `${'x'.repeat(800)}`;
    const out = truncateForFdroid(body);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThanOrEqual(500);
    expect(out).toMatch(/…see in-app release notes$/);
  });

  it('handles a body exactly at the 500-byte boundary without truncation', () => {
    const body = 'a'.repeat(500);
    expect(truncateForFdroid(body)).toBe(body);
  });
});

describe('generate (integration)', () => {
  let root: string;
  afterEach(() => {
    if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  it('writes lib/changelog.generated.ts and a sidecar per marked entry (happy path)', () => {
    root = makeRepo({
      'CHANGELOG.md': SIMPLE_CHANGELOG,
      'app.config.ts': APP_CONFIG,
    });
    const silenced = { error: jest.fn(), warn: jest.fn() };
    const result = generate({ repoRoot: root, logger: silenced });

    const modulePath = join(root, 'lib', 'changelog.generated.ts');
    expect(existsSync(modulePath)).toBe(true);
    const moduleSrc = readFileSync(modulePath, 'utf8');
    expect(moduleSrc).toMatch(/export const CHANGELOG/);
    expect(moduleSrc).toContain('"version": "0.26.8"');

    const sidecar = join(
      root,
      'fdroid',
      'metadata',
      'com.persoack.cablesnap',
      'en-US',
      'changelogs',
      '57.txt'
    );
    expect(existsSync(sidecar)).toBe(true);
    expect(Buffer.byteLength(readFileSync(sidecar), 'utf8')).toBeLessThanOrEqual(500);

    // Marker-less entry (v0.26.7) does NOT get a sidecar.
    expect(result.sidecarsWritten).toHaveLength(1);
    expect(result.sidecarsWritten[0]).toContain('57.txt');
    expect(silenced.warn).toHaveBeenCalledWith(
      expect.stringContaining('skipping F-Droid sidecar for v0.26.7')
    );
  });

  it('throws when CHANGELOG.md is missing (non-zero exit in CLI)', () => {
    root = makeRepo({ 'app.config.ts': APP_CONFIG });
    expect(() => generate({ repoRoot: root, logger: { error: jest.fn(), warn: jest.fn() } })).toThrow(
      /CHANGELOG\.md not found/
    );
  });

  it('throws when CHANGELOG.md has no valid sections', () => {
    root = makeRepo({
      'CHANGELOG.md': '# empty\nno sections here\n',
      'app.config.ts': APP_CONFIG,
    });
    expect(() => generate({ repoRoot: root, logger: { error: jest.fn(), warn: jest.fn() } })).toThrow(
      /no valid release entries/
    );
  });

  it('emits a truncated sidecar (≤500 bytes) when the body exceeds 500 bytes', () => {
    const big = `${'- very long bullet point, repeated many times.\n'.repeat(40)}`;
    const oversized = `## v1.2.3 — 2026-04-24
<!-- versionCode: 99 -->
${big}`;
    root = makeRepo({
      'CHANGELOG.md': oversized,
      'app.config.ts': APP_CONFIG,
    });
    generate({ repoRoot: root, logger: { error: jest.fn(), warn: jest.fn() } });
    const sidecar = readFileSync(
      join(
        root,
        'fdroid',
        'metadata',
        'com.persoack.cablesnap',
        'en-US',
        'changelogs',
        '99.txt'
      ),
      'utf8'
    );
    expect(Buffer.byteLength(sidecar, 'utf8')).toBeLessThanOrEqual(500);
    expect(sidecar).toMatch(/…see in-app release notes/);
  });

  it('derives the F-Droid output path dynamically from app.config.ts android.package (regression lock)', () => {
    root = makeRepo({
      'CHANGELOG.md': SIMPLE_CHANGELOG,
      'app.config.ts': APP_CONFIG_RENAMED,
    });
    const result = generate({
      repoRoot: root,
      logger: { error: jest.fn(), warn: jest.fn() },
    });
    expect(result.androidPackage).toBe('com.example.renamedapp');
    expect(result.sidecarsWritten[0]).toContain(
      join('fdroid', 'metadata', 'com.example.renamedapp', 'en-US', 'changelogs', '57.txt')
    );
  });

  it('writes the module file atomically (no tmp file left behind)', () => {
    root = makeRepo({
      'CHANGELOG.md': SIMPLE_CHANGELOG,
      'app.config.ts': APP_CONFIG,
    });
    generate({ repoRoot: root, logger: { error: jest.fn(), warn: jest.fn() } });
    const fs = require('fs');
    const libDir = join(root, 'lib');
    const leftovers = fs.readdirSync(libDir).filter((f: string) => f.includes('.tmp-'));
    expect(leftovers).toHaveLength(0);
  });

  it('regression-locks emitted path to the live app.config.ts android.package', () => {
    // Read the REAL app.config.ts so future package renames fail this test
    // rather than silently creating a dead F-Droid directory.
    const realAppConfig = readFileSync(
      join(__dirname, '..', '..', 'app.config.ts'),
      'utf8'
    );
    const liveId = readAndroidPackage(realAppConfig);
    expect(liveId).toMatch(/^[a-z][\w.]+$/);

    root = makeRepo({
      'CHANGELOG.md': SIMPLE_CHANGELOG,
      'app.config.ts': realAppConfig,
    });
    const result = generate({
      repoRoot: root,
      logger: { error: jest.fn(), warn: jest.fn() },
    });
    expect(result.androidPackage).toBe(liveId);
    expect(result.sidecarsWritten[0]).toContain(liveId);
  });
});
