import type { ComponentType, ReactNode } from "react";

type StubComponent = ComponentType<unknown>;

export function init(options: Record<string, unknown>): void {
  void options;
}

export function mobileReplayIntegration(options?: Record<string, unknown>): unknown {
  void options;
  return {};
}

export function wrap<T extends StubComponent>(component: T): T {
  return component;
}

export function addBreadcrumb(breadcrumb: Record<string, unknown>): void {
  void breadcrumb;
}
export function captureException(error: unknown, context?: Record<string, unknown>): string | undefined {
  void error;
  void context;
  return undefined;
}
export function setUser(user: Record<string, unknown>): void {
  void user;
}
export function setTag(key: string, value: string): void {
  void key;
  void value;
}
export function setContext(key: string, value: unknown): void {
  void key;
  void value;
}
export function setExtra(key: string, value: unknown): void {
  void key;
  void value;
}
export function setLevel(level: string): void {
  void level;
}
export function configureScope(callback: (scope: unknown) => void): void {
  void callback;
}
export function withScope(callback: (scope: unknown) => void): void {
  void callback;
}

export function Mask({ children }: { children: ReactNode }) {
  return children;
}

export const logger = {
  info: (...args: unknown[]) => { void args; },
  warn: (...args: unknown[]) => { void args; },
  error: (...args: unknown[]) => { void args; },
};
