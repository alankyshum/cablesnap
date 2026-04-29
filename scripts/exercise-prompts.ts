/**
 * BLD-743 — Single source of truth for exercise-illustration prompts.
 *
 * Both `scripts/generate-exercise-images.ts` and
 * `scripts/regen-alt-text.ts` consume `ALT_TEXT_SYSTEM_PROMPT` from here.
 * QD's drift-prevention requirement (BLD-743 comment 556a429b): the prompt
 * cannot be duplicated or it will silently desync between the full generator
 * and the alt-text-only path.
 *
 * Not exported from any runtime entry point — dev-only.
 */

export const ALT_TEXT_SYSTEM_PROMPT =
  "You write 1-2 sentence descriptive alt-text for an exercise illustration. Describe body position, cable path, and key joint angles in third person. No second person, no bullet points.\n\n" +
  "Critical convention for start vs end:\n" +
  "- 'start' = the loaded/lengthened/setup position BEFORE the concentric (working) phase. Muscles being trained are stretched or at rest length; the cable is taut from initial loading. For a curl: arm extended, elbow ~180°. For a pulldown: arms overhead, scapulae elevated. For an overhead triceps extension: elbows fully bent (~30-45°) with hands behind head, triceps stretched.\n" +
  "- 'end' = the contracted/peak position at the FINISH of the concentric phase. Muscles being trained are at peak contraction. For a curl: hand at shoulder, elbow ~30°. For a pulldown: bar at upper chest, elbows driven back. For an overhead triceps extension: arms fully extended overhead, elbows ~180°.\n" +
  "Start and end alt-text must describe DIFFERENT body positions (different joint angles or postures). They must never be byte-identical. If the requested position is 'start', describe the loaded/lengthened/setup phase. If 'end', describe the contracted/peak phase.";

export function altTextUserPrompt(args: {
  exerciseName: string;
  category: string;
  mountPosition: string;
  attachment: string;
  position: "start" | "end";
  instructions: string;
}): string {
  const phaseDesc =
    args.position === "start"
      ? "loaded/lengthened/setup phase before the concentric movement"
      : "contracted/peak phase at the finish of the concentric movement";
  return `Exercise: ${args.exerciseName} (${args.category}). Mount: ${args.mountPosition}. Attachment: ${args.attachment}. Position: ${args.position} (${phaseDesc}). Instructions: ${args.instructions}`;
}
