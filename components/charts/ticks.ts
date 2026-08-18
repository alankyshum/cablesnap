export const BAR_LABEL_FONT_SIZE = 10;

export function textWidth(value: string, fontSize: number) {
  return value.length * fontSize * 0.6;
}

export function ticks(count: number | undefined, length: number) {
  if (length === 0) return [];
  if (length === 1) return [0];
  const wanted = count == null || !Number.isFinite(count)
    ? length
    : Math.max(1, Math.floor(count));
  if (wanted === 1) return [0];
  const tickCount = Math.min(wanted, length);
  return Array.from({ length: tickCount }, (_, index) =>
    Math.round((index * (length - 1)) / (tickCount - 1))
  ).filter((value, index, values) => values.indexOf(value) === index);
}
