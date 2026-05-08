/**
 * lib/form-clips-context.ts
 *
 * React context that propagates the boot-time backup-exclusion result to
 * form-clips UI components (FormVideoSheet, etc.) without prop-drilling.
 *
 * backupExclusionOk states:
 *   null  — check still pending (app just launched, awaiting async result)
 *   true  — form-clips/ directory is confirmed excluded from backup
 *   false — exclusion failed (iOS native module unavailable / permission error)
 *           → strong privacy banner MUST be suppressed; capture may proceed
 *             with a degraded banner informing the user of the limitation
 */
import { createContext, useContext } from "react";

export type FormClipsContextValue = {
  backupExclusionOk: boolean | null;
};

export const FormClipsContext = createContext<FormClipsContextValue>({
  backupExclusionOk: null,
});

/** Consume the backup-exclusion status set at app boot. */
export function useBackupExclusionStatus(): boolean | null {
  return useContext(FormClipsContext).backupExclusionOk;
}
