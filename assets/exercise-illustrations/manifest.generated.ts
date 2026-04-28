// @generated — do not edit. Regenerate via `npm run generate:exercise-images`.
//
// BLD-561: Exercise illustrations pilot manifest.
// Entries are deterministic-sorted by exercise id (localeCompare).
// Each entry must have ALL FOUR keys (start, end, startAlt, endAlt) or
// resolveExerciseImages() will return null per the both-or-neither rule.
//
// To populate: run `npm run generate:exercise-images` with OPENAI_API_KEY in env.
// See scripts/generate-exercise-images.ts and CURATION.md.
/* eslint-disable */

export type ManifestEntry = {
  start: number;
  end: number;
  startAlt: string;
  endAlt: string;
};

export const manifest: Record<string, ManifestEntry> = {
  "voltra-001": {
    start: require("./voltra-001/start.webp"),
    end: require("./voltra-001/end.webp"),
    startAlt: "The illustration depicts an individual lying supine on the floor with knees bent at approximately 90 degrees, grasping a cable handle positioned behind their head. As they curl their torso upward, their abdominal muscles are engaged, and their lower back remains pressed against the floor, while the cable path runs vertically from the low mount to the handle behind their head.",
    endAlt: "The illustration depicts a person lying supine on the floor with knees bent at approximately 90 degrees, holding a cable handle positioned behind their head. As they curl their torso upward, their abdominal muscles are engaged, and their lower back remains pressed against the floor, while the cable path extends downward from the low mount.",
  },
  "voltra-003": {
    start: require("./voltra-003/start.webp"),
    end: require("./voltra-003/end.webp"),
    startAlt: "In the half kneeling chop position, the individual is kneeling on their inside knee with the outside foot planted firmly in front, creating a stable base. The cable is pulled diagonally from a high attachment point across the body towards the opposite hip, with the torso rotating to engage the obliques, while maintaining a slight bend in the knees and a neutral spine throughout the movement.",
    endAlt: "The illustration depicts a person in a half-kneeling position with the inside knee on the ground and the outside foot planted forward, holding a cable handle attached to a high mount. The torso is rotated as the individual pulls the cable diagonally across the body from a high position to a low position, engaging the obliques, with the hips and knees at approximately 90-degree angles.",
  },
  "voltra-005": {
    start: require("./voltra-005/start.webp"),
    end: require("./voltra-005/end.webp"),
    startAlt: "The illustration depicts a person standing sideways to a cable machine with their left arm extended out to the side at shoulder height, while the right arm is positioned at their side. The torso is slightly rotated towards the right, creating a 45-degree angle at the waist, as the individual prepares to sweep their left arm across their body, engaging the obliques while maintaining a stable stance.",
    endAlt: "The illustration depicts an individual standing sideways to a cable machine with their left arm extended to the side, holding a handle attached at mid-mount. As they sweep their arm across their body, their torso rotates, creating a 45-degree angle at the shoulder and a slight bend at the waist, emphasizing the engagement of the obliques while resisting the cable's pull during the return motion.",
  },
  "voltra-007": {
    start: require("./voltra-007/start.webp"),
    end: require("./voltra-007/end.webp"),
    startAlt: "The illustration shows an individual in a staggered stance with their back facing the cable machine, holding a handle attached to a mid mount with one arm extended forward. The body is slightly rotated at the torso, with the pressing arm at approximately a 90-degree angle at the elbow, while the opposite arm is positioned for balance, emphasizing the spinal rotation during the movement.",
    endAlt: "A person stands in a staggered stance with their back to the cable machine, holding a handle attached to a mid-mount cable. The arm is extended forward at approximately a 45-degree angle while the torso is rotated, creating a dynamic twist through the spine, with the opposite knee slightly bent and the elbow at about a 90-degree angle during the press.",
  },
  "voltra-010": {
    start: require("./voltra-010/start.webp"),
    end: require("./voltra-010/end.webp"),
    startAlt: "The illustration depicts a person standing upright, facing a low pulley machine with a handle attached at the base. The individual's arm is fully extended at their side, and as they perform the bicep curl, their elbow remains close to their torso at approximately a 90-degree angle, while the handle is raised toward their shoulder, emphasizing the contraction of the bicep at the peak of the movement.",
    endAlt: "The illustration depicts a person standing upright with their left arm at their side, holding a handle attached to a low pulley. The elbow is flexed at approximately 90 degrees as the handle is curled upward towards the shoulder, with the bicep visibly contracted at the peak of the movement.",
  },
  "voltra-013": {
    start: require("./voltra-013/start.webp"),
    end: require("./voltra-013/end.webp"),
    startAlt: "The illustration depicts a person standing with their back to the cable machine, leaning slightly forward while gripping a rope attachment with both hands. Their arms are fully extended overhead, elbows straightened at approximately 180 degrees, and the cable is taut, indicating the path of resistance as they prepare to lower the rope behind their head for a triceps stretch.",
    endAlt: "A person is positioned facing away from the cable machine, leaning slightly forward with their feet shoulder-width apart. Their arms are extended overhead, elbows straightened, while gripping the rope attachment, and the cable runs vertically from the high mount to the rope, demonstrating a full triceps extension.",
  },
  "voltra-020": {
    start: require("./voltra-020/start.webp"),
    end: require("./voltra-020/end.webp"),
    startAlt: "The illustration depicts a person seated below a high-mounted cable machine, gripping a bar with a narrow, neutral grip. The individual is pulling the bar down towards their upper chest, with elbows bent at approximately 90 degrees and driving back, while maintaining a straight back and engaged core.",
    endAlt: "The illustration depicts a person seated below a high-mounted cable machine, gripping a bar with a narrow, neutral grip. The individual is pulling the bar down towards their upper chest, with elbows bent at approximately 90 degrees and driving back, while maintaining a straight back and engaged core.",
  },
  "voltra-029": {
    start: require("./voltra-029/start.webp"),
    end: require("./voltra-029/end.webp"),
    startAlt: "The illustration depicts a person in a staggered stance, standing with their back to the cable machine, holding a handle attached to a high mount. Their arms are extended forward in a hugging position at chest height, with elbows slightly bent, while the cable path runs diagonally downward from the attachment point to the handles.",
    endAlt: "The illustration depicts a person standing in a staggered stance with their back facing the cable machine, holding a handle attached to a high mount. The arms are extended forward in a hugging motion at approximately shoulder height, with elbows slightly bent, while the chest is engaged and squeezed at the midline.",
  },
  "voltra-035": {
    start: require("./voltra-035/start.webp"),
    end: require("./voltra-035/end.webp"),
    startAlt: "A person stands upright with their back facing the cable machine, holding a handle at chest level with elbows bent at approximately 90 degrees. The cable runs horizontally from the mid-mount attachment to the handle, and the individual is poised to press the handle forward, engaging the chest muscles while maintaining a stable core.",
    endAlt: "A person stands upright with their back facing the cable machine, holding a handle at chest level with elbows bent at approximately 90 degrees. As they press the handle forward in a straight line, their arms extend fully while maintaining a slight bend in the knees and a stable core, emphasizing the contraction in the chest muscles.",
  },
  "voltra-045": {
    start: require("./voltra-045/start.webp"),
    end: require("./voltra-045/end.webp"),
    startAlt: "The illustration shows a person standing sideways to a cable machine, with the ankle strap attached to the low mount on their far ankle. The standing leg is slightly bent at the knee, while the kicking leg is extended out to the side at approximately a 45-degree angle, creating tension in the cable as it resists the movement.",
    endAlt: "The illustration depicts a person standing sideways to the cable machine, with the ankle strap attached to their far ankle. The kicking leg is extended out to the side at approximately a 45-degree angle, while the standing leg remains slightly bent at the knee to maintain balance, showcasing a strong core and engaged glutes throughout the movement.",
  },
};
