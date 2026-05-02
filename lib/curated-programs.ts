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
      // Mon / Wed / Fri default placement. Day-of-week index follows JS
      // Date.getDay() — 1=Mon, 3=Wed, 5=Fri.
      { day_of_week: 1, template_id: RR_TEMPLATE_ID },
      { day_of_week: 3, template_id: RR_TEMPLATE_ID },
      { day_of_week: 5, template_id: RR_TEMPLATE_ID },
    ],
    source_url:
      "https://www.reddit.com/r/bodyweightfitness/wiki/kb/recommended_routine",
    source_name: "r/bodyweightfitness Recommended Routine",
  },
];
