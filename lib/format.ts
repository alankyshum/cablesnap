export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatDateShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatDateKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return formatDateKey(Date.now());
}

export function mondayOf(date: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function computeStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const weeks = new Set(timestamps.map((ts) => mondayOf(new Date(ts))));
  let current = mondayOf(new Date());
  let count = 0;
  while (weeks.has(current)) {
    count++;
    current -= 7 * 24 * 60 * 60 * 1000;
  }
  return count;
}

export function movingAvg(
  data: { date: string; weight: number }[],
  window = 7
): { date: string; avg: number }[] {
  return data.map((point, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    const avg = slice.reduce((sum, p) => sum + p.weight, 0) / slice.length;
    return { date: point.date, avg: Math.round(avg * 10) / 10 };
  });
}

export function formatDurationEstimate(seconds: number): string {
  const totalMinutes = seconds / 60;
  const rounded = Math.max(5, Math.round(totalMinutes / 5) * 5);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  if (h > 0 && m === 0) return `~${h}h`;
  if (h > 0) return `~${h}h ${m}m`;
  return `~${m}m`;
}

export function formatSpokenDuration(seconds: number): string {
  const totalMinutes = seconds / 60;
  const rounded = Math.max(5, Math.round(totalMinutes / 5) * 5);
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  const parts: string[] = [];
  if (h === 1) parts.push("1 hour");
  else if (h > 1) parts.push(`${h} hours`);
  if (m > 0) parts.push(`${m} minutes`);
  if (parts.length === 0) parts.push("5 minutes");
  return `approximately ${parts.join(" ")}`;
}

export function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export function withOpacity(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function computeLongestStreak(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const weeks = new Set(timestamps.map((ts) => mondayOf(new Date(ts))));
  const sorted = Array.from(weeks).sort((a, b) => a - b);
  let max = 1;
  let current = 1;
  const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i] - sorted[i - 1];
    if (Math.abs(diff - oneWeekMs) <= 3600000) {
      current++;
      if (current > max) max = current;
    } else {
      current = 1;
    }
  }
  return max;
}
