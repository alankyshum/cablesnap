import React from "react";
import { render } from "@testing-library/react-native";
import { CartesianChart, Line, Bar, Scatter, matchFont } from "../../lib/fdroid-chart-stub";

describe("F-Droid chart fallback", () => {
  it("renders an explicit unavailable message", () => {
    const { getByText, getByLabelText } = render(<CartesianChart />);

    expect(getByText("Charts unavailable in this build")).toBeTruthy();
    expect(getByLabelText("Charts unavailable in this build")).toBeTruthy();
  });

  it("keeps chart component exports safe to render", () => {
    expect(render(<Line />).toJSON()).toBeNull();
    expect(render(<Bar />).toJSON()).toBeNull();
    expect(render(<Scatter />).toJSON()).toBeNull();
    expect(matchFont()).toBeNull();
  });
});
