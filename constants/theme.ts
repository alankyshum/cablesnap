// ─── Electric Coral Energy Palette ─────────────────────────────────
// Brand palette constants moved to theme/colors.ts (BNA UI).
// Domain-specific color tokens remain below.

// ─── Accent Colors (spot usage) ────────────────────────────────────

export const accent = {
  cyan: "#00D4AA",
  cyanMuted: "#00B894",
  warning: "#F59E0B",
  success: "#10B981",
};

// ─── Competition Plate Colors ──────────────────────────────────────

export const plateColors = {
  light: {
    "25kg": { bg: "#D32F2F", text: "#FFFFFF" },
    "20kg": { bg: "#1565C0", text: "#FFFFFF" },
    "15kg": { bg: "#F9A825", text: "#000000" },
    "10kg": { bg: "#2E7D32", text: "#FFFFFF" },
    "5kg": { bg: "#757575", text: "#FFFFFF" },
    "2.5kg": { bg: "#37474F", text: "#FFFFFF" },
    "1.25kg": { bg: "#9E9E9E", text: "#000000" },
    "55lb": { bg: "#D32F2F", text: "#FFFFFF" },
    "45lb": { bg: "#1565C0", text: "#FFFFFF" },
    "35lb": { bg: "#F9A825", text: "#000000" },
    "25lb": { bg: "#2E7D32", text: "#FFFFFF" },
    "10lb": { bg: "#757575", text: "#FFFFFF" },
    "5lb": { bg: "#37474F", text: "#FFFFFF" },
    "2.5lb": { bg: "#9E9E9E", text: "#000000" },
  } as Record<string, { bg: string; text: string }>,
  dark: {
    "25kg": { bg: "#EF5350", text: "#000000" },
    "20kg": { bg: "#42A5F5", text: "#000000" },
    "15kg": { bg: "#FFD54F", text: "#000000" },
    "10kg": { bg: "#66BB6A", text: "#000000" },
    "5kg": { bg: "#BDBDBD", text: "#000000" },
    "2.5kg": { bg: "#78909C", text: "#FFFFFF" },
    "1.25kg": { bg: "#E0E0E0", text: "#000000" },
    "55lb": { bg: "#EF5350", text: "#000000" },
    "45lb": { bg: "#42A5F5", text: "#000000" },
    "35lb": { bg: "#FFD54F", text: "#000000" },
    "25lb": { bg: "#66BB6A", text: "#000000" },
    "10lb": { bg: "#BDBDBD", text: "#000000" },
    "5lb": { bg: "#78909C", text: "#FFFFFF" },
    "2.5lb": { bg: "#E0E0E0", text: "#000000" },
  } as Record<string, { bg: string; text: string }>,
};

export function plateColor(
  weight: number,
  unit: "kg" | "lb",
  isDark: boolean
): { bg: string; text: string } {
  const palette = isDark ? plateColors.dark : plateColors.light;
  return (
    palette[`${weight}${unit}`] ||
    (isDark
      ? { bg: "#616161", text: "#FFFFFF" }
      : { bg: "#424242", text: "#FFFFFF" })
  );
}

// ─── Semantic Domain Colors ────────────────────────────────────────

export const semantic = {
  protein: "#10B981",
  carbs: "#FFB830",
  fat: "#EF4444",
  beginner: "#10B981",
  intermediate: "#FFB830",
  advanced: "#EF4444",
  onBeginner: "#ffffff",
  onIntermediate: "#000000",
  onAdvanced: "#ffffff",
};

export const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: semantic.beginner,
  intermediate: semantic.intermediate,
  advanced: semantic.advanced,
};

// ─── Muscle Diagram Colors ─────────────────────────────────────────

export const muscle = {
  light: {
    primary: "#FF6038",
    secondary: "#FFB830",
    inactive: "#E0E0E0",
    outline: "#9E9E9E",
  },
  dark: {
    primary: "#FF7A55",
    secondary: "#FFD166",
    inactive: "#424242",
    outline: "#616161",
  },
};

// ─── Category Icon Map ─────────────────────────────────────────────

export const CATEGORY_ICONS: Record<string, string> = {
  abs_core: "stomach",
  arms: "arm-flex",
  back: "human-handsup",
  chest: "weight-lifter",
  legs_glutes: "walk",
  shoulders: "account-arrow-up",
};

// ─── Equipment Icon Map ────────────────────────────────────────────

export const EQUIPMENT_ICONS: Record<string, string> = {
  barbell: "weight-lifter",
  dumbbell: "dumbbell",
  cable: "cable-data",
  machine: "cog",
  bodyweight: "human",
  kettlebell: "kettlebell",
  band: "resistor",
  other: "dots-horizontal",
};

export function difficultyText(level: string): string {
  if (level === "intermediate") return semantic.onIntermediate;
  if (level === "advanced") return semantic.onAdvanced;
  return semantic.onBeginner;
}

// ─── Camera Overlay ─────────────────────────────────────────────────
// Fixed colors for the camera viewfinder — must contrast against a live
// camera feed, not the app theme.

// ─── Strength Level Colors ──────────────────────────────────────────

export const STRENGTH_LEVEL_COLORS = {
  light: {
    beginner:     { bg: "#E0E0E0", text: "#424242" },
    novice:       { bg: "#BBDEFB", text: "#0D47A1" },
    intermediate: { bg: "#C8E6C9", text: "#1B5E20" },
    advanced:     { bg: "#FFE0B2", text: "#E65100" },
    elite:        { bg: "#F8BBD0", text: "#880E4F" },
  } as Record<string, { bg: string; text: string }>,
  dark: {
    beginner:     { bg: "#616161", text: "#E0E0E0" },
    novice:       { bg: "#1565C0", text: "#E3F2FD" },
    intermediate: { bg: "#2E7D32", text: "#E8F5E9" },
    advanced:     { bg: "#E65100", text: "#FFF3E0" },
    elite:        { bg: "#AD1457", text: "#FCE4EC" },
  } as Record<string, { bg: string; text: string }>,
};

export const CAMERA_OVERLAY = {
  background: "#000000",
  text: "#ffffff",
  closeButton: "rgba(0,0,0,0.5)",
  closeButtonPressed: "rgba(0,0,0,0.7)",
};
