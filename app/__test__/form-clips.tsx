/**
 * Dev-only visual-regression harness for FormLibraryTab (Form clips tab).
 *
 * Renders FormLibraryTab in isolation with a seed object supplied via
 * `window.__FORM_CLIPS_HARNESS__`. The harness bypasses the
 * `Platform.OS === "web"` guards inside FormLibraryTab (see the
 * `harnessActive` bypass introduced in FormLibraryTab.tsx for BLD-1123)
 * so the Record CTA is fully visible and assertable in Playwright.
 *
 * Guards (all three must hold — any false => component renders `null`):
 *   1. `__DEV__ === true` or `EXPO_PUBLIC_E2E_SCENARIO_SEED === "1"`
 *   2. `Platform.OS === "web"`                               (native targets never mount)
 *   3. `typeof window !== "undefined" && window.__FORM_CLIPS_HARNESS__ != null`
 *
 * Bundle hygiene: the only runtime reference to `__FORM_CLIPS_HARNESS__`
 * is inside a dev-or-audit branch. Ordinary production builds leave the flag
 * unset, so Metro strips the branch and the string does not appear in the prod
 * web bundle. Enforced by
 * `scripts/verify-scenario-hook-not-in-bundle.sh` (needle added for BLD-1123).
 *
 * Seed shape mirrors `FormClipsHarnessSeed` (defined below) and is written
 * by the Playwright spec via `page.addInitScript`.
 *
 * Refs: BLD-1105, BLD-1123.
 */
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { FormLibraryTab } from "@/components/session/FormLibraryTab";
import type { SetMediaRow } from "@/lib/db/form-clips";

type RecordTarget = { id: string; set_number: number; completed_at: number };

/** Typed seed contract for this harness. Must stay in sync with the spec. */
export type FormClipsHarnessSeed = {
  exerciseId: string;
  clips: SetMediaRow[];
  recordTarget: RecordTarget | null;
  recordDisabledReason: "no_sets" | "all_have_clips" | null;
};

export default function FormClipsHarness() {
  const [seed, setSeed] = useState<FormClipsHarnessSeed | null>(null);

  useEffect(() => {
    if (__DEV__ || process.env.EXPO_PUBLIC_E2E_SCENARIO_SEED === "1") {
      if (Platform.OS !== "web") return;
      if (typeof window === "undefined") return;

      const w = window as unknown as Record<string, unknown>;
      const s = w["__FORM_CLIPS_HARNESS__"] as FormClipsHarnessSeed | undefined;
      if (!s) return;

      let cancelled = false;
      (async () => {
        // No async setup needed — FormLibraryTab reads the window object
        // directly via harnessActive. setSeed just triggers render.
        await Promise.resolve();
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSeed(s);
        if (typeof document !== "undefined" && document.body) {
          document.body.dataset.testReady = "true";
        }
      })();

      return () => {
        cancelled = true;
      };
    }
  }, []);

  if (!__DEV__ && process.env.EXPO_PUBLIC_E2E_SCENARIO_SEED !== "1") return null;
  if (Platform.OS !== "web") return null;
  if (!seed) return null;

  return (
    <View style={{ flex: 1 }}>
      <FormLibraryTab exerciseId={seed.exerciseId} onClipsChanged={() => {}} />
    </View>
  );
}
