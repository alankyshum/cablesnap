import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getModelCatalog, invalidateModelCatalog } from "@/lib/ai/catalog";

export const modelCatalogQueryKey = ["ai", "model-catalog"] as const;

export function useModelCatalog() {
  return useQuery({
    queryKey: modelCatalogQueryKey,
    queryFn: () => getModelCatalog(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRefreshModelCatalog() {
  const queryClient = useQueryClient();
  return () => {
    invalidateModelCatalog();
    return queryClient.invalidateQueries({ queryKey: modelCatalogQueryKey });
  };
}
