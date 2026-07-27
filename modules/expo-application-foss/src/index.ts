/* eslint-disable @typescript-eslint/no-unused-vars */
import { UnavailabilityError } from 'expo-modules-core';

export const nativeApplicationVersion: string | null = "0.26.89";
export const nativeBuildVersion: string | null = "157";
export const applicationName: string | null = "CableSnap";
export const applicationId: string | null = "com.persoack.cablesnap";

export enum ApplicationReleaseType {
  UNKNOWN = 0,
  SIMULATOR = 1,
  ENTERPRISE = 2,
  DEVELOPMENT = 3,
  AD_HOC = 4,
  APP_STORE = 5,
}

export type PushNotificationServiceEnvironment = 'development' | 'production' | null;

export function getAndroidId(): string {
  return "fdroid-dummy-android-id";
}

export async function getInstallReferrerAsync(): Promise<string> {
  throw new UnavailabilityError('expo-application', 'getInstallReferrerAsync');
}

export async function getIosIdForVendorAsync(): Promise<string | null> {
  return null;
}

export async function getIosApplicationReleaseTypeAsync(): Promise<ApplicationReleaseType> {
  return ApplicationReleaseType.UNKNOWN;
}

export async function getIosPushNotificationServiceEnvironmentAsync(): Promise<PushNotificationServiceEnvironment> {
  return 'production';
}

export async function getInstallationTimeAsync(): Promise<Date> {
  return new Date();
}

export async function getLastUpdateTimeAsync(): Promise<Date> {
  return new Date();
}
