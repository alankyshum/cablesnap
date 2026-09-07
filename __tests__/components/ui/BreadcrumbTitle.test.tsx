import { fireEvent, render } from "@testing-library/react-native";

import BreadcrumbTitle from "@/components/ui/BreadcrumbTitle";

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({
    onSurface: "#111111",
    onSurfaceVariant: "#666666",
  }),
}));

describe("BreadcrumbTitle", () => {
  beforeEach(() => mockPush.mockClear());

  it("renders a clickable parent and plain current segment", () => {
    const { getByText, getByRole } = render(
      <BreadcrumbTitle segments={[{ label: "workouts", href: "/" }, { label: "exercise" }]} />,
    );

    expect(getByText("workouts")).toBeTruthy();
    expect(getByText("exercise")).toBeTruthy();
    expect(getByText("/")).toBeTruthy();
    expect(getByRole("link", { name: "workouts" })).toBeTruthy();
    expect(getByText("exercise").parent?.props.accessibilityRole).toBeUndefined();
  });

  it("navigates when a parent segment is pressed", () => {
    const { getByRole } = render(
      <BreadcrumbTitle segments={[{ label: "workouts", href: "/" }, { label: "exercise" }]} />,
    );

    fireEvent.press(getByRole("link", { name: "workouts" }));
    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("supports a third breadcrumb segment without component changes", () => {
    const { getByRole, getByText } = render(
      <BreadcrumbTitle
        segments={[
          { label: "workouts", href: "/" },
          { label: "exercise", href: "/exercise" },
          { label: "details" },
        ]}
      />,
    );

    expect(getByText("details")).toBeTruthy();
    expect(getByRole("link", { name: "exercise" })).toBeTruthy();
  });
});
