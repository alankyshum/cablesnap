import React from "react";
import { useCallback } from "react";
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

/**
 * Invalidate queries when the screen gains focus.
 * Pass query key prefixes to selectively invalidate.
 */
export function useFocusRefetch(...keys: string[][]) {
  const qc = useQueryClient();
  useFocusEffect(
    useCallback(() => {
      if (keys.length === 0) {
        qc.invalidateQueries();
      } else {
        for (const key of keys) {
          qc.invalidateQueries({ queryKey: key });
        }
      }
    }, [qc, ...keys.map((k) => k.join("."))])
  );
}
