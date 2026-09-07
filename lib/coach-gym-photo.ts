import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import { getAppSetting, setAppSetting } from "./db/settings";
import type { AIError } from "./ai/errors";

export const GYM_PHOTO_MARKER = "[Gym photo uploaded]";
export const GYM_PHOTO_CONSENT_KEY = "ai_coach_gym_photo_consent_v1";
export const GYM_PHOTO_DISCLOSURE = "Gym photos are sent directly to your selected OpenRouter model using your key. Photos are resized locally, used only for this request, and never saved to chat or backups. OpenRouter/provider privacy policies apply.";
export const MAX_GYM_PHOTO_DIMENSION = 2048;
export const MAX_GYM_PHOTO_BYTES = 6 * 1024 * 1024;

export type PreparedGymPhoto = {
  readonly uri: string;
  readonly bytes: Uint8Array;
  readonly mediaType: "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly delete: () => void;
};

export function validateGymPhotoMimeType(mimeType: string | null | undefined): void {
  if (!mimeType || !["image/jpeg", "image/png", "image/webp", "image/heic"].includes(mimeType.toLowerCase())) {
    throw { kind: "photo_unsupported_type" } satisfies AIError;
  }
}

export function validateGymPhotoBytes(bytes: Uint8Array): void {
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_GYM_PHOTO_BYTES) {
    throw { kind: "photo_too_large" } satisfies AIError;
  }
}

/** Preserve small images; only downsize when the longest edge exceeds the cap. */
export function boundedImageDimensions(width: number, height: number): { width: number; height: number } {
  const largest = Math.max(width, height);
  if (!Number.isFinite(largest) || largest <= MAX_GYM_PHOTO_DIMENSION) return { width, height };
  const scale = MAX_GYM_PHOTO_DIMENSION / largest;
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

function mimeTypeFromUri(uri: string): string | null {
  const extension = uri.match(/\.([a-z0-9]+)(?:[?#].*)?$/i)?.[1]?.toLowerCase();
  if (!extension) return null;
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heic" } as Record<string, string>)[extension] ?? null;
}

export async function hasGymPhotoConsent(): Promise<boolean> {
  return (await getAppSetting(GYM_PHOTO_CONSENT_KEY)) === "accepted";
}

export async function acceptGymPhotoConsent(): Promise<void> {
  await setAppSetting(GYM_PHOTO_CONSENT_KEY, "accepted");
}

export async function pickAndPrepareGymPhoto(): Promise<PreparedGymPhoto> {
  // Playwright-only deterministic seam. It is intentionally unavailable to
  // real users and carries no user-selected media; the fixture is discarded by
  // the normal request cleanup path just like a native picker result.
  if (typeof navigator !== "undefined" && (navigator as Navigator & { webdriver?: boolean }).webdriver) {
    const fixture = (globalThis as typeof globalThis & { __E2E_GYM_PHOTO_FIXTURE__?: unknown }).__E2E_GYM_PHOTO_FIXTURE__;
    if (fixture && typeof fixture === "object") {
      const value = fixture as { uri?: unknown; width?: unknown; height?: unknown };
      const uri = typeof value.uri === "string" ? value.uri : "e2e:synthetic-gym-photo";
      const width = typeof value.width === "number" ? value.width : 640;
      const height = typeof value.height === "number" ? value.height : 480;
      const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x45, 0x32, 0x45, 0x00, 0xff, 0xd9]);
      validateGymPhotoBytes(bytes);
      return { uri, bytes, mediaType: "image/jpeg", width, height, delete: () => undefined };
    }
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (permission.status !== "granted") throw { kind: "photo_permission_denied" } satisfies AIError;
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  if (result.canceled || !result.assets?.[0]?.uri) throw { kind: "photo_cancelled" } satisfies AIError;
  validateGymPhotoMimeType(result.assets[0].mimeType ?? mimeTypeFromUri(result.assets[0].uri));
  return prepareGymPhoto(result.assets[0].uri);
}

export async function prepareGymPhoto(sourceUri: string): Promise<PreparedGymPhoto> {
  let output: File | null = null;
  try {
    const source = new File(sourceUri);
    const result = await ImageManipulator.manipulateAsync(
      source.uri,
      [],
      { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
    );
    let bounded = result;
    const largestDimension = Math.max(result.width, result.height);
    if (largestDimension > MAX_GYM_PHOTO_DIMENSION) {
      const firstPass = new File(result.uri);
      const dimensions = boundedImageDimensions(result.width, result.height);
      bounded = await ImageManipulator.manipulateAsync(
        result.uri,
        [{ resize: dimensions }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
      );
      try { firstPass.delete(); } catch { /* cache cleanup is best effort */ }
    }
    output = new File(new Directory(Paths.cache, "ai-coach").uri, `gym-photo-${Date.now()}.jpg`);
    const parent = new Directory(Paths.cache, "ai-coach");
    if (!parent.exists) parent.create({ intermediates: true });
    new File(bounded.uri).move(output);
    const bytes = await output.bytes();
    validateGymPhotoBytes(bytes);
    const uri = output.uri;
    return { uri, bytes, mediaType: "image/jpeg", width: bounded.width, height: bounded.height, delete: () => { try { output?.delete(); } catch { /* cleanup is best effort */ } } };
  } catch (error) {
    try { output?.delete(); } catch { /* cleanup is best effort */ }
    if (error && typeof error === "object" && "kind" in error) throw error;
    throw { kind: "photo_decode_failed" } satisfies AIError;
  }
}

export function cleanupGymPhoto(photo: PreparedGymPhoto | null | undefined): void {
  try { photo?.delete(); } catch { /* cleanup is best effort */ }
}
