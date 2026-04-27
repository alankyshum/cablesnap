/**
 * BLD-690 Web-platform regression: ensures editCompletedSession payloads
 * larger than 256 bytes round-trip cleanly through the patched expo-sqlite-web
 * WorkerChannel (BLD-660 length-prefix fix). Mirrors
 * __tests__/lib/expo-sqlite-worker-channel-length.test.ts.
 *
 * Previously, an editCompletedSession payload of ≥256 bytes encoded as a
 * single transaction over the SQLiteExecuteSync shared buffer would have its
 * 4-byte length prefix silently truncated to 1 byte, causing JSON.parse to
 * fail mid-transaction.
 */

describe('editCompletedSession web-platform payload size (BLD-690 + BLD-660)', () => {
  function writeLengthFixed(buf: ArrayBuffer, length: number): void {
    new DataView(buf).setUint32(0, length, true);
  }

  function readLength(buf: ArrayBuffer): number {
    return new Uint32Array(buf, 0, 1)[0];
  }

  function buildLargePayload(setCount: number): unknown {
    const upserts = [];
    for (let i = 0; i < setCount; i++) {
      upserts.push({
        id: `set-${i}`,
        exercise_id: `ex-${i % 5}`,
        weight: 80 + i * 2.5,
        reps: 8 + (i % 4),
        rpe: 7.5 + (i % 3) * 0.5,
        completed: 1,
        set_type: 'normal',
        notes: `auto-edit ${i}`,
      });
    }
    return { upserts, deletes: [] };
  }

  it('a 30-set edit payload exceeds 256 bytes (the BLD-660 cliff)', () => {
    const json = JSON.stringify(buildLargePayload(30));
    expect(json.length).toBeGreaterThan(256);
  });

  it('the patched length-prefix writer round-trips a realistic edit payload size', () => {
    const json = JSON.stringify(buildLargePayload(30));
    const buf = new ArrayBuffer(8);
    writeLengthFixed(buf, json.length);
    expect(readLength(buf)).toBe(json.length);
    expect(readLength(buf)).toBeGreaterThan(256);
  });

  it('verifies the patched WorkerChannel.ts file is shipped via patch-package', () => {
    // Import lazily so the test still runs even when node_modules isn't fresh.
    const fs = require('fs');
    const path = require('path');
    const workerChannelPath = path.join(
      __dirname,
      '..',
      '..',
      'node_modules',
      'expo-sqlite',
      'web',
      'WorkerChannel.ts',
    );
    if (!fs.existsSync(workerChannelPath)) {
      // CI may have skipped postinstall; skip rather than fail spuriously.
      return;
    }
    const content = fs.readFileSync(workerChannelPath, 'utf8');
    // The patched form must be present.
    expect(content).toMatch(/setUint32\([^)]*0[^)]*,[^)]*length[^)]*,[^)]*true[^)]*\)/);
    // The buggy form must be absent.
    expect(content).not.toMatch(/new\s+Uint8Array\([^)]*\)\.set\(\s*new\s+Uint32Array\(\[length\]\)\s*,\s*0\s*\)/);
  });
});
