import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// BLD-5100: retained only to delete the credential written by the removed
// AI Coach feature. This module must not be used for storage of new secrets.
export const LEGACY_PROVIDER_KEY = "openrouter_api_key";
const CLEANUP_MARKER = "legacy_provider_cleanup_complete_v1";
const WEB_PREFIX = "cablesnap.secure-store.";

function deleteWebCopies(key: string): void {
  globalThis.sessionStorage?.removeItem(`${WEB_PREFIX}${key}`);
  globalThis.localStorage?.removeItem(`${WEB_PREFIX}${key}`);
}

function readWebMarker(): string | null {
  return globalThis.localStorage?.getItem(`${WEB_PREFIX}${CLEANUP_MARKER}`)
    ?? globalThis.sessionStorage?.getItem(`${WEB_PREFIX}${CLEANUP_MARKER}`)
    ?? null;
}

function writeWebMarker(): void {
  globalThis.localStorage?.setItem(`${WEB_PREFIX}${CLEANUP_MARKER}`, "1");
  globalThis.sessionStorage?.setItem(`${WEB_PREFIX}${CLEANUP_MARKER}`, "1");
}

/** Idempotently removes the old AI provider credential exactly once per install. */
export async function cleanupLegacyProviderCredential(): Promise<void> {
  if (Platform.OS === "web") {
    if (readWebMarker() !== null) return;
    deleteWebCopies(LEGACY_PROVIDER_KEY);
    writeWebMarker();
    return;
  }

  if (await SecureStore.getItemAsync(CLEANUP_MARKER) !== null) return;
  await SecureStore.deleteItemAsync(LEGACY_PROVIDER_KEY);
  await SecureStore.setItemAsync(CLEANUP_MARKER, "1");
}
