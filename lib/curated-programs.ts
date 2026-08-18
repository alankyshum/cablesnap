/**
 * Curated Programs Library — BLD-1000 v1.
 *
 * Static, license-clean catalog of named, proven training programs shipped
 * with CableSnap. v1 is RR-only (r/bodyweightfitness Recommended Routine).
 *
 * Curated programs:
 *   - Are seeded into `workout_templates` and `programs` with `is_curated=1`
 *     by `lib/db/seed.ts:upsertCuratedTemplates`/`upsertCuratedPrograms`.
 *   - Are NOT user-deletable in v1 (soft-delete guard in
 *     `lib/programs.ts:softDeleteProgram` checks `is_curated=0`). Users hide
 *     them via the `Mine` filter chip on the Programs surface.
 *   - Are user-editable in place. Subsequent seed runs do NOT issue the
 *     BLD-467 canonical-repair UPDATE on curated rows (the gate at
 *     `lib/db/seed.ts:upsertTemplates` excludes curated rows), so user
 *     changes to `target_sets` / `target_reps` / `rest_seconds` / `set_types`
 *     persist across cold launches and across future `STARTER_VERSION` bumps.
 *
 * License attribution
 *   The Recommended Routine is adapted from the r/bodyweightfitness wiki:
 *     https://www.reddit.com/r/bodyweightfitness/wiki/kb/recommended_routine
 *   The original wiki text is licensed CC-BY-SA 3.0. Movement names and
 *   structural data (sets/reps/exercises) are not copyrightable. The
 *   description prose below is paraphrased — no block is verbatim from the
 *   wiki. The detail screen renders an attribution footer with a tappable
 *   source link when a program has `is_curated=1`. See `app/program/[id].tsx`.
 *
 * Bundle hygiene
 *   Target ≤ 8 KB gzipped for this module in v1. RR alone is well within
 *   that envelope. Future programs (5×5, GZCLP, etc.) are out of scope —
 *   parked to v2.
 */
import type { StarterTemplate } from "./starter-templates";

/**
 * A curated program shipped by CableSnap.
 *
 * Distinct from `StarterProgram` because curated programs additionally seed
 * `program_schedule` rows (one per `schedule[]` entry) so the user sees the
 * program's recommended weekday placement on first launch. Starters do not
 * write `program_schedule` (they have no day-of-week mapping). Keeping the
 * types separate ensures starter behavior is unchanged.
 */
export type CuratedProgram = {
  id: string;
  name: string;
  description: string;
  /** Each entry binds a calendar day (0=Sun..6=Sat) to a workout template. */
  schedule: { day_of_week: number; template_id: string }[];
  /** Mirrors `StarterProgram.days` — drives `program_days` row insertion. */
  days: { id: string; label: string; template_id: string }[];
  /** Source URL surfaced in the program detail screen attribution footer. */
  source_url: string;
  /** Source attribution name (paired with CC-BY-SA 3.0 marker in UI). */
  source_name: string;
};

// ─── Recommended Routine (RR) ───────────────────────────────────────────────
// Six bedrock progressions, full-body, 3 days/week. The wiki recommends
// Monday / Wednesday / Friday placement; the user can reschedule freely.
//
// Movement IDs map to bodyweight exercises seeded in `lib/seed-community.ts`:
//   squat:        mw-bw-027 (Bodyweight Squat)
//   hinge/glutes: mw-bw-033 (Glute Bridge)
//   push:         mw-bw-001 (Push-Up)
//   vertical pull: mw-bw-049 (Negative Pull-Up) — accessible entry point
//   horizontal pull: mw-bw-008 (Inverted Row)
//   anti-extension: mw-bw-017 (Plank)
//
// The build-time test `__tests__/lib/db/seed-curated.test.ts` enforces that
// every exercise_id below resolves in the seed exercise list. The runtime
// defense in `upsertCuratedTemplates` skips any row whose exercise_id has
// gone missing and writes one warning to `error_log`.

const RR_TEMPLATE_ID = "curated-rr-tpl-1";
const RR_PROGRAM_ID = "curated-rr-prog-1";

export const CURATED_TEMPLATES: StarterTemplate[] = [
  {
    id: RR_TEMPLATE_ID,
    name: "Recommended Routine",
    difficulty: "beginner",
    duration: "~45 min",
    exercises: [
      // Squat progression — start with bodyweight squat, advance to split-squat
      // (mw-bw-028) or pistol squat (mw-bw-037) as strength allows. The user
      // edits this row in place to swap in the next progression.
      {
        id: "curated-rr-te-1-squat",
        exercise_id: "mw-bw-027",
        target_sets: 3,
        target_reps: "5-8",
        rest_seconds: 90,
      },
      // Hip hinge / posterior chain — start with glute bridge, advance to
      // single-leg glute bridge (mw-bw-034) for added unilateral demand.
      {
        id: "curated-rr-te-2-hinge",
        exercise_id: "mw-bw-033",
        target_sets: 3,
        target_reps: "10-12",
        rest_seconds: 90,
      },
      // Horizontal push — push-up. Knee push-up (mw-bw-046) is the
      // accessible entry; one-arm push-up (mw-bw-047) is the long-term goal.
      {
        id: "curated-rr-te-3-push",
        exercise_id: "mw-bw-001",
        target_sets: 3,
        target_reps: "5-8",
        rest_seconds: 90,
      },
      // Vertical pull — negative pull-up is the realistic starting point
      // for users who cannot yet do a full pull-up (mw-bw-011). Scapular
      // pull-up (mw-bw-048) and dead hang (mw-bw-042) are earlier rungs.
      {
        id: "curated-rr-te-4-vertical-pull",
        exercise_id: "mw-bw-049",
        target_sets: 3,
        target_reps: "3-5",
        rest_seconds: 90,
      },
      // Horizontal pull — inverted row. Incline row (mw-bw-050) is the
      // easier entry; elevated-feet inverted row (mw-bw-051) is harder.
      {
        id: "curated-rr-te-5-horizontal-pull",
        exercise_id: "mw-bw-008",
        target_sets: 3,
        target_reps: "5-8",
        rest_seconds: 90,
      },
      // Anti-extension core — plank for time. Knee plank (mw-bw-054) is
      // the accessible entry; side plank (mw-bw-018) is a complementary
      // anti-lateral-flexion variant.
      {
        id: "curated-rr-te-6-anti-extension",
        exercise_id: "mw-bw-017",
        target_sets: 3,
        target_reps: "30-60s",
        rest_seconds: 60,
      },
    ],
  },
  {
    id: "curated-sl-tpl-a",
    name: "StrongLifts 5×5 - Workout A",
    difficulty: "intermediate",
    duration: "~45 min",
    exercises: [
      {
        id: "curated-sl-te-squat-a",
        exercise_id: "mw-bb-002",
        target_sets: 5,
        target_reps: "5",
        rest_seconds: 180,
      },
      {
        id: "curated-sl-te-bench-a",
        exercise_id: "mw-bb-003",
        target_sets: 5,
        target_reps: "5",
        rest_seconds: 180,
      },
      {
        id: "curated-sl-te-row-a",
        exercise_id: "mw-bb-001",
        target_sets: 5,
        target_reps: "5",
        rest_seconds: 180,
      },
    ],
  },
  {
    id: "curated-sl-tpl-b",
    name: "StrongLifts 5×5 - Workout B",
    difficulty: "intermediate",
    duration: "~45 min",
    exercises: [
      {
        id: "curated-sl-te-squat-b",
        exercise_id: "mw-bb-002",
        target_sets: 5,
        target_reps: "5",
        rest_seconds: 180,
      },
      {
        id: "curated-sl-te-ohp-b",
        exercise_id: "mw-bb-004",
        target_sets: 5,
        target_reps: "5",
        rest_seconds: 180,
      },
      {
        id: "curated-sl-te-deadlift-b",
        exercise_id: "mw-bb-005",
        target_sets: 1,
        target_reps: "5",
        rest_seconds: 180,
      },
    ],
  },
  {
    id: "curated-gzclp-tpl-d1",
    name: "GZCLP - Day 1 (Workout A1)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-gzclp-te-squat-d1-t1",
        exercise_id: "mw-bb-002",
        target_sets: 5,
        target_reps: "3+",
        rest_seconds: 180,
      },
      {
        id: "curated-gzclp-te-bench-d1-t2",
        exercise_id: "mw-bb-003",
        target_sets: 3,
        target_reps: "10",
        rest_seconds: 120,
      },
      {
        id: "curated-gzclp-te-row-d1-t3",
        exercise_id: "mw-bb-001",
        target_sets: 3,
        target_reps: "15+",
        rest_seconds: 90,
      },
    ],
  },
  {
    id: "curated-gzclp-tpl-d2",
    name: "GZCLP - Day 2 (Workout B1)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-gzclp-te-ohp-d2-t1",
        exercise_id: "mw-bb-004",
        target_sets: 5,
        target_reps: "3+",
        rest_seconds: 180,
      },
      {
        id: "curated-gzclp-te-deadlift-d2-t2",
        exercise_id: "mw-bb-005",
        target_sets: 3,
        target_reps: "10",
        rest_seconds: 120,
      },
      {
        id: "curated-gzclp-te-row-d2-t3",
        exercise_id: "mw-bb-001",
        target_sets: 3,
        target_reps: "15+",
        rest_seconds: 90,
      },
    ],
  },
  {
    id: "curated-gzclp-tpl-d3",
    name: "GZCLP - Day 3 (Workout A2)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-gzclp-te-bench-d3-t1",
        exercise_id: "mw-bb-003",
        target_sets: 5,
        target_reps: "3+",
        rest_seconds: 180,
      },
      {
        id: "curated-gzclp-te-squat-d3-t2",
        exercise_id: "mw-bb-002",
        target_sets: 3,
        target_reps: "10",
        rest_seconds: 120,
      },
      {
        id: "curated-gzclp-te-row-d3-t3",
        exercise_id: "mw-bb-001",
        target_sets: 3,
        target_reps: "15+",
        rest_seconds: 90,
      },
    ],
  },
  {
    id: "curated-gzclp-tpl-d4",
    name: "GZCLP - Day 4 (Workout B2)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-gzclp-te-deadlift-d4-t1",
        exercise_id: "mw-bb-005",
        target_sets: 5,
        target_reps: "3+",
        rest_seconds: 180,
      },
      {
        id: "curated-gzclp-te-ohp-d4-t2",
        exercise_id: "mw-bb-004",
        target_sets: 3,
        target_reps: "10",
        rest_seconds: 120,
      },
      {
        id: "curated-gzclp-te-row-d4-t3",
        exercise_id: "mw-bb-001",
        target_sets: 3,
        target_reps: "15+",
        rest_seconds: 90,
      },
    ],
  },
  {
    id: "curated-531bbb-tpl-d1",
    name: "5/3/1 BBB - Day 1 (Overhead Press)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-531bbb-te-ohp-d1-main",
        exercise_id: "mw-bb-004",
        target_sets: 3,
        target_reps: "5+",
        rest_seconds: 180,
      },
      {
        id: "curated-531bbb-te-ohp-d1-bbb",
        exercise_id: "mw-bb-004",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
      {
        id: "curated-531bbb-te-row-d1-acc",
        exercise_id: "mw-bb-001",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
    ],
  },
  {
    id: "curated-531bbb-tpl-d2",
    name: "5/3/1 BBB - Day 2 (Deadlift)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-531bbb-te-deadlift-d2-main",
        exercise_id: "mw-bb-005",
        target_sets: 3,
        target_reps: "5+",
        rest_seconds: 180,
      },
      {
        id: "curated-531bbb-te-deadlift-d2-bbb",
        exercise_id: "mw-bb-005",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
      {
        id: "curated-531bbb-te-abs-d2-acc",
        exercise_id: "mw-bw-057",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
    ],
  },
  {
    id: "curated-531bbb-tpl-d3",
    name: "5/3/1 BBB - Day 3 (Bench Press)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-531bbb-te-bench-d3-main",
        exercise_id: "mw-bb-003",
        target_sets: 3,
        target_reps: "5+",
        rest_seconds: 180,
      },
      {
        id: "curated-531bbb-te-bench-d3-bbb",
        exercise_id: "mw-bb-003",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
      {
        id: "curated-531bbb-te-row-d3-acc",
        exercise_id: "mw-bb-001",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
    ],
  },
  {
    id: "curated-531bbb-tpl-d4",
    name: "5/3/1 BBB - Day 4 (Squat)",
    difficulty: "intermediate",
    duration: "~60 min",
    exercises: [
      {
        id: "curated-531bbb-te-squat-d4-main",
        exercise_id: "mw-bb-002",
        target_sets: 3,
        target_reps: "5+",
        rest_seconds: 180,
      },
      {
        id: "curated-531bbb-te-squat-d4-bbb",
        exercise_id: "mw-bb-002",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
      {
        id: "curated-531bbb-te-abs-d4-acc",
        exercise_id: "mw-bw-057",
        target_sets: 5,
        target_reps: "10",
        rest_seconds: 90,
      },
    ],
  },
];

export const CURATED_PROGRAMS: CuratedProgram[] = [
  {
    id: RR_PROGRAM_ID,
    name: "r/bodyweightfitness Recommended Routine",
    // Paraphrased — not verbatim from the wiki. See file header §License.
    description:
      "A full-body bodyweight routine built around six fundamental movement patterns: squat, hip hinge, horizontal push, vertical pull, horizontal pull, and an anti-extension core hold. Run three non-consecutive days per week. Each movement has an ordered list of progressions — start at the variation you can perform with good form, edit the exercise on this template when you are ready to advance.",
    days: [
      { id: "curated-rr-day-1", label: "Day A", template_id: RR_TEMPLATE_ID },
      { id: "curated-rr-day-2", label: "Day B", template_id: RR_TEMPLATE_ID },
      { id: "curated-rr-day-3", label: "Day C", template_id: RR_TEMPLATE_ID },
    ],
    schedule: [
      // Mon / Wed / Fri default placement. App convention: 0=Mon…6=Sun
      // (see lib/notifications.ts — "our day_of_week: 0=Mon..6=Sun").
      { day_of_week: 0, template_id: RR_TEMPLATE_ID },
      { day_of_week: 2, template_id: RR_TEMPLATE_ID },
      { day_of_week: 4, template_id: RR_TEMPLATE_ID },
    ],
    source_url:
      "https://www.reddit.com/r/bodyweightfitness/wiki/kb/recommended_routine",
    source_name: "r/bodyweightfitness Recommended Routine",
  },
  {
    id: "curated-sl5x5-prog",
    name: "StrongLifts 5×5",
    description:
      "A classic beginner strength program alternating two full-body workouts (Workout A and Workout B) three days per week. It builds core compound lifts using a 5×5 set-rep structure (with 1×5 for deadlifts). Progression is linear: add weight to the bar each workout. Top-set/AMRAP is encoded as '5' reps as per standard linear progression rules.",
    days: [
      { id: "curated-sl-day-1", label: "Workout A", template_id: "curated-sl-tpl-a" },
      { id: "curated-sl-day-2", label: "Workout B", template_id: "curated-sl-tpl-b" },
      { id: "curated-sl-day-3", label: "Workout A", template_id: "curated-sl-tpl-a" },
    ],
    schedule: [
      { day_of_week: 0, template_id: "curated-sl-tpl-a" },
      { day_of_week: 2, template_id: "curated-sl-tpl-b" },
      { day_of_week: 4, template_id: "curated-sl-tpl-a" },
    ],
    source_url: "https://stronglifts.com/stronglifts-5x5/",
    source_name: "StrongLifts 5×5",
  },
  {
    id: "curated-gzclp-prog",
    name: "GZCLP",
    description:
      "A highly popular linear progression program for beginners built by Cody LeFever. It categorizes lifts into three tiers to balance intensity and volume: Tier 1 (T1) heavy compound main lifts (5 sets of 3+ reps, with the last set being AMRAP, encoded as '3+'), Tier 2 (T2) lighter compound secondary lifts (3 sets of 10 reps, encoded as '10'), and Tier 3 (T3) high-volume accessories (3 sets of 15+ reps, last set being AMRAP, encoded as '15+'). Runs a 4-day rotation/schedule.",
    days: [
      { id: "curated-gzclp-day-1", label: "Day 1 (A1)", template_id: "curated-gzclp-tpl-d1" },
      { id: "curated-gzclp-day-2", label: "Day 2 (B1)", template_id: "curated-gzclp-tpl-d2" },
      { id: "curated-gzclp-day-3", label: "Day 3 (A2)", template_id: "curated-gzclp-tpl-d3" },
      { id: "curated-gzclp-day-4", label: "Day 4 (B2)", template_id: "curated-gzclp-tpl-d4" },
    ],
    schedule: [
      { day_of_week: 0, template_id: "curated-gzclp-tpl-d1" },
      { day_of_week: 2, template_id: "curated-gzclp-tpl-d2" },
      { day_of_week: 4, template_id: "curated-gzclp-tpl-d3" },
      { day_of_week: 5, template_id: "curated-gzclp-tpl-d4" },
    ],
    source_url: "https://swoleateveryheight.blogspot.com/2014/07/the-gzcl-method-simplified_13.html",
    source_name: "GZCL Linear Progression",
  },
  {
    id: "curated-531bbb-prog",
    name: "5/3/1 Boring But Big",
    description:
      "Jim Wendler's famous powerlifting program combined with the Boring But Big (BBB) hypertrophy template. Ships Week 1 (5s week) ONLY. Each workout features a main heavy 5/3/1 lift (3 sets of 5+ reps, last set being AMRAP, encoded as '5+') followed by BBB supplemental volume (5 sets of 10 reps of the same lift, encoded as '10') and high-volume lat or core work. Note: Please manually edit target_reps at week boundaries to follow the 3-week wave.",
    days: [
      { id: "curated-531bbb-day-1", label: "Day 1 (OHP)", template_id: "curated-531bbb-tpl-d1" },
      { id: "curated-531bbb-day-2", label: "Day 2 (Deadlift)", template_id: "curated-531bbb-tpl-d2" },
      { id: "curated-531bbb-day-3", label: "Day 3 (Bench)", template_id: "curated-531bbb-tpl-d3" },
      { id: "curated-531bbb-day-4", label: "Day 4 (Squat)", template_id: "curated-531bbb-tpl-d4" },
    ],
    schedule: [
      { day_of_week: 0, template_id: "curated-531bbb-tpl-d1" },
      { day_of_week: 1, template_id: "curated-531bbb-tpl-d2" },
      { day_of_week: 3, template_id: "curated-531bbb-tpl-d3" },
      { day_of_week: 4, template_id: "curated-531bbb-tpl-d4" },
    ],
    source_url: "https://www.jimwendler.com/blogs/jimwendler-com/101077382-boring-but-big",
    source_name: "5/3/1 Boring But Big",
  },
];

/**
 * Map of curated program id -> attribution metadata. The detail screen renders
 * a tappable footer (CC-BY-SA 3.0) when the active program has `is_curated=1`.
 */
export const CURATED_ATTRIBUTION: Record<
  string,
  { label: string; url: string; license: string }
> = Object.fromEntries(
  CURATED_PROGRAMS.map((p) => [
    p.id,
    {
      label: p.source_name,
      url: p.source_url,
      license: "CC-BY-SA 3.0",
    },
  ])
);
