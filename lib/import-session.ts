/**
 * Short-lived handoff for an import selected from Settings.
 *
 * Route params are URLs, so putting a backup's JSON in them both blocks
 * navigation and can exceed platform URL limits. This store intentionally has
 * no persistence: an import is only valid while the running app retains it.
 */
const sessions = new Map<string, string>();

export function createImportSession(rawBackup: string): string {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  sessions.set(token, rawBackup);
  return token;
}

export function getImportSession(token?: string): string | null {
  return token ? sessions.get(token) ?? null : null;
}

export function clearImportSession(token?: string): void {
  if (token) sessions.delete(token);
}
