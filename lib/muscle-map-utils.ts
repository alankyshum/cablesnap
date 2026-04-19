import type { Slug } from "react-native-body-highlighter";
import type { MuscleGroup } from "./types";

export const SLUG_MAP: Record<MuscleGroup, Slug[]> = {
  chest: ["chest"],
  back: ["upper-back", "lower-back"],
  shoulders: ["deltoids"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  quads: ["quadriceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
  core: ["abs", "obliques"],
  forearms: ["forearm"],
  traps: ["trapezius"],
  lats: ["upper-back"],
  full_body: [
    "chest", "biceps", "abs", "obliques", "quadriceps", "deltoids",
    "trapezius", "triceps", "forearm", "calves", "hamstring", "gluteal",
    "upper-back", "lower-back", "adductors",
  ],
};
