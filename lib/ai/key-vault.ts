import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const KEY_OPENROUTER = "openrouter_api_key";

const OPENROUTER_KEY_PATTERN = /^sk-or-v1-[a-f0-9]{64}$/;

// expo-secure-store 55 ships no browser implementation (its web module is an
// empty native-module shim). Keep the web fallback deliberately namespaced and
// limited to this vault; native platforms continue to use SecureStore.
const WEB_STORAGE_PREFIX = "cablesnap.secure-store.";

function webStorageKey(key: string): string {
  return `${WEB_STORAGE_PREFIX}${key}`;
}

function webStorage(): Storage | null {
  if (Platform.OS !== "web") return null;
  if (typeof globalThis.localStorage === "undefined") return null;
  // Matches resolveDbName/pickImportBackup: only Playwright or a dev bundle
  // gets the plaintext browser fallback. Production users are never affected.
  const nav = typeof navigator !== "undefined"
    ? (navigator as Navigator & { webdriver?: boolean }) : undefined;
  if (!__DEV__ && !nav?.webdriver) return null;
  return globalThis.sessionStorage ?? globalThis.localStorage;
}

/** Returns true only for the locally recognisable OpenRouter API key shape. */
export function keyFormat(value: unknown): value is string {
  return typeof value === "string" && OPENROUTER_KEY_PATTERN.test(value);
}

export async function get(): Promise<string | null> {
  const storage = webStorage();
  if (storage) return storage.getItem(webStorageKey(KEY_OPENROUTER));
  try {
    return await SecureStore.getItemAsync(KEY_OPENROUTER);
  } catch {
    throw new Error("Unable to read the OpenRouter key");
  }
}

export async function set(value: string): Promise<void> {
  if (!keyFormat(value)) {
    throw new Error("Invalid OpenRouter key format");
  }

  const storage = webStorage();
  if (storage) {
    storage.setItem(webStorageKey(KEY_OPENROUTER), value);
    return;
  }

  try {
    await SecureStore.setItemAsync(KEY_OPENROUTER, value);
  } catch {
    throw new Error("Unable to save the OpenRouter key");
  }
}

async function deleteKey(): Promise<void> {
  const storage = webStorage();
  if (storage) {
    storage.removeItem(webStorageKey(KEY_OPENROUTER));
    return;
  }

  try {
    await SecureStore.deleteItemAsync(KEY_OPENROUTER);
  } catch {
    throw new Error("Unable to delete the OpenRouter key");
  }
}

export { deleteKey as delete };

export async function has(): Promise<boolean> {
  return (await get()) !== null;
}
