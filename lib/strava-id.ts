/** Prefer Strava's lossless string ID; legacy numeric IDs must still be exact. */
export function stravaId(value: { id?: unknown; id_str?: unknown } | null | undefined): string | null {
  if (!value) return null;
  if (value.id_str != null) return typeof value.id_str === "string" && value.id_str ? value.id_str : null;
  if (typeof value.id === "string" && value.id) return value.id;
  if (typeof value.id === "number" && Number.isSafeInteger(value.id)) return String(value.id);
  return null;
}
