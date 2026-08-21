import * as SecureStore from "expo-secure-store";

export const KEY_OPENROUTER = "openrouter_api_key";

const OPENROUTER_KEY_PATTERN = /^sk-or-v1-[a-f0-9]{64}$/;

/** Returns true only for the locally recognisable OpenRouter API key shape. */
export function keyFormat(value: unknown): value is string {
  return typeof value === "string" && OPENROUTER_KEY_PATTERN.test(value);
}

export async function get(): Promise<string | null> {
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

  try {
    await SecureStore.setItemAsync(KEY_OPENROUTER, value);
  } catch {
    throw new Error("Unable to save the OpenRouter key");
  }
}

async function deleteKey(): Promise<void> {
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
