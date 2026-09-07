import {
  getCurrentGymPhotoModel,
  getModel,
  getModelCatalog,
  invalidateModelCatalog,
  listModels,
} from "../../../lib/ai/catalog";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const models = [
  { id: "provider/with-tools", name: "With tools", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: ["tools"], architecture: { input_modalities: ["text"] } },
  { id: "provider/vision-tools", name: "Vision tools", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: ["tools"], architecture: { input_modalities: ["text", "image"] } },
  { id: "provider/astra", name: "Astra", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: ["tools"], input_modalities: [], architecture: { input_modalities: ["file", "image", "text"] } },
  { id: "provider/direct-image-url", name: "Direct image URL", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: ["tools"], input_modalities: ["image_url"] },
  { id: "provider/text-tools", name: "Text tools", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: ["tools"], input_modalities: ["text"] },
  { id: "provider/image-no-tools", name: "Image no tools", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: [], input_modalities: ["image"] },
  { id: "provider/no-tools", name: "No tools", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: [] },
];

function response(data: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 503, json: async () => ({ data }) } as Response;
}

describe("OpenRouter model catalog", () => {
  const fetchMock = jest.spyOn(global, "fetch");

  beforeEach(() => {
    invalidateModelCatalog();
    fetchMock.mockReset();
  });

  it("fetches live data and filters to models supporting tools", async () => {
    fetchMock.mockResolvedValue(response(models));
    await expect(listModels()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "provider/with-tools" }),
      expect.objectContaining({ id: "provider/vision-tools" }),
    ]));
  });

  it("throws for an unknown model instead of falling back", async () => {
    fetchMock.mockResolvedValue(response(models));
    await expect(getModel("provider/unknown")).rejects.toEqual({ kind: "model_not_in_catalog" });
  });

  it("throws separately when a catalog model lacks tools", async () => {
    fetchMock.mockResolvedValue(response(models));
    await expect(getModel("provider/no-tools")).rejects.toEqual({ kind: "model_lacks_tools" });
  });

  it("preserves live modality data and does not infer vision from tools", async () => {
    fetchMock.mockResolvedValue(response(models));
    const catalog = await getModelCatalog();
    expect(catalog.models.find((model) => model.id === "provider/vision-tools")).toEqual(expect.objectContaining({
      inputModalities: ["text", "image"],
      supportsImageInput: true,
    }));
    expect(catalog.models.find((model) => model.id === "provider/with-tools")).toEqual(expect.objectContaining({
      supportsImageInput: false,
    }));
  });

  it("unions top-level and architecture modalities and requires tools for photos", async () => {
    fetchMock.mockResolvedValue(response(models));
    const catalog = await getModelCatalog();
    expect(catalog.models.find((model) => model.id === "provider/astra")).toEqual(expect.objectContaining({
      inputModalities: ["file", "image", "text"],
      supportsImageInput: true,
    }));
    expect(catalog.models.find((model) => model.id === "provider/direct-image-url")).toEqual(expect.objectContaining({ supportsImageInput: true }));
    expect(catalog.models.find((model) => model.id === "provider/text-tools")).toEqual(expect.objectContaining({ supportsImageInput: false }));
    expect(catalog.models.find((model) => model.id === "provider/image-no-tools")).toBeUndefined();
    await expect(getCurrentGymPhotoModel("provider/text-tools")).rejects.toEqual({ kind: "model_lacks_image_input" });
    await expect(getCurrentGymPhotoModel("provider/image-no-tools")).rejects.toEqual({ kind: "model_lacks_tools" });
  });

  it("requires a fresh successful catalog for the photo preflight", async () => {
    fetchMock.mockResolvedValue(response(models));
    await expect(getCurrentGymPhotoModel("provider/vision-tools")).resolves.toEqual(expect.objectContaining({ supportsImageInput: true }));
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(getCurrentGymPhotoModel("provider/vision-tools")).rejects.toEqual({ kind: "catalog_unavailable" });
  });

  it("uses the last cache and flags it stale after a refresh failure", async () => {
    fetchMock.mockResolvedValueOnce(response(models));
    await getModelCatalog();
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(getModelCatalog({ forceRefresh: true })).resolves.toEqual(expect.objectContaining({
      stale: true,
      warning: { kind: "stale_catalog_warning" },
    }));
  });

  it("throws catalog unavailable when no cache exists", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(getModelCatalog()).rejects.toEqual({ kind: "catalog_unavailable" });
  });

  it("contains no shipped model slug", async () => {
    const source = readFileSync(resolve(__dirname, "../../../lib/ai/catalog.ts"), "utf8");
    expect(source).not.toMatch(/(?:openai|anthropic|google|meta-llama)\//);
  });
});
