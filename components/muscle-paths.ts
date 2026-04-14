import type { MuscleGroup } from "../lib/types";

// ViewBox: 0 0 200 500 for both front and rear views
// Minimalistic silhouette style with simplified anatomical shapes

export const BODY_OUTLINE_FRONT =
  // Head
  "M100,10 C115,10 125,22 125,35 C125,48 115,58 100,58 C85,58 75,48 75,35 C75,22 85,10 100,10 Z " +
  // Neck
  "M90,58 L90,72 L110,72 L110,58 " +
  // Torso
  "M60,72 L55,85 L50,130 L48,180 L55,195 L70,200 L100,205 L130,200 L145,195 L152,180 L150,130 L145,85 L140,72 Z " +
  // Left arm
  "M60,72 L48,78 L35,110 L30,145 L28,170 L35,172 L40,145 L48,115 L55,85 " +
  // Right arm
  "M140,72 L152,78 L165,110 L170,145 L172,170 L165,172 L160,145 L152,115 L145,85 " +
  // Left hand
  "M28,170 L24,185 L30,187 L35,172 " +
  // Right hand
  "M172,170 L176,185 L170,187 L165,172 " +
  // Left leg
  "M70,200 L65,260 L62,320 L58,400 L55,460 L50,485 L65,490 L70,465 L72,400 L75,320 L78,260 L85,210 L100,205 " +
  // Right leg
  "M130,200 L135,260 L138,320 L142,400 L145,460 L150,485 L135,490 L130,465 L128,400 L125,320 L122,260 L115,210 L100,205";

export const BODY_OUTLINE_REAR =
  // Head
  "M100,10 C115,10 125,22 125,35 C125,48 115,58 100,58 C85,58 75,48 75,35 C75,22 85,10 100,10 Z " +
  // Neck
  "M90,58 L90,72 L110,72 L110,58 " +
  // Torso
  "M60,72 L55,85 L50,130 L48,180 L55,195 L70,200 L100,205 L130,200 L145,195 L152,180 L150,130 L145,85 L140,72 Z " +
  // Left arm
  "M60,72 L48,78 L35,110 L30,145 L28,170 L35,172 L40,145 L48,115 L55,85 " +
  // Right arm
  "M140,72 L152,78 L165,110 L170,145 L172,170 L165,172 L160,145 L152,115 L145,85 " +
  // Left hand
  "M28,170 L24,185 L30,187 L35,172 " +
  // Right hand
  "M172,170 L176,185 L170,187 L165,172 " +
  // Left leg
  "M70,200 L65,260 L62,320 L58,400 L55,460 L50,485 L65,490 L70,465 L72,400 L75,320 L78,260 L85,210 L100,205 " +
  // Right leg
  "M130,200 L135,260 L138,320 L142,400 L145,460 L150,485 L135,490 L130,465 L128,400 L125,320 L122,260 L115,210 L100,205";

// Front view muscle regions
// Each value is an array of SVG path `d` strings (some muscles have left+right)
export const FRONT_PATHS: Partial<Record<MuscleGroup, string[]>> = {
  chest: [
    // Left pec
    "M65,85 L60,90 L58,110 L65,120 L80,125 L98,120 L98,95 L90,82 L75,80 Z",
    // Right pec
    "M135,85 L140,90 L142,110 L135,120 L120,125 L102,120 L102,95 L110,82 L125,80 Z",
  ],
  shoulders: [
    // Left front deltoid
    "M55,72 L48,78 L50,95 L58,90 L65,85 L65,75 Z",
    // Right front deltoid
    "M145,72 L152,78 L150,95 L142,90 L135,85 L135,75 Z",
  ],
  biceps: [
    // Left bicep
    "M48,95 L42,115 L38,135 L45,135 L50,118 L55,100 Z",
    // Right bicep
    "M152,95 L158,115 L162,135 L155,135 L150,118 L145,100 Z",
  ],
  forearms: [
    // Left forearm
    "M38,135 L33,155 L30,170 L37,170 L42,155 L45,135 Z",
    // Right forearm
    "M162,135 L167,155 L170,170 L163,170 L158,155 L155,135 Z",
  ],
  core: [
    // Abdominals + obliques
    "M78,120 L70,130 L65,155 L63,180 L70,195 L80,200 L100,205 L120,200 L130,195 L137,180 L135,155 L130,130 L122,120 L100,118 Z",
  ],
  quads: [
    // Left quad
    "M70,200 L65,230 L63,270 L62,310 L66,320 L76,318 L80,280 L82,240 L85,210 Z",
    // Right quad
    "M130,200 L135,230 L137,270 L138,310 L134,320 L124,318 L120,280 L118,240 L115,210 Z",
  ],
  calves: [
    // Left calf (front)
    "M62,340 L60,380 L58,410 L60,420 L68,418 L72,390 L73,360 L70,340 Z",
    // Right calf (front)
    "M138,340 L140,380 L142,410 L140,420 L132,418 L128,390 L127,360 L130,340 Z",
  ],
};

// Rear view muscle regions
export const REAR_PATHS: Partial<Record<MuscleGroup, string[]>> = {
  shoulders: [
    // Left rear deltoid
    "M55,72 L48,78 L50,95 L58,90 L65,85 L65,75 Z",
    // Right rear deltoid
    "M145,72 L152,78 L150,95 L142,90 L135,85 L135,75 Z",
  ],
  triceps: [
    // Left tricep
    "M48,95 L42,115 L38,135 L45,135 L50,118 L55,100 Z",
    // Right tricep
    "M152,95 L158,115 L162,135 L155,135 L150,118 L145,100 Z",
  ],
  forearms: [
    // Left forearm (rear)
    "M38,135 L33,155 L30,170 L37,170 L42,155 L45,135 Z",
    // Right forearm (rear)
    "M162,135 L167,155 L170,170 L163,170 L158,155 L155,135 Z",
  ],
  traps: [
    // Trapezius
    "M75,65 L65,72 L70,90 L85,95 L100,97 L115,95 L130,90 L135,72 L125,65 L110,62 L100,60 L90,62 Z",
  ],
  back: [
    // Mid-back
    "M80,100 L72,120 L70,150 L75,165 L85,170 L100,172 L115,170 L125,165 L130,150 L128,120 L120,100 L100,97 Z",
  ],
  lats: [
    // Left lat
    "M60,95 L55,110 L52,140 L55,170 L62,180 L70,175 L72,145 L70,115 L68,95 Z",
    // Right lat
    "M140,95 L145,110 L148,140 L145,170 L138,180 L130,175 L128,145 L130,115 L132,95 Z",
  ],
  glutes: [
    // Left glute
    "M70,190 L65,200 L68,215 L80,225 L100,222 L100,200 L85,195 Z",
    // Right glute
    "M130,190 L135,200 L132,215 L120,225 L100,222 L100,200 L115,195 Z",
  ],
  hamstrings: [
    // Left hamstring
    "M68,225 L65,260 L63,300 L66,320 L76,318 L78,290 L80,255 L80,230 Z",
    // Right hamstring
    "M132,225 L135,260 L137,300 L134,320 L124,318 L122,290 L120,255 L120,230 Z",
  ],
  calves: [
    // Left calf (rear)
    "M62,340 L60,380 L58,410 L60,420 L68,418 L72,390 L73,360 L70,340 Z",
    // Right calf (rear)
    "M138,340 L140,380 L142,410 L140,420 L132,418 L128,390 L127,360 L130,340 Z",
  ],
};

// All muscle groups that appear on each view
export const ALL_FRONT_MUSCLES: MuscleGroup[] = Object.keys(FRONT_PATHS) as MuscleGroup[];
export const ALL_REAR_MUSCLES: MuscleGroup[] = Object.keys(REAR_PATHS) as MuscleGroup[];
export const ALL_MUSCLES: MuscleGroup[] = [
  "chest", "shoulders", "biceps", "triceps", "forearms",
  "core", "quads", "hamstrings", "glutes", "calves",
  "back", "lats", "traps", "full_body",
];
