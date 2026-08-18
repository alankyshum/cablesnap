/** Pure helper — identical formula used by snapshot display and trend. */
export function volumeDiffPct(leftVol: number, rightVol: number): number {
  const denom = Math.max(leftVol, rightVol);
  if (denom === 0) return 0; // defensive; callers should exclude zero-volume sessions
  return (Math.abs(leftVol - rightVol) / denom) * 100;
}
