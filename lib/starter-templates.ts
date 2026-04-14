import type { Difficulty } from "./types";

export type StarterExercise = {
  id: string;
  exercise_id: string;
  target_sets: number;
  target_reps: string;
  rest_seconds: number;
};

export type StarterTemplate = {
  id: string;
  name: string;
  difficulty: Difficulty;
  duration: string;
  recommended?: boolean;
  exercises: StarterExercise[];
};

export type StarterProgram = {
  id: string;
  name: string;
  description: string;
  days: { id: string; label: string; template_id: string }[];
};

export const STARTER_VERSION = 1;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: "starter-tpl-1",
    name: "Full Body",
    difficulty: "beginner",
    duration: "~35 min",
    recommended: true,
    exercises: [
      { id: "starter-te-1-goblet-squat", exercise_id: "voltra-039", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-1-chest-press-handle", exercise_id: "voltra-035", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-1-seated-row", exercise_id: "voltra-021", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-1-lateral-raises", exercise_id: "voltra-049", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-1-biceps-curls", exercise_id: "voltra-011", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-1-ab-crunches", exercise_id: "voltra-001", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
    ],
  },
  {
    id: "starter-tpl-2",
    name: "Upper Push",
    difficulty: "intermediate",
    duration: "~30 min",
    exercises: [
      { id: "starter-te-2-incline-chest", exercise_id: "voltra-031", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-2-chest-press-bar", exercise_id: "voltra-034", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-2-crossover-fly", exercise_id: "voltra-029", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-2-front-raise", exercise_id: "voltra-048", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-2-lateral-one-arm", exercise_id: "voltra-050", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-2-triceps-pushdown", exercise_id: "voltra-017", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
    ],
  },
  {
    id: "starter-tpl-3",
    name: "Upper Pull",
    difficulty: "intermediate",
    duration: "~30 min",
    exercises: [
      { id: "starter-te-3-lat-pulldown", exercise_id: "voltra-019", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-3-seated-row", exercise_id: "voltra-021", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-3-face-pulls", exercise_id: "voltra-046", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-3-straight-arm", exercise_id: "voltra-026", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-3-biceps-low", exercise_id: "voltra-010", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
      { id: "starter-te-3-hammer-curl", exercise_id: "voltra-012", target_sets: 3, target_reps: "8-12", rest_seconds: 90 },
    ],
  },
  {
    id: "starter-tpl-4",
    name: "Lower & Core",
    difficulty: "intermediate",
    duration: "~35 min",
    exercises: [
      { id: "starter-te-4-goblet-squat", exercise_id: "voltra-039", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-4-deadlift", exercise_id: "voltra-038", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-4-reverse-lunges", exercise_id: "voltra-043", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-4-hip-extension", exercise_id: "voltra-040", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-4-half-kneel-chop", exercise_id: "voltra-003", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
      { id: "starter-te-4-trunk-rotations", exercise_id: "voltra-009", target_sets: 3, target_reps: "10-12", rest_seconds: 60 },
    ],
  },
  {
    id: "starter-tpl-5",
    name: "Arms & Shoulders",
    difficulty: "beginner",
    duration: "~25 min",
    exercises: [
      { id: "starter-te-5-biceps-curls", exercise_id: "voltra-011", target_sets: 3, target_reps: "10-15", rest_seconds: 60 },
      { id: "starter-te-5-triceps-pushdown", exercise_id: "voltra-017", target_sets: 3, target_reps: "10-15", rest_seconds: 60 },
      { id: "starter-te-5-hammer-curl", exercise_id: "voltra-012", target_sets: 3, target_reps: "10-15", rest_seconds: 60 },
      { id: "starter-te-5-overhead-triceps", exercise_id: "voltra-013", target_sets: 3, target_reps: "10-15", rest_seconds: 60 },
      { id: "starter-te-5-lateral-raises", exercise_id: "voltra-049", target_sets: 3, target_reps: "10-15", rest_seconds: 60 },
      { id: "starter-te-5-upright-rows", exercise_id: "voltra-053", target_sets: 3, target_reps: "10-15", rest_seconds: 60 },
    ],
  },
  {
    id: "starter-tpl-6",
    name: "Core Strength",
    difficulty: "intermediate",
    duration: "~20 min",
    exercises: [
      { id: "starter-te-6-ab-crunches", exercise_id: "voltra-001", target_sets: 3, target_reps: "12-15", rest_seconds: 45 },
      { id: "starter-te-6-half-kneel-chop", exercise_id: "voltra-003", target_sets: 3, target_reps: "12-15", rest_seconds: 45 },
      { id: "starter-te-6-supine-bicycle", exercise_id: "voltra-002", target_sets: 3, target_reps: "12-15", rest_seconds: 45 },
      { id: "starter-te-6-trunk-rotations", exercise_id: "voltra-009", target_sets: 3, target_reps: "12-15", rest_seconds: 45 },
      { id: "starter-te-6-squat-rotation", exercise_id: "voltra-008", target_sets: 3, target_reps: "12-15", rest_seconds: 45 },
      { id: "starter-te-6-high-row", exercise_id: "voltra-004", target_sets: 3, target_reps: "12-15", rest_seconds: 45 },
    ],
  },
];

export const STARTER_PROGRAM: StarterProgram = {
  id: "starter-prog-1",
  name: "Push / Pull / Legs",
  description: "3-day training split. Push muscles on day 1, pull muscles on day 2, legs and core on day 3. Repeat the cycle.",
  days: [
    { id: "starter-day-1-push", label: "Push", template_id: "starter-tpl-2" },
    { id: "starter-day-2-pull", label: "Pull", template_id: "starter-tpl-3" },
    { id: "starter-day-3-legs", label: "Legs & Core", template_id: "starter-tpl-4" },
  ],
};
