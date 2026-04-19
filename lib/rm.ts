// 1RM estimation formulas and progressive overload suggestion logic

export function epley(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

export function brzycki(weight: number, reps: number): number {
  if (reps === 1) return weight;
  if (reps >= 37) return weight;
  return weight * (36 / (37 - reps));
}

export function lombardi(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return weight * Math.pow(reps, 0.1);
}

export function average(weight: number, reps: number): number {
  return (epley(weight, reps) + brzycki(weight, reps) + lombardi(weight, reps)) / 3;
}

const PCT_TIERS = [
  { pct: 100, reps: "1" },
  { pct: 95, reps: "2" },
  { pct: 90, reps: "3–4" },
  { pct: 85, reps: "5–6" },
  { pct: 80, reps: "7–8" },
  { pct: 75, reps: "9–10" },
  { pct: 70, reps: "10–12" },
  { pct: 65, reps: "12–15" },
  { pct: 60, reps: "15–18" },
  { pct: 50, reps: "20–25" },
] as const;

export function percentageTable(orm: number): { pct: number; weight: number; reps: string }[] {
  return PCT_TIERS.map((t) => ({
    pct: t.pct,
    weight: Math.round((orm * t.pct) / 100 * 10) / 10,
    reps: t.reps,
  }));
}

export type HistorySet = {
  session_id: string;
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  completed: number;
  started_at: number;
};

export type Suggestion = {
  type: "increase" | "maintain" | "rep_increase";
  weight: number;
  reps: number | null;
  reason: string;
};

export function suggest(
  sets: HistorySet[],
  step: number,
  bodyweight: boolean,
): Suggestion | null {
  // Group sets by session
  const sessions = new Map<string, HistorySet[]>();
  for (const s of sets) {
    const arr = sessions.get(s.session_id) ?? [];
    arr.push(s);
    sessions.set(s.session_id, arr);
  }

  // Sort sessions by started_at descending
  const sorted = [...sessions.entries()]
    .sort((a, b) => b[1][0].started_at - a[1][0].started_at);

  if (sorted.length < 2) return null;

  const [, last] = sorted[0];
  const [, prior] = sorted[1];

  // Filter to "attempted" sets (weight > 0 AND reps > 0)
  const attempted = last.filter(
    (s) => s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0,
  );
  if (attempted.length === 0) return null;

  const priorAttempted = prior.filter(
    (s) => s.weight != null && s.weight > 0 && s.reps != null && s.reps > 0,
  );
  if (priorAttempted.length === 0) return null;

  // Check if all attempted sets completed
  const allCompleted = attempted.every((s) => s.completed === 1);

  // Check RPE — only suppress when at least one set has RPE ≥ 9.5
  const hasRPE = attempted.some((s) => s.rpe != null);
  if (hasRPE && attempted.some((s) => s.rpe != null && s.rpe >= 9.5)) {
    const w = attempted[0].weight!;
    return { type: "maintain", weight: w, reps: null, reason: "RPE ≥ 9.5 last session — maintain" };
  }

  const lastWeight = Math.max(...attempted.map((s) => s.weight!));
  const priorWeight = Math.max(...priorAttempted.map((s) => s.weight!));

  // Check if user decreased weight (deload)
  if (lastWeight < priorWeight) {
    return { type: "maintain", weight: lastWeight, reps: null, reason: "Weight decreased — respect deload" };
  }

  // Bodyweight exercises — rep progression
  if (bodyweight) {
    if (!allCompleted) {
      const avg = Math.round(attempted.reduce((a, s) => a + s.reps!, 0) / attempted.length);
      return { type: "maintain", weight: 0, reps: avg, reason: "Not all sets completed — maintain reps" };
    }
    const maxReps = Math.max(...attempted.map((s) => s.reps!));
    return { type: "rep_increase", weight: 0, reps: maxReps + 1, reason: "Bodyweight — increase reps" };
  }

  // Weight progression
  if (!allCompleted) {
    return { type: "maintain", weight: lastWeight, reps: null, reason: "Not all sets completed — maintain weight" };
  }

  // Check reps haven't dropped vs prior session
  const lastMinReps = Math.min(...attempted.map((s) => s.reps!));
  const priorMinReps = Math.min(...priorAttempted.map((s) => s.reps!));
  if (lastMinReps < priorMinReps) {
    return { type: "maintain", weight: lastWeight, reps: null, reason: "Reps dropped — maintain weight" };
  }

  const next = Math.round((lastWeight + step) * 100) / 100;
  return { type: "increase", weight: next, reps: null, reason: `All sets completed — increase by ${step}` };
}

// Duration-based progressive overload suggestion
export type DurationHistorySet = {
  session_id: string;
  duration_seconds: number | null;
  completed: number;
  started_at: number;
};

export type DurationSuggestion = {
  type: "increase" | "maintain";
  duration: number;
  reason: string;
};

export function suggestDuration(
  sets: DurationHistorySet[],
): DurationSuggestion | null {
  const sessions = new Map<string, DurationHistorySet[]>();
  for (const s of sets) {
    const arr = sessions.get(s.session_id) ?? [];
    arr.push(s);
    sessions.set(s.session_id, arr);
  }

  const sorted = [...sessions.entries()]
    .sort((a, b) => b[1][0].started_at - a[1][0].started_at);

  if (sorted.length < 1) return null;

  const [, last] = sorted[0];

  const attempted = last.filter(
    (s) => s.duration_seconds != null && s.duration_seconds > 0,
  );
  if (attempted.length === 0) return null;

  const allCompleted = attempted.every((s) => s.completed === 1);
  const maxDuration = Math.max(...attempted.map((s) => s.duration_seconds!));

  if (!allCompleted) {
    return { type: "maintain", duration: maxDuration, reason: "Not all sets completed — maintain duration" };
  }

  return { type: "increase", duration: maxDuration + 5, reason: "All sets completed — increase by 5s" };
}
