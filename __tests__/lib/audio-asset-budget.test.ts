/**
 * BLD-582 / AC-9: asset-budget regression lock for
 * assets/sounds/set-complete.wav.
 *
 * Enforces the PLAN-BLD-580 §Technical Approach constraints:
 *   - fileSize ≤ 30 KB
 *   - format === 1 (PCM only; reject encoded WAV wrappers)
 *   - NumChannels === 1 (mono)
 *   - SampleRate ≤ 48000
 *   - BitsPerSample === 16
 *   - durationMs ≤ 250
 *
 * Parses the WAV header in-file (no new devDep).
 */
import { readFileSync } from "fs";
import { join } from "path";

const WAV_PATH = join(__dirname, "..", "..", "assets", "sounds", "set-complete.wav");
const MAX_BYTES = 30 * 1024;
const MAX_DURATION_MS = 250;
const MAX_SAMPLE_RATE = 48000;

function readU16LE(buf: Buffer, off: number): number {
  return buf.readUInt16LE(off);
}
function readU32LE(buf: Buffer, off: number): number {
  return buf.readUInt32LE(off);
}

/**
 * Find the `data` sub-chunk size. The `fmt ` chunk may have trailing
 * bytes depending on format; scan for the ASCII marker rather than
 * hard-coding offset 40.
 */
function findDataChunkSize(buf: Buffer): number {
  for (let i = 12; i < buf.length - 8; i++) {
    if (
      buf[i] === 0x64 /* d */ &&
      buf[i + 1] === 0x61 /* a */ &&
      buf[i + 2] === 0x74 /* t */ &&
      buf[i + 3] === 0x61 /* a */
    ) {
      return readU32LE(buf, i + 4);
    }
  }
  throw new Error("data chunk not found in WAV");
}

describe("set-complete.wav asset budget (BLD-582 AC-9)", () => {
  const buf = readFileSync(WAV_PATH);

  it("file size ≤ 30 KB", () => {
    expect(buf.length).toBeLessThanOrEqual(MAX_BYTES);
  });

  it("is a RIFF/WAVE container", () => {
    expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("AudioFormat === 1 (PCM)", () => {
    expect(readU16LE(buf, 20)).toBe(1);
  });

  it("NumChannels === 1 (mono)", () => {
    expect(readU16LE(buf, 22)).toBe(1);
  });

  it("SampleRate ≤ 48000", () => {
    const sr = readU32LE(buf, 24);
    expect(sr).toBeGreaterThan(0);
    expect(sr).toBeLessThanOrEqual(MAX_SAMPLE_RATE);
  });

  it("BitsPerSample === 16", () => {
    expect(readU16LE(buf, 34)).toBe(16);
  });

  it("duration ≤ 250 ms", () => {
    const byteRate = readU32LE(buf, 28);
    expect(byteRate).toBeGreaterThan(0);
    const dataBytes = findDataChunkSize(buf);
    const durationMs = (dataBytes / byteRate) * 1000;
    expect(durationMs).toBeLessThanOrEqual(MAX_DURATION_MS);
  });
});
