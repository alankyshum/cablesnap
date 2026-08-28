import { useQuery } from "@tanstack/react-query";
import { getKeyStatus } from "@/lib/ai/key-status";

export const keyStatusQueryKey = ["ai", "key-status"] as const;

export function useKeyStatus() {
  return useQuery({
    queryKey: keyStatusQueryKey,
    queryFn: getKeyStatus,
    refetchInterval: false,
  });
}
