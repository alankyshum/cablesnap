import { canSendGymPhoto } from "../../lib/ai/catalog";
import { boundedImageDimensions, GYM_PHOTO_MARKER, MAX_GYM_PHOTO_BYTES, validateGymPhotoBytes, validateGymPhotoMimeType, pickAndPrepareGymPhoto } from "../../lib/coach-gym-photo";
import { redactSentryBreadcrumb } from "../../lib/ai/redact";
import * as ImagePicker from "expo-image-picker";

describe("gym photo transport contracts", () => {
  it("requires both live tools and image capability", () => {
    expect(canSendGymPhoto({ supportedParameters: ["tools"], supportsImageInput: true })).toBe(true);
    expect(canSendGymPhoto({ supportedParameters: ["tools"], supportsImageInput: false })).toBe(false);
    expect(canSendGymPhoto({ supportedParameters: [], supportsImageInput: true })).toBe(false);
  });

  it("defines a bounded neutral durable marker and no raw photo representation", () => {
    expect(GYM_PHOTO_MARKER).toBe("[Gym photo uploaded]");
    expect(MAX_GYM_PHOTO_BYTES).toBeLessThanOrEqual(6 * 1024 * 1024);
    const safe = redactSentryBreadcrumb({ data: { photoUri: "file:///private/original.jpg", base64: "data:image/jpeg;base64,AAA" } });
    expect(JSON.stringify(safe)).not.toContain("file:///private");
    expect(JSON.stringify(safe)).not.toContain("base64,AAA");
  });

  it("rejects unsupported or missing media types with a typed recoverable error", () => {
    expect(() => validateGymPhotoMimeType("video/mp4")).toThrow();
    try { validateGymPhotoMimeType(null); } catch (error) { expect(error).toEqual({ kind: "photo_unsupported_type" }); }
  });

  it("downsized only oversized images and never upscales", () => {
    expect(boundedImageDimensions(1024, 768)).toEqual({ width: 1024, height: 768 });
    expect(boundedImageDimensions(4096, 2048)).toEqual({ width: 2048, height: 1024 });
  });

  it("enforces the output byte bound using Uint8Array.byteLength", () => {
    expect(() => validateGymPhotoBytes(new Uint8Array())).toThrow();
    expect(() => validateGymPhotoBytes(new Uint8Array(MAX_GYM_PHOTO_BYTES + 1))).toThrow();
    expect(() => validateGymPhotoBytes(new Uint8Array([1]))).not.toThrow();
  });

  it("short-circuits binary Sentry values without enumerating their bytes", () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const safe = redactSentryBreadcrumb({ data: bytes });
    expect(safe.data).toBe("[PHOTO_REDACTED]");
  });

  it("does not activate the synthetic fixture outside webdriver and uses the real picker path", async () => {
    const originalNavigator = global.navigator;
    Object.defineProperty(global, "navigator", { configurable: true, value: {} });
    (globalThis as typeof globalThis & { __E2E_GYM_PHOTO_FIXTURE__?: unknown }).__E2E_GYM_PHOTO_FIXTURE__ = { uri: "e2e://must-not-use" };
    const picker = jest.spyOn(ImagePicker, "requestMediaLibraryPermissionsAsync").mockResolvedValue({
      status: "denied" as never,
      granted: false,
      canAskAgain: true,
      expires: "never" as never,
    });
    await expect(pickAndPrepareGymPhoto()).rejects.toEqual({ kind: "photo_permission_denied" });
    expect(picker).toHaveBeenCalled();
    picker.mockRestore();
    delete (globalThis as typeof globalThis & { __E2E_GYM_PHOTO_FIXTURE__?: unknown }).__E2E_GYM_PHOTO_FIXTURE__;
    Object.defineProperty(global, "navigator", { configurable: true, value: originalNavigator });
  });
});
