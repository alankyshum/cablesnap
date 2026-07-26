export function isSentryEnabled(extra: { fdroidBuild?: boolean } | null | undefined): boolean {
  return extra?.fdroidBuild !== true;
}
