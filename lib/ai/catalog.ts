import {
  type CatalogUnavailableError,
  type ModelLacksToolsError,
  type ModelNotInCatalogError,
  type StaleCatalogWarning,
} from "./errors";

export const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
export const MODEL_CATALOG_TTL_MS = 5 * 60 * 1000;

export type ModelPricing = {
  readonly prompt: string;
  readonly completion: string;
  readonly request?: string;
  readonly image?: string;
  readonly webSearch?: string;
  readonly internalReasoning?: string;
};

export type CatalogModel = {
  readonly id: string;
  readonly name: string;
  readonly contextLength: number | null;
  readonly pricing: ModelPricing;
  readonly supportedParameters: readonly string[];
};

export type ModelCatalog = {
  readonly models: readonly CatalogModel[];
  readonly stale: boolean;
  readonly cachedAt: number;
  readonly warning: StaleCatalogWarning | null;
};

type RawModel = {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: unknown;
  supported_parameters?: unknown;
};

type CachedCatalog = {
  readonly fetchedAt: number;
  readonly allModels: readonly CatalogModel[];
  readonly toolsModels: readonly CatalogModel[];
};

let cachedCatalog: CachedCatalog | null = null;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeModel(raw: RawModel): CatalogModel | null {
  if (typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const supportedParameters = Array.isArray(raw.supported_parameters)
    ? raw.supported_parameters.filter((item): item is string => typeof item === "string")
    : [];
  const pricing = raw.pricing && typeof raw.pricing === "object" ? raw.pricing as Record<string, unknown> : {};
  return {
    id: raw.id,
    name: raw.name,
    contextLength: typeof raw.context_length === "number" ? raw.context_length : null,
    pricing: {
      prompt: asString(pricing.prompt),
      completion: asString(pricing.completion),
      ...(typeof pricing.request === "string" ? { request: pricing.request } : {}),
      ...(typeof pricing.image === "string" ? { image: pricing.image } : {}),
      ...(typeof pricing.web_search === "string" ? { webSearch: pricing.web_search } : {}),
      ...(typeof pricing.internal_reasoning === "string" ? { internalReasoning: pricing.internal_reasoning } : {}),
    },
    supportedParameters,
  };
}

async function fetchCatalog(): Promise<CachedCatalog> {
  const response = await fetch(OPENROUTER_MODELS_URL);
  if (!response.ok) throw new Error(`OpenRouter catalog HTTP ${response.status}`);
  const payload: unknown = await response.json();
  const rawModels = payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: RawModel[] }).data
    : [];
  const allModels = rawModels.map(normalizeModel).filter((model): model is CatalogModel => model !== null);
  return {
    fetchedAt: Date.now(),
    allModels,
    toolsModels: allModels.filter((model) => model.supportedParameters.includes("tools")),
  };
}

export async function getModelCatalog(options: { readonly forceRefresh?: boolean } = {}): Promise<ModelCatalog> {
  const now = Date.now();
  if (!options.forceRefresh && cachedCatalog && now - cachedCatalog.fetchedAt < MODEL_CATALOG_TTL_MS) {
    return { models: cachedCatalog.toolsModels, stale: false, cachedAt: cachedCatalog.fetchedAt, warning: null };
  }

  try {
    cachedCatalog = await fetchCatalog();
    return { models: cachedCatalog.toolsModels, stale: false, cachedAt: cachedCatalog.fetchedAt, warning: null };
  } catch (error) {
    void error;
    if (!cachedCatalog) throw { kind: "catalog_unavailable" } satisfies CatalogUnavailableError;
    return {
      models: cachedCatalog.toolsModels,
      stale: true,
      cachedAt: cachedCatalog.fetchedAt,
      warning: { kind: "stale_catalog_warning" } satisfies StaleCatalogWarning,
    };
  }
}

export async function listModels(options?: { readonly forceRefresh?: boolean }): Promise<readonly CatalogModel[]> {
  return (await getModelCatalog(options)).models;
}

export async function getModel(id: string, options?: { readonly forceRefresh?: boolean }): Promise<CatalogModel> {
  const catalog = await getModelCatalog(options);
  const cached = cachedCatalog;
  const model = cached?.allModels.find((item) => item.id === id);
  if (!model) throw { kind: "model_not_in_catalog" } satisfies ModelNotInCatalogError;
  if (!model.supportedParameters.includes("tools")) {
    throw { kind: "model_lacks_tools" } satisfies ModelLacksToolsError;
  }
  void catalog;
  return model;
}

export function invalidateModelCatalog(): void {
  cachedCatalog = null;
}
