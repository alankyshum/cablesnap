/* eslint-disable max-lines */
import type { Exercise } from "./types";

/**
 * Community-sourced cable and bodyweight exercises.
 *
 * Cable exercises here are generic (non-Voltra) cable machine exercises.
 * Bodyweight exercises are equipment-free movements.
 *
 * IDs use deterministic format: "mw-cable-NNN" or "mw-bw-NNN"
 */

function cableExercise(
  num: number,
  ex: Omit<Exercise, "id" | "is_custom" | "equipment">
): Exercise {
  return {
    id: `mw-cable-${num.toString().padStart(3, "0")}`,
    ...ex,
    equipment: "cable",
    is_custom: false,
    is_voltra: false,
  };
}

function bwExercise(
  num: number,
  ex: Omit<Exercise, "id" | "is_custom" | "equipment">
): Exercise {
  return {
    id: `mw-bw-${num.toString().padStart(3, "0")}`,
    ...ex,
    equipment: "bodyweight",
    is_custom: false,
  };
}

function bbExercise(
  num: number,
  ex: Omit<Exercise, "id" | "is_custom" | "equipment">
): Exercise {
  return {
    id: `mw-bb-${num.toString().padStart(3, "0")}`,
    ...ex,
    equipment: "barbell",
    is_custom: false,
  };
}

// ─── Barbell Exercises ───────────────────────────────────────────────────────

const barbellExercises: Exercise[] = [
  bbExercise(1, {
    name: "Barbell Bent Over Row",
    category: "back",
    primary_muscles: ["back", "lats"],
    secondary_muscles: ["biceps", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Stand with feet shoulder-width apart, holding a barbell with an overhand grip.\n2. Hinge at the hips until your torso is roughly 45 degrees to the floor.\n3. Let the bar hang at arm's length below your shoulders.\n4. Pull the bar toward your lower chest, squeezing shoulder blades together.\n5. Lower the bar with control to full arm extension and repeat.",
  }),
  bbExercise(2, {
    name: "Barbell Squat",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Position a barbell across your upper back (high bar) or rear delts (low bar).\n2. Stand with feet shoulder-width apart, toes slightly turned out.\n3. Brace your core and descend by pushing hips back and bending knees.\n4. Lower until thighs are at least parallel to the floor.\n5. Drive through your heels to stand back up, keeping your chest up throughout.",
  }),
];

// ─── Cable Exercises (non-Voltra) ────────────────────────────────────────────

const cableExercises: Exercise[] = [
  // ── Chest ──
  cableExercise(1, {
    name: "Cable Iron Cross",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders"],
    difficulty: "advanced",
    instructions:
      "1. Set both pulleys to shoulder height.\n2. Stand centered, grab a handle in each hand.\n3. Extend arms out to the sides with a slight elbow bend.\n4. Squeeze chest to bring hands together in front of you.\n5. Hold the contracted position for one second, then return slowly.",
  }),
  cableExercise(2, {
    name: "Cable Pullover",
    category: "chest",
    primary_muscles: ["chest", "lats"],
    secondary_muscles: ["triceps"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the highest position with a straight bar or rope.\n2. Stand facing the machine, feet shoulder-width apart.\n3. Grip the attachment with arms extended overhead.\n4. Keep arms nearly straight and pull the bar down in an arc to your thighs.\n5. Squeeze lats and chest at the bottom, then return with control.",
  }),
  cableExercise(3, {
    name: "Low Cable Chest Fly",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders"],
    difficulty: "intermediate",
    instructions:
      "1. Set both pulleys to the lowest position.\n2. Grab a handle in each hand and step forward.\n3. With a slight bend in your elbows, sweep arms upward and inward.\n4. Bring hands together at chest height, squeezing the upper chest.\n5. Lower arms back down slowly along the same arc.",
  }),

  // ── Back ──
  cableExercise(4, {
    name: "Standing Cable Row",
    category: "back",
    primary_muscles: ["back", "lats"],
    secondary_muscles: ["biceps", "shoulders"],
    difficulty: "beginner",
    instructions:
      "1. Set the pulley to mid height and attach a V-bar or two handles.\n2. Stand facing the machine, feet shoulder-width apart, knees slightly bent.\n3. Pull the attachment toward your lower chest, squeezing shoulder blades together.\n4. Keep elbows close to your body throughout the pull.\n5. Extend arms back to the start with a controlled tempo.",
  }),
  cableExercise(5, {
    name: "Cable Rear Delt Fly",
    category: "back",
    primary_muscles: ["shoulders"],
    secondary_muscles: ["back", "traps"],
    difficulty: "intermediate",
    instructions:
      "1. Set both pulleys to shoulder height.\n2. Cross the cables — grab the left pulley with your right hand and vice versa.\n3. Stand centered with arms extended in front of you.\n4. Pull hands apart and back, squeezing rear delts and upper back.\n5. Return slowly to the starting position without letting the weight stack crash.",
  }),
  cableExercise(6, {
    name: "Cable Lat Prayer",
    category: "back",
    primary_muscles: ["lats"],
    secondary_muscles: ["biceps", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the highest position with a rope attachment.\n2. Kneel facing the machine about two feet back.\n3. Grab the rope with both hands, arms extended overhead.\n4. Pull elbows down toward your hips in a prayer motion, squeezing lats.\n5. Extend arms back up with control, feeling the stretch in your lats.",
  }),
  cableExercise(7, {
    name: "Cable 30 Degree Shrug",
    category: "back",
    primary_muscles: ["traps"],
    secondary_muscles: ["shoulders"],
    difficulty: "beginner",
    instructions:
      "1. Set the pulley to the lowest position.\n2. Stand facing the machine at a slight angle, about 30 degrees off-center.\n3. Grab the handle with one hand, arm fully extended.\n4. Shrug your shoulder straight up toward your ear.\n5. Hold the contraction for one second, then lower slowly. Complete all reps before switching sides.",
  }),

  // ── Shoulders ──
  cableExercise(8, {
    name: "Cable Shoulder Press",
    category: "shoulders",
    primary_muscles: ["shoulders"],
    secondary_muscles: ["triceps"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a handle attachment.\n2. Stand with your back to the machine, handle at shoulder height.\n3. Press the handle overhead until your arm is fully extended.\n4. Keep your core braced to prevent arching your back.\n5. Lower the handle back to shoulder height with control.",
  }),
  cableExercise(9, {
    name: "Cable Y Raise",
    category: "shoulders",
    primary_muscles: ["shoulders"],
    secondary_muscles: ["traps"],
    difficulty: "intermediate",
    instructions:
      "1. Set both pulleys to the lowest position.\n2. Cross the cables and grab the opposite handles.\n3. Stand upright, arms at your sides.\n4. Raise both arms up and outward in a Y shape, thumbs pointing up.\n5. Lift to just above shoulder height, then lower with control.",
  }),
  cableExercise(10, {
    name: "Cable Reverse Fly",
    category: "shoulders",
    primary_muscles: ["shoulders"],
    secondary_muscles: ["back", "traps"],
    difficulty: "intermediate",
    instructions:
      "1. Set both pulleys to chest height.\n2. Stand centered between the cable towers.\n3. Cross the cables and grab the opposite handles without an attachment.\n4. With arms slightly bent, pull hands outward and back until arms are in line with shoulders.\n5. Squeeze rear delts at full extension, then return slowly.",
  }),

  // ── Arms (Biceps) ──
  cableExercise(11, {
    name: "Overhead Cable Curl",
    category: "arms",
    primary_muscles: ["biceps"],
    secondary_muscles: [],
    difficulty: "intermediate",
    instructions:
      "1. Set both pulleys to shoulder height.\n2. Stand centered, grab a handle in each hand, arms extended to the sides.\n3. Curl your hands toward your ears by bending at the elbows.\n4. Squeeze biceps at peak contraction.\n5. Extend arms back out slowly, keeping upper arms parallel to the floor.",
  }),
  cableExercise(12, {
    name: "Cable Preacher Curl",
    category: "arms",
    primary_muscles: ["biceps"],
    secondary_muscles: ["forearms"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a straight bar.\n2. Position a preacher curl bench facing the cable machine.\n3. Rest upper arms on the pad, grip the bar with palms up.\n4. Curl the bar toward your shoulders, squeezing at the top.\n5. Lower the bar slowly until arms are nearly fully extended.",
  }),
  cableExercise(13, {
    name: "Cable Bayesian Curl",
    category: "arms",
    primary_muscles: ["biceps"],
    secondary_muscles: [],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a single handle.\n2. Stand facing away from the machine, one handle in hand.\n3. Let your arm hang behind your torso with the cable under tension.\n4. Curl the handle forward and up, keeping your elbow behind your body.\n5. Squeeze biceps at the top, then lower slowly to full extension.",
  }),
  cableExercise(14, {
    name: "Cable Twisting Curl",
    category: "arms",
    primary_muscles: ["biceps"],
    secondary_muscles: ["forearms"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a single handle.\n2. Stand facing the machine, handle in one hand, palm facing down.\n3. Curl the handle upward while rotating your wrist so palm faces up at the top.\n4. Squeeze biceps at peak contraction.\n5. Lower slowly while rotating wrist back to neutral. Switch arms after completing reps.",
  }),

  // ── Arms (Triceps) ──
  cableExercise(15, {
    name: "Reverse Grip Tricep Pushdown",
    category: "arms",
    primary_muscles: ["triceps"],
    secondary_muscles: ["forearms"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the highest position with a straight bar.\n2. Grip the bar with palms facing up (supinated grip).\n3. Keep elbows pinned to your sides.\n4. Push the bar down until arms are fully extended.\n5. Slowly let the bar rise back to chest level without flaring elbows.",
  }),
  cableExercise(16, {
    name: "Cable Tricep Kickback",
    category: "arms",
    primary_muscles: ["triceps"],
    secondary_muscles: [],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a single handle.\n2. Hinge at the hips with a flat back, one foot forward for balance.\n3. Hold the handle with elbow bent at 90 degrees, upper arm parallel to floor.\n4. Extend your forearm back until arm is straight, squeezing triceps.\n5. Return to 90 degrees slowly. Complete all reps before switching arms.",
  }),
  cableExercise(17, {
    name: "Cable Rope Overhead Tricep Extension",
    category: "arms",
    primary_muscles: ["triceps"],
    secondary_muscles: [],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a rope attachment.\n2. Face away from the machine, hold the rope behind your head.\n3. Step forward so the cable is under tension.\n4. Extend arms overhead by straightening elbows, keeping upper arms stationary.\n5. Lower the rope behind your head with control until elbows reach 90 degrees.",
  }),

  // ── Legs & Glutes ──
  cableExercise(18, {
    name: "Cable Pull-Through",
    category: "legs_glutes",
    primary_muscles: ["glutes", "hamstrings"],
    secondary_muscles: ["core"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a rope attachment.\n2. Straddle the cable, facing away from the machine.\n3. Hinge at the hips, letting the rope pass between your legs.\n4. Drive hips forward to standing, squeezing glutes at the top.\n5. Hinge back slowly, keeping spine neutral throughout.",
  }),
  cableExercise(19, {
    name: "Cable Hip Abduction",
    category: "legs_glutes",
    primary_muscles: ["glutes"],
    secondary_muscles: [],
    difficulty: "beginner",
    instructions:
      "1. Attach an ankle strap to the lowest pulley.\n2. Strap it to the ankle farthest from the machine.\n3. Stand sideways to the machine, holding the frame for balance.\n4. Lift your outside leg laterally away from your body.\n5. Raise to about 45 degrees, hold briefly, then lower with control.",
  }),
  cableExercise(20, {
    name: "Cable Hip Adduction",
    category: "legs_glutes",
    primary_muscles: ["glutes"],
    secondary_muscles: ["quads"],
    difficulty: "beginner",
    instructions:
      "1. Attach an ankle strap to the lowest pulley.\n2. Strap it to the ankle closest to the machine.\n3. Stand sideways, holding the frame for balance.\n4. Sweep the strapped leg across and in front of the standing leg.\n5. Return slowly to starting position. Complete all reps before switching.",
  }),
  cableExercise(21, {
    name: "Cable Leg Extension",
    category: "legs_glutes",
    primary_muscles: ["quads"],
    secondary_muscles: [],
    difficulty: "beginner",
    instructions:
      "1. Attach an ankle strap to the lowest pulley.\n2. Sit on a bench facing away from the machine, strap around one ankle.\n3. Start with knee bent at 90 degrees.\n4. Extend your lower leg forward until straight, squeezing the quad.\n5. Lower back to 90 degrees with control. Switch legs after completing reps.",
  }),
  cableExercise(22, {
    name: "Cable Step-Up",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position with a handle.\n2. Stand facing the machine with a stable box or bench behind you.\n3. Hold the handle at your chest.\n4. Step up onto the box one foot at a time, driving through your heel.\n5. Step down with control. Alternate leading legs each rep.",
  }),

  // ── Abs & Core ──
  cableExercise(23, {
    name: "Cable Pallof Press",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: [],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to chest height with a handle.\n2. Stand sideways to the machine, handle at your sternum with both hands.\n3. Press the handle straight out in front of your chest.\n4. Hold the extended position for two seconds, resisting the rotational pull.\n5. Return the handle to your chest. Complete all reps, then switch sides.",
  }),
  cableExercise(24, {
    name: "Cable Reverse Crunch",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: [],
    difficulty: "intermediate",
    instructions:
      "1. Set the pulley to the lowest position.\n2. Attach ankle straps and lie on your back with feet toward the machine.\n3. Bend knees to 90 degrees with the cable under tension.\n4. Curl your knees toward your chest, lifting hips off the floor.\n5. Lower hips back down slowly, maintaining tension on the abs.",
  }),
  cableExercise(25, {
    name: "Cable Side Bend",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: [],
    difficulty: "beginner",
    instructions:
      "1. Set the pulley to the lowest position with a single handle.\n2. Stand sideways to the machine, handle in the hand closest to the pulley.\n3. Stand upright with feet shoulder-width apart.\n4. Bend your torso away from the machine, feeling the oblique contraction.\n5. Return to upright slowly. Complete all reps before switching sides.",
  }),
];

// ─── Bodyweight Exercises ────────────────────────────────────────────────────

const bodyweightExercises: Exercise[] = [
  // ── Chest ──
  bwExercise(1, {
    name: "Push-Up",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders", "triceps", "core"],
    difficulty: "beginner",
    instructions:
      "1. Start in a high plank with hands slightly wider than shoulder-width.\n2. Keep your body in a straight line from head to heels.\n3. Lower your chest toward the floor by bending your elbows.\n4. Descend until your chest is just above the ground.\n5. Push back up to full arm extension, keeping core tight throughout.",
    progression_group: "push_up",
    progression_order: 3,
  }),
  bwExercise(2, {
    name: "Wide Push-Up",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders", "triceps"],
    difficulty: "beginner",
    instructions:
      "1. Start in a plank position with hands placed wider than shoulder-width.\n2. Point fingers slightly outward for wrist comfort.\n3. Lower your chest toward the floor, elbows flaring at about 45 degrees.\n4. Descend until chest nearly touches the ground.\n5. Press back up by squeezing your chest muscles.",
  }),
  bwExercise(3, {
    name: "Diamond Push-Up",
    category: "chest",
    primary_muscles: ["chest", "triceps"],
    secondary_muscles: ["shoulders", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Start in plank position with hands together, forming a diamond shape with thumbs and index fingers.\n2. Keep elbows close to your body.\n3. Lower your chest toward your hands.\n4. Descend until your chest touches or nearly touches your hands.\n5. Push back up, focusing on triceps and inner chest engagement.",
    progression_group: "push_up",
    progression_order: 4,
  }),
  bwExercise(4, {
    name: "Decline Push-Up",
    category: "chest",
    primary_muscles: ["chest", "shoulders"],
    secondary_muscles: ["triceps", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Place your feet on an elevated surface like a bench or step.\n2. Set your hands on the floor, shoulder-width apart.\n3. Form a straight line from head to heels.\n4. Lower your chest toward the floor, keeping elbows at 45 degrees.\n5. Press back up to full extension. This variation emphasizes the upper chest.",
  }),
  bwExercise(5, {
    name: "Incline Push-Up",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders", "triceps"],
    difficulty: "beginner",
    instructions:
      "1. Place your hands on an elevated surface like a bench, wider than shoulders.\n2. Extend your legs behind you with feet on the floor.\n3. Keep your body in a straight line.\n4. Lower your chest toward the bench by bending elbows.\n5. Push back up to full arm extension. Great for beginners building push-up strength.",
    progression_group: "push_up",
    progression_order: 2,
  }),
  bwExercise(6, {
    name: "Archer Push-Up",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders", "triceps", "core"],
    difficulty: "advanced",
    instructions:
      "1. Start in a wide push-up position, hands much wider than shoulders.\n2. Shift your weight to one side as you lower toward that hand.\n3. Keep the opposite arm nearly straight as you descend.\n4. Push back up through the working arm.\n5. Alternate sides each rep, or do all reps on one side before switching.",
    progression_group: "push_up",
    progression_order: 5,
  }),
  bwExercise(7, {
    name: "Chest Dip",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["triceps", "shoulders"],
    difficulty: "intermediate",
    instructions:
      "1. Grip parallel bars and lift yourself to a support position with arms straight.\n2. Lean your torso forward at about 30 degrees.\n3. Lower your body by bending elbows until upper arms are parallel to the floor.\n4. Keep elbows slightly flared to target chest.\n5. Press back up to full arm extension, squeezing chest at the top.",
    progression_group: "dip",
    progression_order: 2,
  }),

  // ── Back ──
  bwExercise(8, {
    name: "Inverted Row",
    category: "back",
    primary_muscles: ["back", "lats"],
    secondary_muscles: ["biceps", "core"],
    difficulty: "beginner",
    instructions:
      "1. Set a bar at waist height on a rack or use a sturdy table edge.\n2. Lie underneath with chest below the bar, grab it with an overhand grip.\n3. Keep your body straight from head to heels, heels on the ground.\n4. Pull your chest up to the bar by squeezing shoulder blades together.\n5. Lower yourself back down with control until arms are fully extended.",
    progression_group: "row",
    progression_order: 2,
  }),
  bwExercise(9, {
    name: "Superman",
    category: "back",
    primary_muscles: ["back"],
    secondary_muscles: ["glutes", "shoulders"],
    difficulty: "beginner",
    instructions:
      "1. Lie face down on the floor with arms extended overhead.\n2. Keep legs straight and together.\n3. Simultaneously lift your arms, chest, and legs off the floor.\n4. Hold the top position for two to three seconds, squeezing your lower back.\n5. Lower everything back to the floor with control.",
  }),
  bwExercise(10, {
    name: "Reverse Snow Angel",
    category: "back",
    primary_muscles: ["back", "shoulders"],
    secondary_muscles: ["traps"],
    difficulty: "beginner",
    instructions:
      "1. Lie face down with arms at your sides, palms facing down.\n2. Lift your chest and arms slightly off the floor.\n3. Sweep arms overhead in a wide arc, like making a snow angel.\n4. Keep arms off the ground throughout the movement.\n5. Reverse the arc back to your sides. That is one rep.",
  }),
  bwExercise(11, {
    name: "Pull-Up",
    category: "back",
    primary_muscles: ["lats", "back"],
    secondary_muscles: ["biceps", "forearms", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Hang from a pull-up bar with an overhand grip, hands slightly wider than shoulders.\n2. Engage your core and retract your shoulder blades.\n3. Pull your body upward until your chin clears the bar.\n4. Squeeze your lats at the top of the movement.\n5. Lower yourself slowly to a dead hang with full arm extension.",
    progression_group: "pull_up",
    progression_order: 5,
  }),
  bwExercise(12, {
    name: "Chin-Up",
    category: "back",
    primary_muscles: ["lats", "biceps"],
    secondary_muscles: ["back", "forearms"],
    difficulty: "intermediate",
    instructions:
      "1. Hang from a bar with an underhand grip, hands shoulder-width apart.\n2. Engage your core and pull your elbows down toward your ribs.\n3. Lift your body until your chin is above the bar.\n4. Focus on squeezing your biceps and lats.\n5. Lower slowly to full extension without swinging.",
    progression_group: "pull_up",
    progression_order: 4,
  }),

  // ── Shoulders ──
  bwExercise(13, {
    name: "Pike Push-Up",
    category: "shoulders",
    primary_muscles: ["shoulders"],
    secondary_muscles: ["triceps", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Start in a downward dog position — hips high, hands and feet on the floor.\n2. Walk your feet closer to your hands to increase the angle.\n3. Bend your elbows and lower the top of your head toward the floor.\n4. Press back up by straightening your arms.\n5. Keep hips high throughout to keep the load on your shoulders.",
  }),
  bwExercise(14, {
    name: "Handstand Push-Up",
    category: "shoulders",
    primary_muscles: ["shoulders"],
    secondary_muscles: ["triceps", "core", "traps"],
    difficulty: "advanced",
    instructions:
      "1. Kick up into a handstand against a wall with hands shoulder-width apart.\n2. Keep your body tight and core engaged.\n3. Bend your elbows to lower your head toward the floor.\n4. Descend until the top of your head lightly touches the ground.\n5. Press back up to full arm extension. Use a wall for balance.",
  }),

  // ── Arms (Triceps) ──
  bwExercise(15, {
    name: "Bench Dip",
    category: "arms",
    primary_muscles: ["triceps"],
    secondary_muscles: ["shoulders", "chest"],
    difficulty: "beginner",
    instructions:
      "1. Sit on the edge of a bench, hands gripping the edge beside your hips.\n2. Walk your feet out and lift your hips off the bench.\n3. Lower your body by bending elbows to about 90 degrees.\n4. Keep your back close to the bench as you descend.\n5. Push back up to full arm extension, squeezing triceps at the top.",
    progression_group: "dip",
    progression_order: 1,
  }),
  bwExercise(16, {
    name: "Bodyweight Tricep Extension",
    category: "arms",
    primary_muscles: ["triceps"],
    secondary_muscles: ["core"],
    difficulty: "intermediate",
    instructions:
      "1. Place your hands on a bar or elevated surface at about waist height.\n2. Step your feet back so your body is at an angle.\n3. Bend your elbows to lower your head below the bar.\n4. Keep elbows pointing forward, not flaring out.\n5. Extend your arms to push yourself back to the starting position.",
  }),

  // ── Abs & Core ──
  bwExercise(17, {
    name: "Plank",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["shoulders"],
    difficulty: "beginner",
    instructions:
      "1. Start face down, then prop yourself on forearms and toes.\n2. Keep elbows directly under shoulders.\n3. Maintain a straight line from head to heels.\n4. Engage your core by drawing your belly button toward your spine.\n5. Hold the position for the target duration without letting hips sag or pike.",
    progression_group: "plank",
    progression_order: 2,
  }),
  bwExercise(18, {
    name: "Side Plank",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["shoulders"],
    difficulty: "beginner",
    instructions:
      "1. Lie on one side, propped on your forearm with elbow under your shoulder.\n2. Stack your feet or stagger them for balance.\n3. Lift your hips until your body forms a straight line.\n4. Hold without letting your hips drop.\n5. Switch sides after the target hold time. Keep breathing steadily.",
    progression_group: "plank",
    progression_order: 3,
  }),
  bwExercise(19, {
    name: "Crunch",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: [],
    difficulty: "beginner",
    instructions:
      "1. Lie on your back with knees bent and feet flat on the floor.\n2. Place hands behind your head or across your chest.\n3. Curl your shoulders off the floor by contracting your abs.\n4. Lift until your shoulder blades clear the ground.\n5. Lower back down slowly. Avoid pulling on your neck.",
  }),
  bwExercise(20, {
    name: "Leg Raise",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["quads"],
    difficulty: "intermediate",
    instructions:
      "1. Lie flat on your back with legs straight and arms by your sides.\n2. Press your lower back into the floor.\n3. Raise both legs together until they point at the ceiling.\n4. Keep legs straight throughout the movement.\n5. Lower legs slowly, stopping just before they touch the floor.",
  }),
  bwExercise(21, {
    name: "Flutter Kick",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["quads"],
    difficulty: "beginner",
    instructions:
      "1. Lie on your back with legs straight, hands under your glutes for support.\n2. Lift both feet a few inches off the ground.\n3. Alternate kicking legs up and down in a small, rapid motion.\n4. Keep your lower back pressed to the floor.\n5. Continue for the target duration or rep count without resting feet on the ground.",
  }),
  bwExercise(22, {
    name: "Dead Bug",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: [],
    difficulty: "beginner",
    instructions:
      "1. Lie on your back with arms extended toward the ceiling and knees bent at 90 degrees.\n2. Press your lower back firmly into the floor.\n3. Simultaneously extend your right arm overhead and left leg straight out.\n4. Return to center, then repeat with the opposite arm and leg.\n5. Move slowly and maintain lower back contact with the floor throughout.",
  }),
  bwExercise(23, {
    name: "Hollow Body Hold",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: [],
    difficulty: "intermediate",
    instructions:
      "1. Lie on your back with arms extended overhead and legs straight.\n2. Press your lower back into the floor.\n3. Lift shoulders, arms, and legs a few inches off the ground.\n4. Your body should form a shallow banana shape.\n5. Hold this position, keeping abs engaged and lower back flat, for the target time.",
  }),
  bwExercise(24, {
    name: "Mountain Climber",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["shoulders", "quads"],
    difficulty: "beginner",
    instructions:
      "1. Start in a high plank position with wrists under shoulders.\n2. Drive one knee toward your chest.\n3. Quickly switch legs, extending the first leg back as the other comes forward.\n4. Continue alternating at a brisk pace.\n5. Keep hips level and core engaged throughout the movement.",
  }),
  bwExercise(25, {
    name: "V-Up",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["quads"],
    difficulty: "intermediate",
    instructions:
      "1. Lie flat on your back with arms extended overhead and legs straight.\n2. Simultaneously lift your torso and legs, reaching hands toward your toes.\n3. Your body should form a V shape at the top.\n4. Balance briefly on your glutes.\n5. Lower back down with control to the starting position.",
  }),
  bwExercise(26, {
    name: "Bicycle Crunch",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: [],
    difficulty: "beginner",
    instructions:
      "1. Lie on your back with hands behind your head and knees bent.\n2. Lift shoulders off the floor.\n3. Bring your right elbow toward your left knee while extending your right leg.\n4. Switch sides, bringing left elbow toward right knee.\n5. Continue alternating in a smooth pedaling motion without pulling on your neck.",
  }),

  // ── Legs & Glutes ──
  bwExercise(27, {
    name: "Bodyweight Squat",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "beginner",
    instructions:
      "1. Stand with feet shoulder-width apart, toes slightly turned out.\n2. Extend arms in front for balance.\n3. Push hips back and bend knees to lower into a squat.\n4. Descend until thighs are parallel to the floor or deeper.\n5. Drive through heels to stand back up to full extension.",
    progression_group: "squat",
    progression_order: 1,
  }),
  bwExercise(28, {
    name: "Bulgarian Split Squat",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Stand about two feet in front of a bench, facing away.\n2. Place the top of your rear foot on the bench behind you.\n3. Lower your body by bending the front knee until the thigh is parallel to the floor.\n4. Keep your front knee tracking over your toes.\n5. Push through the front heel to return to standing. Switch legs after completing reps.",
    progression_group: "squat",
    progression_order: 2,
  }),
  bwExercise(29, {
    name: "Forward Lunge",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "beginner",
    instructions:
      "1. Stand tall with feet hip-width apart.\n2. Step forward with one leg about two to three feet.\n3. Lower your body until both knees are at 90 degrees.\n4. Keep your front knee over your ankle, not past your toes.\n5. Push off the front foot to return to standing. Alternate legs.",
  }),
  bwExercise(30, {
    name: "Reverse Lunge",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "beginner",
    instructions:
      "1. Stand tall with feet hip-width apart.\n2. Step one foot backward about two to three feet.\n3. Lower until both knees reach 90 degrees.\n4. Keep your torso upright and core engaged.\n5. Push through the front heel to step back to standing. Alternate legs.",
  }),
  bwExercise(31, {
    name: "Jump Squat",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["calves", "hamstrings"],
    difficulty: "intermediate",
    instructions:
      "1. Stand with feet shoulder-width apart.\n2. Lower into a squat with thighs parallel to the floor.\n3. Explode upward, jumping as high as possible.\n4. Swing arms overhead for momentum.\n5. Land softly on the balls of your feet and immediately lower into the next squat.",
  }),
  bwExercise(32, {
    name: "Wall Sit",
    category: "legs_glutes",
    primary_muscles: ["quads"],
    secondary_muscles: ["glutes", "core"],
    difficulty: "beginner",
    instructions:
      "1. Stand with your back flat against a wall.\n2. Slide down until your thighs are parallel to the floor.\n3. Keep knees at 90 degrees, directly above your ankles.\n4. Press your lower back into the wall.\n5. Hold this position for the target duration without letting your hips rise.",
  }),
  bwExercise(33, {
    name: "Glute Bridge",
    category: "legs_glutes",
    primary_muscles: ["glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "beginner",
    instructions:
      "1. Lie on your back with knees bent and feet flat on the floor, hip-width apart.\n2. Place arms at your sides with palms down.\n3. Drive through your heels to lift your hips toward the ceiling.\n4. Squeeze your glutes at the top, forming a straight line from knees to shoulders.\n5. Lower hips back to the floor slowly.",
  }),
  bwExercise(34, {
    name: "Single Leg Glute Bridge",
    category: "legs_glutes",
    primary_muscles: ["glutes"],
    secondary_muscles: ["hamstrings", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Lie on your back with one knee bent, foot flat on the floor.\n2. Extend the other leg straight toward the ceiling.\n3. Drive through the planted heel to lift your hips.\n4. Squeeze your glute at the top, keeping hips level.\n5. Lower with control. Complete all reps on one side before switching.",
  }),
  bwExercise(35, {
    name: "Calf Raise",
    category: "legs_glutes",
    primary_muscles: ["calves"],
    secondary_muscles: [],
    difficulty: "beginner",
    instructions:
      "1. Stand on the edge of a step with heels hanging off.\n2. Hold a wall or railing for balance.\n3. Rise up onto your toes as high as possible.\n4. Hold the top position for one second, squeezing your calves.\n5. Lower slowly until your heels drop below the step for a full stretch.",
  }),
  bwExercise(36, {
    name: "Bodyweight Step-Up",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings"],
    difficulty: "beginner",
    instructions:
      "1. Stand facing a sturdy bench or box at knee height.\n2. Place one foot fully on top of the box.\n3. Drive through the top foot to step up, bringing the trailing leg up.\n4. Stand fully upright on the box.\n5. Step back down with the trailing leg first. Alternate leading legs.",
  }),
  bwExercise(37, {
    name: "Pistol Squat",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["hamstrings", "core", "calves"],
    difficulty: "advanced",
    instructions:
      "1. Stand on one leg with the other leg extended straight in front of you.\n2. Extend arms forward for counterbalance.\n3. Slowly lower into a single-leg squat, going as deep as possible.\n4. Keep the extended leg off the floor throughout.\n5. Drive through the standing heel to return to full extension.",
    progression_group: "squat",
    progression_order: 3,
  }),

  // ── Full Body (categorized by primary muscle) ──
  bwExercise(38, {
    name: "Burpee",
    category: "legs_glutes",
    primary_muscles: ["quads", "glutes"],
    secondary_muscles: ["chest", "shoulders", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Stand with feet shoulder-width apart.\n2. Drop into a squat and place hands on the floor.\n3. Jump or step feet back into a plank position.\n4. Perform a push-up, then jump feet back to your hands.\n5. Explode upward into a jump with arms overhead. Land softly and repeat.",
  }),
  bwExercise(39, {
    name: "Bear Crawl",
    category: "abs_core",
    primary_muscles: ["core", "shoulders"],
    secondary_muscles: ["quads", "triceps"],
    difficulty: "intermediate",
    instructions:
      "1. Start on all fours with knees hovering one inch above the ground.\n2. Keep your back flat and core braced.\n3. Move forward by simultaneously advancing the opposite hand and foot.\n4. Take small, controlled steps, keeping knees close to the ground.\n5. Crawl for the target distance or time, then reverse direction.",
  }),
  bwExercise(40, {
    name: "Nordic Curl",
    category: "legs_glutes",
    primary_muscles: ["hamstrings"],
    secondary_muscles: ["glutes", "core"],
    difficulty: "advanced",
    instructions:
      "1. Kneel on a pad with feet anchored under a heavy object or held by a partner.\n2. Cross arms over your chest or hold them ready to catch yourself.\n3. Slowly lower your torso toward the floor by straightening your knees.\n4. Use your hamstrings to control the descent as long as possible.\n5. Catch yourself at the bottom and push back up, or use hamstrings to pull back up.",
  }),
  // ── Isometric / Timed Exercises ──
  bwExercise(41, {
    name: "Plank",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["shoulders", "glutes"],
    difficulty: "beginner",
    instructions:
      "1. Start face down with forearms on the floor, elbows directly under shoulders.\n2. Lift your body off the floor, forming a straight line from head to heels.\n3. Engage your core and squeeze your glutes to maintain the position.\n4. Keep your neck neutral, looking at the floor.\n5. Hold for the target duration without letting your hips sag or pike.",
  }),
  bwExercise(42, {
    name: "Dead Hang",
    category: "back",
    primary_muscles: ["forearms", "lats"],
    secondary_muscles: ["shoulders", "biceps"],
    difficulty: "beginner",
    instructions:
      "1. Grip a pull-up bar with an overhand grip, hands shoulder-width apart.\n2. Step off the platform or let your feet hang freely.\n3. Relax your shoulders slightly while maintaining grip.\n4. Keep your core lightly engaged to prevent excessive swinging.\n5. Hang for the target duration, then step down safely.",
    progression_group: "pull_up",
    progression_order: 1,
  }),
  bwExercise(43, {
    name: "Wall Sit",
    category: "legs_glutes",
    primary_muscles: ["quads"],
    secondary_muscles: ["glutes", "calves"],
    difficulty: "beginner",
    instructions:
      "1. Stand with your back flat against a wall.\n2. Slide down until your thighs are parallel to the floor, knees at 90 degrees.\n3. Keep your back pressed against the wall and feet flat on the floor.\n4. Place your arms at your sides or on your thighs — not on your knees.\n5. Hold for the target duration, then stand up by pressing through your heels.",
  }),
  bwExercise(44, {
    name: "L-Sit",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["quads", "triceps", "shoulders"],
    difficulty: "advanced",
    instructions:
      "1. Sit on the floor between two parallettes, dip bars, or sturdy surfaces.\n2. Place your hands on the supports and straighten your arms to lift your body.\n3. Raise your legs until they are parallel to the floor, forming an L shape.\n4. Keep your legs straight and together, toes pointed.\n5. Hold for the target duration, keeping your core tight and arms locked.",
    progression_group: "l_sit",
    progression_order: 3,
  }),
  bwExercise(45, {
    name: "Farmer's Carry",
    category: "abs_core",
    primary_muscles: ["forearms", "core"],
    secondary_muscles: ["traps", "shoulders", "glutes"],
    difficulty: "beginner",
    instructions:
      "1. Pick up a heavy weight in each hand (dumbbells, kettlebells, or farmer's handles).\n2. Stand tall with shoulders back and down, chest up.\n3. Walk forward with controlled, even steps.\n4. Keep your core braced and avoid leaning to either side.\n5. Walk for the target duration or distance, then set the weights down carefully.",
  }),

  // ── BLD-913: Additional exercises to complete progression chains ──
  // push_up chain: Knee Push-Up (order 1), One-Arm Push-Up (order 6)
  bwExercise(46, {
    name: "Knee Push-Up",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders", "triceps"],
    difficulty: "beginner",
    instructions:
      "1. Start in a plank position with knees on the ground, hands shoulder-width apart.\n2. Keep your body in a straight line from head to knees.\n3. Lower your chest toward the floor by bending your elbows.\n4. Descend until your chest is just above the ground.\n5. Push back up to full arm extension. Cross ankles behind you for stability.",
    progression_group: "push_up",
    progression_order: 1,
  }),
  bwExercise(47, {
    name: "One-Arm Push-Up",
    category: "chest",
    primary_muscles: ["chest"],
    secondary_muscles: ["shoulders", "triceps", "core"],
    difficulty: "advanced",
    instructions:
      "1. Start in a wide push-up position, feet wider than shoulder-width.\n2. Place one hand behind your back.\n3. Lower your chest toward the floor with the working arm.\n4. Keep your hips as level as possible throughout the descent.\n5. Push back up to full extension. Complete all reps on one side before switching.",
    progression_group: "push_up",
    progression_order: 6,
  }),

  // pull_up chain: Scapular Pull-Up (order 2), Negative Pull-Up (order 3)
  bwExercise(48, {
    name: "Scapular Pull-Up",
    category: "back",
    primary_muscles: ["lats", "back"],
    secondary_muscles: ["forearms"],
    difficulty: "beginner",
    instructions:
      "1. Hang from a pull-up bar with an overhand grip, arms fully extended.\n2. Without bending your elbows, retract your shoulder blades downward.\n3. Pull your body up slightly by squeezing your shoulder blades together.\n4. Hold the top position for one to two seconds.\n5. Relax your shoulder blades to return to a dead hang. Repeat.",
    progression_group: "pull_up",
    progression_order: 2,
  }),
  bwExercise(49, {
    name: "Negative Pull-Up",
    category: "back",
    primary_muscles: ["lats", "back"],
    secondary_muscles: ["biceps", "forearms"],
    difficulty: "beginner",
    instructions:
      "1. Use a box or jump to get your chin above the pull-up bar.\n2. Grip the bar with an overhand grip, hands slightly wider than shoulders.\n3. Slowly lower your body over 3–5 seconds, resisting gravity.\n4. Focus on controlling the descent from top to full arm extension.\n5. Step back onto the box and repeat. Builds the strength needed for full pull-ups.",
    progression_group: "pull_up",
    progression_order: 3,
  }),

  // row chain: Incline Row (order 1), Elevated Feet Inverted Row (order 3), Front Lever Row (order 4)
  bwExercise(50, {
    name: "Incline Row",
    category: "back",
    primary_muscles: ["back", "lats"],
    secondary_muscles: ["biceps", "core"],
    difficulty: "beginner",
    instructions:
      "1. Set a bar at chest height on a rack.\n2. Grip the bar with an overhand grip, hands shoulder-width apart.\n3. Walk your feet forward until your body is at an angle, arms fully extended.\n4. Pull your chest up to the bar, squeezing shoulder blades together.\n5. Lower with control. The more upright your body, the easier the exercise.",
    progression_group: "row",
    progression_order: 1,
  }),
  bwExercise(51, {
    name: "Elevated Feet Inverted Row",
    category: "back",
    primary_muscles: ["back", "lats"],
    secondary_muscles: ["biceps", "core"],
    difficulty: "intermediate",
    instructions:
      "1. Set a bar at waist height and place your feet on a bench or box.\n2. Grip the bar with an overhand grip, body straight from head to heels.\n3. Pull your chest to the bar by squeezing shoulder blades together.\n4. The elevated feet increase difficulty compared to a standard inverted row.\n5. Lower with control to full arm extension and repeat.",
    progression_group: "row",
    progression_order: 3,
  }),
  bwExercise(52, {
    name: "Front Lever Row",
    category: "back",
    primary_muscles: ["lats", "back"],
    secondary_muscles: ["biceps", "core", "shoulders"],
    difficulty: "advanced",
    instructions:
      "1. Hang from a bar with an overhand grip, body horizontal and parallel to the ground.\n2. Maintain a tight core and straight body position throughout.\n3. Pull your body up toward the bar while maintaining the horizontal position.\n4. Squeeze your lats at the top of the movement.\n5. Lower with control back to the horizontal hang. Requires significant lat and core strength.",
    progression_group: "row",
    progression_order: 4,
  }),

  // dip chain: Ring Dip (order 3)
  bwExercise(53, {
    name: "Ring Dip",
    category: "chest",
    primary_muscles: ["chest", "triceps"],
    secondary_muscles: ["shoulders", "core"],
    difficulty: "advanced",
    instructions:
      "1. Mount gymnastics rings at an appropriate height and support yourself at the top.\n2. Turn the rings outward slightly at the top for stability.\n3. Lower your body by bending elbows until upper arms are parallel to the floor.\n4. Keep the rings close to your body and control any swaying.\n5. Press back up to full arm extension. Requires more stabilization than parallel bar dips.",
    progression_group: "dip",
    progression_order: 3,
  }),

  // plank chain: Knee Plank (order 1), Plank with Arm Reach (order 4), Dragon Flag (order 5)
  bwExercise(54, {
    name: "Knee Plank",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["shoulders"],
    difficulty: "beginner",
    instructions:
      "1. Start face down, then prop yourself on forearms and knees.\n2. Keep elbows directly under shoulders.\n3. Maintain a straight line from head to knees.\n4. Engage your core by drawing your belly button toward your spine.\n5. Hold the position for the target duration. Easier than a full plank — great for building core endurance.",
    progression_group: "plank",
    progression_order: 1,
  }),
  bwExercise(55, {
    name: "Plank with Arm Reach",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["shoulders"],
    difficulty: "intermediate",
    instructions:
      "1. Start in a standard forearm plank position.\n2. Maintain a straight line from head to heels.\n3. Lift one arm and extend it straight forward, holding for two seconds.\n4. Return to plank and repeat with the other arm.\n5. Keep hips level throughout — resist the urge to rotate. Alternate arms each rep.",
    progression_group: "plank",
    progression_order: 4,
  }),
  bwExercise(56, {
    name: "Dragon Flag",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["lats", "glutes"],
    difficulty: "advanced",
    instructions:
      "1. Lie on a bench, gripping the edges behind your head for support.\n2. Raise your entire body off the bench, pivoting on your upper back and shoulders.\n3. Keep your body straight and rigid like a flag.\n4. Slowly lower your body toward the bench without letting hips sag.\n5. Stop just above the bench and raise back up. Requires exceptional core strength.",
    progression_group: "plank",
    progression_order: 5,
  }),

  // l_sit chain: Seated Leg Raise (order 1), Tucked L-Sit (order 2), V-Sit (order 4)
  bwExercise(57, {
    name: "Seated Leg Raise",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["quads"],
    difficulty: "beginner",
    instructions:
      "1. Sit on the edge of a bench or between parallettes with hands gripping the surface.\n2. Keep your back straight and core engaged.\n3. Lift both legs together until they are parallel to the floor.\n4. Hold for one to two seconds at the top.\n5. Lower legs with control. Builds the hip flexor and core strength needed for L-sit.",
    progression_group: "l_sit",
    progression_order: 1,
  }),
  bwExercise(58, {
    name: "Tucked L-Sit",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["triceps", "shoulders"],
    difficulty: "intermediate",
    instructions:
      "1. Sit between parallettes or on dip bars with hands on the supports.\n2. Straighten your arms to lift your body off the ground.\n3. Tuck your knees toward your chest, thighs parallel to the floor.\n4. Hold this tucked position for the target duration.\n5. Lower with control. Easier than a full L-sit — gradually extend legs as you get stronger.",
    progression_group: "l_sit",
    progression_order: 2,
  }),
  bwExercise(59, {
    name: "V-Sit",
    category: "abs_core",
    primary_muscles: ["core"],
    secondary_muscles: ["quads", "triceps", "shoulders"],
    difficulty: "advanced",
    instructions:
      "1. Sit between parallettes or on dip bars with hands on the supports.\n2. Straighten your arms to lift your body off the ground.\n3. Raise your legs past parallel, forming a V shape with your torso.\n4. Keep legs straight and together, toes pointed.\n5. Hold for the target duration. Requires greater hip flexor flexibility and core strength than an L-sit.",
    progression_group: "l_sit",
    progression_order: 4,
  }),
];

export function communityExercises(): Exercise[] {
  return [...cableExercises, ...bodyweightExercises, ...barbellExercises];
}
