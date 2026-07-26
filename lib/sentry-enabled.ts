export type SentryExtra = {
  fdroidBuild?: boolean;
  sentryDsn?: string;
};

export function isSentryEnabled(extra: SentryExtra | null | undefined): boolean {
  return extra?.fdroidBuild !== true;
}

export function resolveSentryDsn(extra: SentryExtra | null | undefined): string | undefined {
  const dsn = extra?.sentryDsn;
  return typeof dsn === "string" && dsn.length > 0 ? dsn : undefined;
}
