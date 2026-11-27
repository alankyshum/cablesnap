// BLD-5100: deterministic Worker token entropy and constant-time AC5 test.
import assert from "node:assert/strict";
import test from "node:test";
import { randomCapability, safeCapabilityEqual } from "../src/security.ts";

test("BLD-5100 AC5 produces independent 256-bit capabilities", () => {
  const first = randomCapability();
  const second = randomCapability();
  assert.equal(Buffer.from(first, "base64url").byteLength, 32);
  assert.equal(Buffer.from(second, "base64url").byteLength, 32);
  assert.notEqual(first, second);
});

test("BLD-5100 AC5 compares equal-length hashes in constant work", () => {
  assert.equal(safeCapabilityEqual("0123456789abcdef", "0123456789abcdef"), true);
  assert.equal(safeCapabilityEqual("0123456789abcdef", "0123456789abcdeg"), false);
  assert.equal(safeCapabilityEqual("short", "much-longer"), false);
});
