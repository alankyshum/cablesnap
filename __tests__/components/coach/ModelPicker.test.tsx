import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CatalogModel, ModelCatalog } from "@/lib/ai/catalog";

// Mock router
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock theme colors
jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    primary: "#0284c7",
    onPrimary: "#ffffff",
    primaryContainer: "#e0f2fe",
    onPrimaryContainer: "#0369a1",
    secondary: "#64748b",
    onSecondary: "#ffffff",
    secondaryContainer: "#f1f5f9",
    onSecondaryContainer: "#334155",
    tertiary: "#d97706",
    tertiaryContainer: "#fef3c7",
    onTertiaryContainer: "#92400e",
    surface: "#ffffff",
    surfaceAlt: "#f8fafc",
    surfaceVariant: "#f1f5f9",
    onSurface: "#0f172a",
    onSurfaceVariant: "#64748b",
    background: "#ffffff",
    onBackground: "#0f172a",
    error: "#ef4444",
    onError: "#ffffff",
    errorContainer: "#fee2e2",
    onErrorContainer: "#991b1b",
    outline: "#cbd5e1",
    outlineVariant: "#e2e8f0",
  }),
}));

// Mutable query state for test control
let mockCatalogData: ModelCatalog | null = null;
let mockCatalogIsLoading = false;
let mockCatalogIsError = false;
const mockRefreshCatalog = jest.fn();

jest.mock("@/hooks/useModelCatalog", () => ({
  useModelCatalog: () => ({
    data: mockCatalogData,
    isLoading: mockCatalogIsLoading,
    isError: mockCatalogIsError,
  }),
  useRefreshModelCatalog: () => mockRefreshCatalog,
}));

let mockKeyStatusData: { kind: "available" | "missing_key" } = { kind: "available" };
jest.mock("@/hooks/useKeyStatus", () => ({
  useKeyStatus: () => ({
    data: mockKeyStatusData,
    isLoading: false,
    isError: false,
  }),
}));

import { ModelPicker } from "@/components/coach/ModelPicker";
import { ModelPickerSheet } from "@/components/coach/ModelPickerSheet";

function createFixtureModel(overrides: Partial<CatalogModel> = {}): CatalogModel {
  return {
    id: "fixture-org/custom-model-v1",
    name: "Fixture Custom Model",
    contextLength: 128000,
    pricing: {
      prompt: "0.00000015",
      completion: "0.0000006",
    },
    supportedParameters: ["tools"],
    ...overrides,
  };
}

describe("ModelPicker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalogIsLoading = false;
    mockCatalogIsError = false;
    mockKeyStatusData = { kind: "available" };
    mockCatalogData = {
      models: [
        createFixtureModel({
          id: "fixture-org/model-alpha",
          name: "Model Alpha",
          contextLength: 128000,
          pricing: { prompt: "0.00000015", completion: "0.0000006" },
          supportedParameters: ["tools"],
        }),
        createFixtureModel({
          id: "fixture-org/model-beta-notools",
          name: "Model Beta NoTools",
          contextLength: 32000,
          pricing: { prompt: "0.000001", completion: "0.000002" },
          supportedParameters: [],
        }),
      ],
      stale: false,
      cachedAt: 1770000000000,
      warning: null,
    };
  });

  it("surfaces a new fixture catalog entry with ZERO component edits", () => {
    // Initial render with model-alpha
    const { getByText, queryByText, rerender } = render(
      <ModelPicker onSelectModel={jest.fn()} />
    );
    expect(getByText("Model Alpha")).toBeTruthy();
    expect(queryByText("Dynamically Added Model Gamma")).toBeNull();

    // Add a new fixture model to the catalog data
    mockCatalogData = {
      ...mockCatalogData!,
      models: [
        ...mockCatalogData!.models,
        createFixtureModel({
          id: "fixture-org/model-gamma-dynamic",
          name: "Dynamically Added Model Gamma",
          contextLength: 200000,
          pricing: { prompt: "0.000003", completion: "0.000015" },
          supportedParameters: ["tools"],
        }),
      ],
    };

    // Rerender component
    rerender(<ModelPicker onSelectModel={jest.fn()} />);

    // Assert that the new fixture model renders immediately
    expect(getByText("Dynamically Added Model Gamma")).toBeTruthy();
    expect(getByText("fixture-org/model-gamma-dynamic")).toBeTruthy();
    expect(getByText("200k context")).toBeTruthy();
  });

  it("renders no model when the catalog is empty AND does not auto-select a default", () => {
    mockCatalogData = {
      models: [],
      stale: false,
      cachedAt: 1770000000000,
      warning: null,
    };

    const handleSelect = jest.fn();
    const { getByText, queryByTestId } = render(
      <ModelPicker onSelectModel={handleSelect} selectedModelId={null} />
    );

    // Empty state message is shown
    expect(getByText("No models available in catalog.")).toBeTruthy();

    // Clear indication that no model is selected
    expect(
      getByText("No model selected. Choose a model below to start coaching.")
    ).toBeTruthy();

    // No rows rendered
    expect(queryByTestId("model-row-fixture-org/model-alpha")).toBeNull();

    // Ensure no silent selection happened
    expect(handleSelect).not.toHaveBeenCalled();
  });

  it("displays model details: verbatim id, name, context length, pricing, tools badge", () => {
    const { getByText } = render(
      <ModelPicker onSelectModel={jest.fn()} selectedModelId="fixture-org/model-alpha" />
    );

    expect(getByText("Model Alpha")).toBeTruthy();
    expect(getByText("fixture-org/model-alpha")).toBeTruthy();
    expect(getByText("128k context")).toBeTruthy();
    expect(getByText("Prompt: $0.15/1M · Comp: $0.60/1M")).toBeTruthy();
    expect(getByText("Tools")).toBeTruthy();
    expect(getByText("Selected: fixture-org/model-alpha")).toBeTruthy();
  });

  it("invokes onSelectModel with model ID when tapped", () => {
    const handleSelect = jest.fn();
    const handleClose = jest.fn();
    const { getByTestId } = render(
      <ModelPicker onSelectModel={handleSelect} onClose={handleClose} />
    );

    fireEvent.press(getByTestId("model-row-fixture-org/model-alpha"));
    expect(handleSelect).toHaveBeenCalledWith("fixture-org/model-alpha");
    expect(handleClose).toHaveBeenCalled();
  });

  it("filters tools-only models by default and warns when relaxed", () => {
    const { getByText, queryByText, queryByTestId, getByLabelText, getByTestId } = render(
      <ModelPicker onSelectModel={jest.fn()} />
    );

    // Tools-only is ON by default: tool-capable model is visible, non-tool model is hidden
    expect(getByText("Model Alpha")).toBeTruthy();
    expect(queryByText("Model Beta NoTools")).toBeNull();
    expect(queryByTestId("relaxed-tools-warning")).toBeNull();

    // Relax the tools-only filter
    const switchControl = getByLabelText("Filter by tool calling support");
    fireEvent(switchControl, "valueChange", false);

    // Both models now visible
    expect(getByText("Model Alpha")).toBeTruthy();
    expect(getByText("Model Beta NoTools")).toBeTruthy();

    // Explicit warning banner is now rendered
    expect(getByTestId("relaxed-tools-warning")).toBeTruthy();
    expect(
      getByText(/Tools will not work on models without tool-calling support/i)
    ).toBeTruthy();
  });

  it("searches models by id and name", () => {
    mockCatalogData = {
      models: [
        createFixtureModel({ id: "fixture-org/alpha-turbo", name: "Alpha Turbo" }),
        createFixtureModel({ id: "fixture-org/beta-pro", name: "Beta Professional" }),
      ],
      stale: false,
      cachedAt: 1770000000000,
      warning: null,
    };

    const { getByTestId, getByText, queryByText } = render(
      <ModelPicker onSelectModel={jest.fn()} />
    );

    const searchInput = getByTestId("model-search-input");

    // Search by name match
    fireEvent.changeText(searchInput, "Professional");
    expect(getByText("Beta Professional")).toBeTruthy();
    expect(queryByText("Alpha Turbo")).toBeNull();

    // Search by id match
    fireEvent.changeText(searchInput, "alpha-turbo");
    expect(getByText("Alpha Turbo")).toBeTruthy();
    expect(queryByText("Beta Professional")).toBeNull();

    // Search with no matches
    fireEvent.changeText(searchInput, "nonexistent-query");
    expect(getByText('No models matching "nonexistent-query"')).toBeTruthy();
  });

  it("renders a visible stale catalog notice with timestamp and refresh button", () => {
    mockCatalogData = {
      ...mockCatalogData!,
      stale: true,
      cachedAt: 1770000000000,
      warning: { kind: "stale_catalog_warning" },
    };

    const { getByTestId, getByText, getByLabelText } = render(
      <ModelPicker onSelectModel={jest.fn()} />
    );

    expect(getByTestId("stale-catalog-banner")).toBeTruthy();
    expect(getByText(/Showing cached models from/i)).toBeTruthy();

    const refreshButton = getByLabelText("Refresh catalog");
    fireEvent.press(refreshButton);
    expect(mockRefreshCatalog).toHaveBeenCalled();
  });

  it("renders catalog unavailable error state with retry button", () => {
    mockCatalogData = null;
    mockCatalogIsError = true;

    const { getByTestId, getByText, getByLabelText } = render(
      <ModelPicker onSelectModel={jest.fn()} />
    );

    expect(getByTestId("catalog-error-state")).toBeTruthy();
    expect(
      getByText("The model catalog is unavailable, so no model can be selected safely.")
    ).toBeTruthy();

    const retryButton = getByLabelText("Refresh catalog");
    fireEvent.press(retryButton);
    expect(mockRefreshCatalog).toHaveBeenCalled();
  });

  it("routes missing key to /settings/ai-key screen", () => {
    mockKeyStatusData = { kind: "missing_key" };

    const { getByText, getByLabelText } = render(
      <ModelPicker onSelectModel={jest.fn()} />
    );

    expect(getByText("API key required")).toBeTruthy();
    const configKeyButton = getByLabelText("Configure OpenRouter API key");
    fireEvent.press(configKeyButton);
    expect(mockPush).toHaveBeenCalledWith("/settings/ai-key");
  });

  it("renders ModelPickerSheet wrapper correctly", () => {
    const handleSelect = jest.fn();
    const handleClose = jest.fn();

    const { getByText, getByLabelText, getByTestId, rerender } = render(
      <ModelPickerSheet
        isVisible={true}
        onClose={handleClose}
        selectedModelId={null}
        onSelectModel={handleSelect}
      />
    );

    expect(getByText("Select AI Model")).toBeTruthy();
    expect(getByText("Model Alpha")).toBeTruthy();
    expect(getByLabelText("Close model picker")).toBeTruthy();
    expect(getByTestId("model-catalog-list")).toBeTruthy();

    // When isVisible is false, picker content is not rendered
    rerender(
      <ModelPickerSheet
        isVisible={false}
        onClose={handleClose}
        selectedModelId={null}
        onSelectModel={handleSelect}
      />
    );
  });

  it("contains NO hardcoded model slugs in source files", () => {
    const pickerSource = readFileSync(
      resolve(__dirname, "../../../components/coach/ModelPicker.tsx"),
      "utf8"
    );
    const sheetSource = readFileSync(
      resolve(__dirname, "../../../components/coach/ModelPickerSheet.tsx"),
      "utf8"
    );
    const formatterSource = readFileSync(
      resolve(__dirname, "../../../components/coach/model-formatters.ts"),
      "utf8"
    );

    const combined = pickerSource + sheetSource + formatterSource;

    expect(pickerSource).toContain("BottomSheetFlatList");
    expect(pickerSource).toContain("nestedScrollEnabled");
    expect(sheetSource).toContain("BottomSheetModal");
    expect(sheetSource).toContain("BottomSheetView");

    // Proves zero hardcoded provider slugs or model families
    expect(combined).not.toMatch(
      /(?:openai|anthropic|google|meta-llama|mistralai|cohere|deepseek|qwen)\//i
    );
    expect(combined).not.toMatch(
      /\b(?:gpt-3|gpt-4|gpt-5|claude-|gemini-|llama-|mistral-|deepseek-|sonnet|haiku|opus)\b/i
    );
  });
});
