import { Alert, Platform } from "react-native";
import { getActiveSession, cancelSession } from "./db";

/**
 * Guard every "start a new workout" entry point against an already in-progress
 * session.
 *
 * The app's data model assumes a SINGLE active (completed_at IS NULL) workout at
 * a time — `handleRepeatWorkout` already enforced this, but the home start flows
 * (quick start, start-from-template, start-next, start-from-schedule) did not.
 * Without this guard a user who leaves a workout mid-session and taps a template
 * again silently creates a SECOND in-progress session. Because
 * `getActiveSession()` returns the most-recently-started session, the Resume
 * banner then points at the new (empty) session, so the earlier workout's
 * completed sets appear "reset" — and `cancelSession`'s orphan sweep can even
 * delete them outright. This guarantees ongoing workouts (and their logged sets)
 * are never shadowed or discarded without the user's explicit consent.
 *
 * @param onResume    navigate to the existing in-progress session (id)
 * @param onStartNew  create + navigate to the brand new session
 */
export async function guardedStartWorkout(opts: {
  onResume: (sessionId: string) => void;
  onStartNew: () => void | Promise<void>;
}): Promise<void> {
  const active = await getActiveSession();
  if (!active) {
    await opts.onStartNew();
    return;
  }

  const name = active.name?.trim() ? `"${active.name}"` : "your current workout";

  // Web has no 3-button dialog; fall back to a safe 2-way choice
  // (OK = Resume, Cancel = discard & start new).
  if (Platform.OS === "web") {
    const resume = window.confirm(
      `You have an unfinished workout (${name}).\n\nOK = Resume it.\nCancel = discard it and start a new one.`
    );
    if (resume) {
      opts.onResume(active.id);
    } else {
      await cancelSession(active.id);
      await opts.onStartNew();
    }
    return;
  }

  Alert.alert(
    "Workout in progress",
    `You have an unfinished workout (${name}). Resume it, or discard it to start a new one.`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Resume", onPress: () => opts.onResume(active.id) },
      {
        text: "Discard & Start New",
        style: "destructive",
        onPress: async () => {
          await cancelSession(active.id);
          await opts.onStartNew();
        },
      },
    ]
  );
}
