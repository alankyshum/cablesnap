import React from "react";
import { View } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("@/hooks/useColor", () => ({
  useColor: () => "#000000",
}));

import { Chip } from "../../components/ui/chip";

describe("Chip component (BLD-344)", () => {
  it("renders string children inside Text", () => {
    const { getByText } = render(<Chip>Hello</Chip>);
    expect(getByText("Hello")).toBeTruthy();
  });

  it("renders number children inside Text without crash", () => {
    const { getByText } = render(<Chip>{20}</Chip>);
    expect(getByText("20")).toBeTruthy();
  });

  it("renders JSX children directly without crash", () => {
    const { getByTestId } = render(
      <Chip><View testID="inner" /></Chip>,
    );
    expect(getByTestId("inner")).toBeTruthy();
  });
});
