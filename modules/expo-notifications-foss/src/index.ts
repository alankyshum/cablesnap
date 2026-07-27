/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */


export const AndroidImportance = {
  UNSPECIFIED: 0,
  NONE: 1,
  MIN: 2,
  LOW: 3,
  DEFAULT: 4,
  HIGH: 5,
  MAX: 6,
} as const;
export type AndroidImportance = typeof AndroidImportance[keyof typeof AndroidImportance];

export const AndroidNotificationPriority = {
  MIN: "min",
  LOW: "low",
  DEFAULT: "default",
  HIGH: "high",
  MAX: "max",
} as const;
export type AndroidNotificationPriority = typeof AndroidNotificationPriority[keyof typeof AndroidNotificationPriority];

export const SchedulableTriggerInputTypes = {
  TIME_INTERVAL: "timeInterval",
  DAILY: "daily",
  WEEKLY: "weekly",
  DATE: "date",
} as const;
export type SchedulableTriggerInputTypes = typeof SchedulableTriggerInputTypes[keyof typeof SchedulableTriggerInputTypes];

export async function getPermissionsAsync() {
  return { status: "granted", granted: true, canAskAgain: true, expires: "never" };
}

export async function requestPermissionsAsync() {
  return { status: "granted", granted: true, canAskAgain: true, expires: "never" };
}

export async function scheduleNotificationAsync(request: any) {
  return request.identifier || `notif-${Math.random()}`;
}

export async function dismissNotificationAsync(identifier: string) {
  return null;
}

export async function cancelScheduledNotificationAsync(identifier: string) {
  return null;
}

export async function cancelAllScheduledNotificationsAsync() {
  return null;
}

export async function setNotificationChannelAsync(channelId: string, channel: any) {
  return null;
}

export async function deleteNotificationChannelAsync(channelId: string) {
  return null;
}

export function setNotificationHandler(handler: any) {
  // no-op
}

export function addNotificationResponseReceivedListener(listener: any) {
  return {
    remove: () => {},
  };
}

// Config plugin default export to preserve sounds in F-Droid builds
export default function withFossNotifications(config: any, props: any) {
  return config;
}
export function addNotificationReceivedListener(listener: any) {
  return {
    remove: () => {},
  };
}
