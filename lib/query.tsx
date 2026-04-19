/* eslint-disable react-hooks/exhaustive-deps */
import React from "react";
import { useCallback, useRef } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 5,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Mutation version tracker: bumped when DB writes affect a query key.
// useFocusRefetch compares against last-seen version to skip unnecessary refetches.
const mutationVersions = new Map<string, number>();

/**
 * Bump the mutation version for a query key prefix.
 * Call this after DB writes that should trigger a refetch on next focus.
 */
export function bumpQueryVersion(key: string): void {
  mutationVersions.set(key, (mutationVersions.get(key) ?? 0) + 1);
}

/** Get the current mutation version for a query key. */
export function getQueryVersion(key: string): number {
  return mutationVersions.get(key) ?? 0;
}

/**
 * Invalidate queries when the screen gains focus, but ONLY if data
 * has changed since the last focus (tracked via mutation versions).
 * On first focus, always invalidates (handles initial data load).
 * On subsequent focuses, only invalidates when a mutation version has bumped.
 */
export function useFocusRefetch(...keys: string[][]) {
  const qc = useQueryClient();
  const lastSeenVersions = useRef<Map<string, number> | null>(null);

  useFocusEffect(
    useCallback(() => {
      const isFirstFocus = lastSeenVersions.current === null;
      if (isFirstFocus) {
        lastSeenVersions.current = new Map();
      }

      if (keys.length === 0) {
        const globalVer = getQueryVersion("__global__");
        if (isFirstFocus || globalVer !== (lastSeenVersions.current!.get("__global__") ?? 0)) {
          qc.invalidateQueries();
        }
        lastSeenVersions.current!.set("__global__", globalVer);
      } else {
        for (const key of keys) {
          const keyStr = key.join(".");
          const currentVer = getQueryVersion(keyStr);
          if (isFirstFocus || currentVer !== (lastSeenVersions.current!.get(keyStr) ?? 0)) {
            qc.invalidateQueries({ queryKey: key });
          }
          lastSeenVersions.current!.set(keyStr, currentVer);
        }
      }
    }, [qc, ...keys.map((k) => k.join("."))])
  );
}
