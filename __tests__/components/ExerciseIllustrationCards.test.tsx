/**
 * BLD-561: ExerciseIllustrationCards renderer.
 *
 * Verifies:
 *   - Voltra with complete manifest → 2 image pressables with startAlt/endAlt.
 *   - Custom exercise without images → 0 images + "Add your own illustration" hint.
 *   - Intrinsic flex-wrap styles for auto-flowing.
 */
import React from "react";
import { render } from "@testing-library/react-native";
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
      <ExerciseIllustrationCards exercise={voltra} />
    );
    expect(getByTestId("exercise-illustration-start")).toBeTruthy();
    expect(getByTestId("exercise-illustration-end")).toBeTruthy();
  });

  it("applies substantive AI alt-text as accessibilityLabel (not a stub)", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} />
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
      />
    );
    expect(queryByTestId("exercise-illustration-start")).toBeNull();
    expect(queryByTestId("exercise-illustration-end")).toBeNull();
  });

  it("renders empty-state hint for a custom exercise without images", () => {
    const { getByLabelText, queryByTestId } = render(
      <ExerciseIllustrationCards exercise={custom} />
    );
    expect(getByLabelText("Add your own illustration — coming soon")).toBeTruthy();
    expect(queryByTestId("exercise-illustration-start")).toBeNull();
  });

  it("renders images for a custom exercise when both URIs are supplied", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={customWithImages} />
    );
    expect(getByTestId("exercise-illustration-start")).toBeTruthy();
    expect(getByTestId("exercise-illustration-end")).toBeTruthy();
  });

  it("renders safety note row when safetyNote is present", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltraSafety} />
    );
    const safetyNote = getByTestId("exercise-safety-note");
    expect(safetyNote).toBeTruthy();
    expect(safetyNote.props.accessibilityLabel).toBe("Keep face clear of cable path.");
  });

  it("does not render safety note row when safetyNote is absent", () => {
    const { queryByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} />
    );
    expect(queryByTestId("exercise-safety-note")).toBeNull();
  });

  it("asserts auto-flow styles on the exercise-illustration-row", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} />
    );
    const row = getByTestId("exercise-illustration-row");
    const styles = Array.isArray(row.props.style) ? row.props.style.flat() : [row.props.style];
    const flexDirection = styles.reduce(
      (acc: string | undefined, s: Record<string, unknown> | undefined) =>
        s && typeof s === "object" && s.flexDirection
          ? (s.flexDirection as string)
          : acc,
      undefined as string | undefined
    );
    const flexWrap = styles.reduce(
      (acc: string | undefined, s: Record<string, unknown> | undefined) =>
        s && typeof s === "object" && s.flexWrap
          ? (s.flexWrap as string)
          : acc,
      undefined as string | undefined
    );
    expect(flexDirection).toBe("row");
    expect(flexWrap).toBe("wrap");
  });

  it("asserts card has flexGrow, flexBasis, and minWidth styles", () => {
    const { getByTestId } = render(
      <ExerciseIllustrationCards exercise={voltra} />
    );
    const card = getByTestId("exercise-illustration-start");
    const styles = Array.isArray(card.props.style) ? card.props.style.flat() : [card.props.style];
    const flexGrow = styles.reduce(
      (acc: number | undefined, s: Record<string, unknown> | undefined) =>
        s && typeof s === "object" && s.flexGrow !== undefined
          ? (s.flexGrow as number)
          : acc,
      undefined as number | undefined
    );
    const flexBasis = styles.reduce(
      (acc: number | undefined, s: Record<string, unknown> | undefined) =>
        s && typeof s === "object" && s.flexBasis !== undefined
          ? (s.flexBasis as number)
          : acc,
      undefined as number | undefined
    );
    const minWidth = styles.reduce(
      (acc: number | undefined, s: Record<string, unknown> | undefined) =>
        s && typeof s === "object" && s.minWidth !== undefined
          ? (s.minWidth as number)
          : acc,
      undefined as number | undefined
    );
    expect(flexGrow).toBe(1);
    expect(flexBasis).toBe(240);
    expect(minWidth).toBe(220);
  });
});
