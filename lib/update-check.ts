import { deleteAppSetting, getAppSetting, setAppSetting } from "@/lib/db/settings";
import Constants from "expo-constants";
import { GITHUB_REPO } from "@/constants/github";
export type DistributionChannel = "github" | "fdroid";
export const ASSET_NAMES: Record<DistributionChannel, string | undefined> = { github: "cablesnap.apk", fdroid: undefined };
const DISMISSED_TAG_KEY = "update.dismissedTag";
const LAST_CHECKED_AT_KEY = "update.lastCheckedAt";
// The bridge checks on mount and whenever the app returns to the foreground;
// this interval only rate-limits the GitHub API call.
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type Release = { tag_name: string; name?: string | null; body?: string | null; html_url: string; assets?: { name: string; browser_download_url: string }[] };
export type AvailableUpdate = { currentVersion: string; tag: string; version: string; name: string; body: string; url: string };

type ExpoConfig = { version?: string; extra?: { distributionChannel?: DistributionChannel } };

function getExpoConfig(): ExpoConfig | null { return Constants.expoConfig; }

export function resolveDistributionChannel(extra: { distributionChannel?: DistributionChannel } | undefined): DistributionChannel | undefined {
  return extra?.distributionChannel === "github" || extra?.distributionChannel === "fdroid"
    ? extra.distributionChannel
    : undefined;
}

export type VersionComparison = -1 | 0 | 1 | "invalid";
export const INVALID_VERSION_COMPARISON = "invalid" as const;

export function compareVersions(left: string, right: string): VersionComparison {
  const parse = (value: string) => {
    const match = value.trim().match(/^v?(\d+)\.(\d+)(?:\.(\d+))?$/i);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null;
  };
  const a = parse(left); const b = parse(right);
  if (!a || !b) return INVALID_VERSION_COMPARISON;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  return 0;
}

export function resolveReleaseUrl(release: Release, channel: DistributionChannel): string {
  const assetName = ASSET_NAMES[channel];
  return release.assets?.find((asset) => asset.name === assetName)?.browser_download_url ?? release.html_url;
}

async function fetchLatestRelease(): Promise<Release> {
  const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`Update check failed: ${response.status}`);
  return await response.json() as Release;
}

export async function dismissUpdate(tag: string): Promise<void> { await setAppSetting(DISMISSED_TAG_KEY, tag); }

export async function clearLastCheckedAt(): Promise<void> { await deleteAppSetting(LAST_CHECKED_AT_KEY); }

export async function checkForUpdate(now = Date.now()): Promise<AvailableUpdate | null> {
  try {
    const config = getExpoConfig();
    const channel = resolveDistributionChannel(config?.extra);
    if (channel !== "github") return null;
    const lastCheckedAt = Number(await getAppSetting(LAST_CHECKED_AT_KEY) ?? 0);
    const elapsed = now - lastCheckedAt;
    if (Number.isFinite(lastCheckedAt) && elapsed >= 0 && elapsed < CHECK_INTERVAL_MS) return null;
    const release = await fetchLatestRelease();
    await setAppSetting(LAST_CHECKED_AT_KEY, String(now));
    const currentVersion = config?.version ?? "0.0.0";
    const comparison = compareVersions(release.tag_name, currentVersion);
    if (comparison === INVALID_VERSION_COMPARISON || comparison <= 0) return null;
    if (await getAppSetting(DISMISSED_TAG_KEY) === release.tag_name) return null;
    return { currentVersion, tag: release.tag_name, version: release.tag_name.replace(/^v/i, ""), name: release.name?.trim() || release.tag_name, body: release.body?.trim() || "", url: resolveReleaseUrl(release, channel) };
  } catch (error) { console.warn("Update check failed", error); return null; }
}
