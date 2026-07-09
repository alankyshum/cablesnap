import { getAppSetting, setAppSetting } from "./db/settings";
import { uuid } from "./uuid";

let cachedAnonUserId: string | null = null;

export async function getOrCreateAnonUserId(): Promise<string> {
  if (cachedAnonUserId) {
    return cachedAnonUserId;
  }
  const id = await getAppSetting("anon_user_id");
  if (id) {
    cachedAnonUserId = id;
    return id;
  }
  const newId = uuid();
  await setAppSetting("anon_user_id", newId);
  cachedAnonUserId = newId;
  return newId;
}

export function clearCachedAnonUserId(): void {
  cachedAnonUserId = null;
}
