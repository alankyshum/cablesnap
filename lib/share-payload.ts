/**
 * BLD-1169 (BLD-1168 Slice 3): Share-payload deserialiser.
 *
 * Handles decoding of session workout data received via share link, QR code,
 * or any out-of-band payload. The normaliseSetType boundary here ensures
 * forward-compatibility: if a newer client shares a payload containing an
 * unknown set_type value, older clients coerce it to "normal" rather than
 * crashing or propagating a bad value into the DB.
 */
import { normalizeSetType } from "./db/sets";
import type { SetType } from "./types";

export type SharePayloadSet = {
  set_type: SetType;
  reps: number | null;
  weight: number | null;
  rpe?: number | null;
  notes?: string;
};

/**
 * Deserialises a raw set object from a share payload, normalising the
 * set_type field so unknown future values are coerced to "normal".
 */
export function deserializeSharePayloadSet(raw: Record<string, unknown>): SharePayloadSet {
  return {
    set_type: normalizeSetType(raw.set_type),
    reps: typeof raw.reps === "number" ? raw.reps : null,
    weight: typeof raw.weight === "number" ? raw.weight : null,
    rpe: typeof raw.rpe === "number" ? raw.rpe : null,
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}
