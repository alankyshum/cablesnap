/**
 * BLD-561: ExerciseIllustrationCards renderer.
 *
 * Verifies:
 *   - Voltra with complete manifest → 2 image pressables with startAlt/endAlt.
 *   - Custom exercise without images → 0 images + "Add your own illustration" hint.
 *   - Container width breakpoint: stacked vs side-by-side via onLayout.
 *
 * Uses `it.each` where practical per QD budget guidance.
 */
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { ExerciseIllustrationCards } from "../../components/exercises/ExerciseIllustrationCards";

jest.mock("../../assets/exercise-illustrations/manifest.generated", () => ({
  manifest: {
    "voltra-test-1": {
      start: 1,
      end: 2,
      startAlt: "Supine with cable overhead",
      endAlt: "Torso curled up, abs engaged",
    },
    "voltra-test-safety": {
      start: 3,
      end: 4,
      startAlt: "Safety start alt",
      endAlt: "Safety end alt",
      safetyNote: "Keep face clear of cable path.",
    },
  },
}));

// Avoid pulling the real theme for Node JSDOM simplicity.
jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surfaceAlt: "#eee",
    surfaceVariant: "#eee",
    onSurfaceVariant: "#666",
    onPrimary: "#fff",
  }),
}));

describe("ExerciseIllustrationCards", () => {
  const voltra = { id: "voltra-test-1", name: "Test Exercise", is_custom: false };
  const voltraSafety = { id: "voltra-test-safety", name: "Safety Exercise", is_custom: false };
  const custom = { id: "custom-1", name: "My Ex", is_custom: true };
  const customWithImages = {
    id: "custom-2",
    name: "My Ex With Images",
    is_custom: true,
    start_image_uri: "file:///a.jpg",
    end_image_uri: "file:///b.jpg",
  };

  it("renders 2 illustration pressables for a voltra exercise with manifest entry", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} initialWidth={600} />
    );
    expect(getByTestId("exercise-illustration-start")).toBeTruthy();
    expect(getByTestId("exercise-illustration-end")).toBeTruthy();
  });

  it("applies substantive AI alt-text as accessibilityLabel (not a stub)", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} initialWidth={600} />
    );
    const start = getByTestId("exercise-illustration-start");
    const end = getByTestId("exercise-illustration-end");
    expect(start.props.accessibilityLabel).toBe("Supine with cable overhead");
    expect(end.props.accessibilityLabel).toBe("Torso curled up, abs engaged");
  });

  it("renders nothing for seeded exercise missing from manifest (no placeholder)", () => {
    const { queryByTestId } = render(
      <ExerciseIllustrationCards
        exercise={{ id: "voltra-unknown", name: "Unknown", is_custom: false }}
        initialWidth={600}
      />
    );
    expect(queryByTestId("exercise-illustration-start")).toBeNull();
    expect(queryByTestId("exercise-illustration-end")).toBeNull();
  });

  it("renders empty-state hint for a custom exercise without images", () => {
    const { getByLabelText, queryByTestId } = render(
      <ExerciseIllustrationCards exercise={custom} initialWidth={600} />
    );
    expect(getByLabelText("Add your own illustration — coming soon")).toBeTruthy();
    expect(queryByTestId("exercise-illustration-start")).toBeNull();
  });

  it("renders images for a custom exercise when both URIs are supplied", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={customWithImages} initialWidth={600} />
    );
    expect(getByTestId("exercise-illustration-start")).toBeTruthy();
    expect(getByTestId("exercise-illustration-end")).toBeTruthy();
  });

  it.each([
    { width: 320, layout: "column" as const, label: "narrow stacks vertically" },
    { width: 600, layout: "row" as const, label: "wide renders side-by-side" },
  ])("$label (width $width)", ({ width, layout }) => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} initialWidth={width} />
    );
    const row = getByTestId("exercise-illustration-row");
    const styles = Array.isArray(row.props.style) ? row.props.style.flat() : [row.props.style];
    const flex = styles.reduce(
      (acc: string | undefined, s: Record<string, unknown> | undefined) =>
        (s && typeof s === "object" && (s as Record<string, unknown>).flexDirection)
          ? ((s as Record<string, unknown>).flexDirection as string)
          : acc,
      undefined as string | undefined
    );
    expect(flex).toBe(layout);
  });

  it("re-layouts on onLayout container width change", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} initialWidth={320} />
    );
    const row = getByTestId("exercise-illustration-row");
    fireEvent(row, "layout", { nativeEvent: { layout: { width: 600, height: 200, x: 0, y: 0 } } });
    // After wide layout, row should now use horizontal direction.
    const styles = Array.isArray(row.props.style) ? row.props.style.flat() : [row.props.style];
    const flex = styles.reduce(
      (acc: string | undefined, s: Record<string, unknown> | undefined) =>
        (s && typeof s === "object" && (s as Record<string, unknown>).flexDirection)
          ? ((s as Record<string, unknown>).flexDirection as string)
          : acc,
      undefined as string | undefined
    );
    expect(flex).toBe("row");
  });

  it("renders safety note row when safetyNote is present", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltraSafety} initialWidth={600} />
    );
    const safetyNote = getByTestId("exercise-safety-note");
    expect(safetyNote).toBeTruthy();
    expect(safetyNote.props.accessibilityLabel).toBe("Keep face clear of cable path.");
  });

  it("does not render safety note row when safetyNote is absent", () => {
    const { queryByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} initialWidth={600} />
    );
    expect(queryByTestId("exercise-safety-note")).toBeNull();
  });
});
