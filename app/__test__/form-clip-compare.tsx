/**
 * Dev-only visual-regression harness for the FormLibraryTab "all_have_clips"
 * instructional banner scenario.
 *
 * Renders FormLibraryTab in the state where all completed sets already have a
 * clip attached (`recordDisabledReason = "all_have_clips"`), which shows the
 * instructional banner: "Replace or delete an existing clip below to record a
 * new one." This is the exact state audited in BLD-2723 (low-contrast banner
 * text on near-white background).
 *
 * Seed injection mirrors the existing form-clips.tsx harness pattern:
 * `window.__FORM_CLIPS_HARNESS__` is written in a useEffect so FormLibraryTab's
 * harnessActive bypass picks it up before the component reads it.
 *
 * Guards:
 *   1. `__DEV__ === true`        (not a prod build)
 *   2. `Platform.OS === "web"`   (native targets never mount)
 *
 * Metro DCE folds `__DEV__` to `false` in production builds and removes the
 * module, so no harness code reaches the prod bundle.
 *
 * Refs: BLD-2723.
 */
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { FormLibraryTab } from "@/components/session/FormLibraryTab";
import type { SetMediaRow } from "@/lib/db/form-clips";

// ---------------------------------------------------------------------------
// Static seed — "all have clips" state with several clips present.
// ---------------------------------------------------------------------------

const EXERCISE_ID = "harness-exercise-001";

const SEED_CLIPS: SetMediaRow[] = [
  {
    id: "clip-001",
    set_id: "set-001",
    exercise_id: EXERCISE_ID,
    kind: "video",
    rel_path: "form_clips/clip-001.mp4",
    created_at: Date.now() - 7 * 24 * 60 * 60 * 1000,
    duration_ms: 4200,
    size_bytes: null,
    width: null,
    height: null,
    pending_delete: 0,
  },
  {
    id: "clip-002",
    set_id: "set-002",
    exercise_id: EXERCISE_ID,
    kind: "video",
    rel_path: "form_clips/clip-002.mp4",
    created_at: Date.now() - 14 * 24 * 60 * 60 * 1000,
    duration_ms: 3800,
    size_bytes: null,
    width: null,
    height: null,
    pending_delete: 0,
  },
  {
    id: "clip-003",
    set_id: "set-003",
    exercise_id: EXERCISE_ID,
    kind: "video",
    rel_path: "form_clips/clip-003.mp4",
    created_at: Date.now() - 21 * 24 * 60 * 60 * 1000,
    duration_ms: 5100,
    size_bytes: null,
    width: null,
    height: null,
    pending_delete: 0,
  },
];

export default function FormClipCompareHarness() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!__DEV__) return;
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;

    // Inject seed so FormLibraryTab's harnessActive path fires.
    (window as unknown as Record<string, unknown>)["__FORM_CLIPS_HARNESS__"] = {
      exerciseId: EXERCISE_ID,
      clips: SEED_CLIPS,
      recordTarget: null,
      recordDisabledReason: "all_have_clips",
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);

    if (typeof document !== "undefined" && document.body) {
      document.body.dataset.testReady = "true";
    }
  }, []);

  if (!__DEV__) return null;
  if (Platform.OS !== "web") return null;
  if (!ready) return null;

  return (
    <View style={{ flex: 1 }}>
      <FormLibraryTab exerciseId={EXERCISE_ID} onClipsChanged={() => {}} />
    </View>
  );
}
