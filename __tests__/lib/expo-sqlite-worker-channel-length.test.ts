/**
 * Regression test for BLD-660.
 *
 * `expo-sqlite/web/WorkerChannel.ts` uses a 4-byte length prefix at offset 0 of
 * the shared SQLiteExecuteSync result buffer. The original implementation wrote
 * the length via:
 *
 *     resultArray.set(new Uint32Array([length]), 0);  // ❌ truncates to 1 byte
 *
 * `Uint8Array.prototype.set(typedArray, offset)` does an element-wise typed
 * conversion — a single Uint32 element is converted to one Uint8 (`length &
 * 0xFF`) and written at offset 0. Any payload of 256 bytes or more has its
 * length prefix silently clipped, the reader decodes a truncated JSON slice,
 * and `JSON.parse` blows up with "Unexpected end of JSON input".
 *
 * This bites the post-workout summary screen (BLD-660) because
 * `getColumnNamesSync` against `workout_sets` (18 columns) emits a 258-byte
 * result payload — exactly one byte over the 256 cliff.
 *
 * The patch in `patches/expo-sqlite+55.0.15.patch` switches the writer to:
 *
 *     new DataView(resultArray.buffer).setUint32(0, length, true);
 *
 * which writes a real little-endian uint32. This test guards both the buggy
 * and fixed forms so the regression cannot return.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('expo-sqlite-web WorkerChannel length-prefix protocol (BLD-660)', () => {
  const workerChannelPath = join(
    __dirname,
    '..',
    '..',
    'node_modules',
    'expo-sqlite',
    'web',
    'WorkerChannel.ts',
  );

  // The raw protocol exercised by sendWorkerResult / invokeWorkerSync.
  function writeLength_buggy(buf: ArrayBuffer, length: number): void {
    new Uint8Array(buf).set(new Uint32Array([length]), 0);
  }

  function writeLength_fixed(buf: ArrayBuffer, length: number): void {
    new DataView(buf).setUint32(0, length, true);
  }

  function readLength(buf: ArrayBuffer): number {
    return new Uint32Array(buf, 0, 1)[0];
  }

  it('demonstrates the original truncation bug (Uint8Array.set + Uint32Array source)', () => {
    const buf = new ArrayBuffer(8);
    writeLength_buggy(buf, 258);
    // Original implementation truncates 258 -> 258 & 0xFF = 2.
    expect(readLength(buf)).toBe(2);
  });

  // QD verification gate (BLD-660): exercise every length boundary that any
  // truncating typed writer could mask — the Uint8 cliff at 256 (the actual
  // failure mode) plus the Uint16 cliff at 65536 (in case a future regression
  // swaps in `Uint8Array.set(new Uint16Array(...))`).
  it.each([
    [0],
    [1],
    [255],            // last value that fits in 1 byte
    [256],            // first value that hits the Uint8 cliff
    [257],
    [258],            // the actual workout_sets getColumnNamesSync payload
    [1024],
    [65535],          // last value that fits in 2 bytes
    [65536],          // first value that hits the Uint16 cliff
    [65537],
    [1024 * 1024 - 4], // upper end of the 1 MiB SharedArrayBuffer payload
  ])('round-trips length=%i through the fixed writer', (len) => {
    const buf = new ArrayBuffer(8);
    writeLength_fixed(buf, len);
    expect(readLength(buf)).toBe(len);
  });

  it('proves the buggy writer truncates the lengths we round-trip above', () => {
    // Confirms the round-trip cases above actually exercise failure modes the
    // original code had — i.e. the test isn't trivially passing because the
    // bug never bit at those sizes.
    const truncated = (len: number) => {
      const buf = new ArrayBuffer(8);
      writeLength_buggy(buf, len);
      return readLength(buf);
    };
    expect(truncated(256)).toBe(0);    // 256 & 0xFF = 0
    expect(truncated(257)).toBe(1);    // 257 & 0xFF = 1
    expect(truncated(258)).toBe(2);    // the workout_sets case
    expect(truncated(1024)).toBe(0);
    expect(truncated(65536)).toBe(0);
  });

  it('round-trips a JSON payload >256 bytes through the fixed length prefix', () => {
    const json = JSON.stringify({
      result: [
        'id',
        'session_id',
        'exercise_id',
        'set_number',
        'weight',
        'reps',
        'completed',
        'completed_at',
        'rpe',
        'notes',
        'link_id',
        'round',
        'training_mode',
        'tempo',
        'swapped_from_exercise_id',
        'set_type',
        'duration_seconds',
        'exercise_position',
        'bodyweight_modifier_kg',
      ],
    });
    expect(json.length).toBeGreaterThan(256); // sanity — must hit the bug class

    const bytes = new TextEncoder().encode(json);
    const sharedLikeBuf = new ArrayBuffer(1024 * 1024);
    const u8 = new Uint8Array(sharedLikeBuf);

    // Mimic the fixed sendWorkerResult path.
    writeLength_fixed(sharedLikeBuf, bytes.length);
    u8.set(bytes, 4);

    // Mimic the receiver path.
    const length = readLength(sharedLikeBuf);
    const copy = new Uint8Array(length);
    copy.set(new Uint8Array(sharedLikeBuf, 4, length));
    const decoded = new TextDecoder().decode(copy);

    // Must fully reconstruct the JSON — no truncation, no JSON.parse blow-up.
    expect(length).toBe(bytes.length);
    expect(decoded).toBe(json);
    expect(() => JSON.parse(decoded)).not.toThrow();
  });

  it('expo-sqlite WorkerChannel.ts on disk uses the fixed length writer (patch is applied)', () => {
    const src = readFileSync(workerChannelPath, 'utf8');
    // Strip line/block comments before scanning so we can reference the buggy
    // form in our explanatory comments without false-positives.
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    // Buggy form must be gone from real code.
    expect(stripped).not.toMatch(/resultArray\.set\(new Uint32Array\(\[length\]\), 0\)/);
    // Fixed form must be present (DataView setUint32 little-endian).
    expect(stripped).toMatch(/setUint32\(\s*0\s*,\s*length\s*,\s*true\s*\)/);
  });
});
