import React from "react";
import { render } from "@testing-library/react-native";
import { CoachMarkdown } from "@/components/coach/CoachMarkdown";

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    surface: "#ffffff",
    surfaceVariant: "#eeeeee",
    onSurface: "#111111",
    outlineVariant: "#777777",
  }),
}));

describe("CoachMarkdown", () => {
  it("renders a GFM table as rows and cells", () => {
    const { getByText, getAllByTestId } = render(
      <CoachMarkdown text={"| Exercise | Sets |\n| :--- | ---: |\n| Squat | 3 |"} />,
    );

    expect(getByText("Exercise")).toBeTruthy();
    expect(getByText("Squat")).toBeTruthy();
    expect(getAllByTestId("coach-markdown-table-row")).toHaveLength(2);
  });

  it("keeps incomplete markdown safe while streaming", () => {
    expect(() => render(<CoachMarkdown text={"```\nhttps://example.test/"} />)).not.toThrow();
    expect(() => render(<CoachMarkdown text={"| Exercise | Sets |\n| --- |"} />)).not.toThrow();
    expect(() => render(<CoachMarkdown text={"**still typing"} />)).not.toThrow();
  });
});
