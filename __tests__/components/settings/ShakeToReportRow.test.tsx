// GitHub #963: persisted default-on Shake to report setting.
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockGetEnabled = jest.fn().mockResolvedValue(true);
const mockSetEnabled = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/shake-to-report", () => ({
  getShakeToReportEnabled: () => mockGetEnabled(),
  setShakeToReportEnabled: (enabled: boolean) => mockSetEnabled(enabled),
}));

import { ShakeToReportRow } from "../../../components/settings/ShakeToReportRow";

const colors = { onSurface: "#111", onSurfaceVariant: "#555" } as never;

describe("ShakeToReportRow", () => {
  it("loads enabled by default and persists an opt-out", async () => {
    const view = render(<ShakeToReportRow colors={colors} />);
    const toggle = view.getByTestId("shake-to-report-switch");
    await waitFor(() => expect(toggle.props.value).toBe(true));
    fireEvent(toggle, "valueChange", false);
    await waitFor(() => expect(mockSetEnabled).toHaveBeenCalledWith(false));
  });
});
