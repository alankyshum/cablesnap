import {
  getModel,
  getModelCatalog,
  invalidateModelCatalog,
  listModels,
} from "../../../lib/ai/catalog";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const models = [
  { id: "provider/with-tools", name: "With tools", context_length: 1000, pricing: { prompt: "1", completion: "2" }, supported_parameters: ["tools"] },
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
    await expect(listModels()).resolves.toEqual([expect.objectContaining({ id: "provider/with-tools" })]);
  });

  it("throws for an unknown model instead of falling back", async () => {
    fetchMock.mockResolvedValue(response(models));
    await expect(getModel("provider/unknown")).rejects.toEqual({ kind: "model_not_in_catalog" });
  });

  it("throws separately when a catalog model lacks tools", async () => {
    fetchMock.mockResolvedValue(response(models));
    await expect(getModel("provider/no-tools")).rejects.toEqual({ kind: "model_lacks_tools" });
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
