/**
 * BLD-577 regression lock: session lifecycle breadcrumbs must be emitted
 * so Sentry events captured during a session carry a diagnostic trail
 * (GitHub #336 — foreground crash/stuck state, no error logs).
 */
import * as Sentry from "@sentry/react-native";
import { sessionBreadcrumb } from "../../lib/session-breadcrumbs";

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
}));

describe("sessionBreadcrumb", () => {
  beforeEach(() => {
    (Sentry.addBreadcrumb as jest.Mock).mockClear();
  });

  it("emits a Sentry breadcrumb under category 'session'", () => {
    sessionBreadcrumb("session.open");
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "session",
        message: "session.open",
        level: "info",
      }),
    );
  });

  it("attaches scalar data", () => {
    sessionBreadcrumb("timer.set.start", { exerciseId: "ex-1", setIndex: 0, target: 60 });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { exerciseId: "ex-1", setIndex: 0, target: 60 },
      }),
    );
  });

  it("never throws if Sentry.addBreadcrumb blows up", () => {
    (Sentry.addBreadcrumb as jest.Mock).mockImplementationOnce(() => {
      throw new Error("Sentry not initialized");
    });
    expect(() => sessionBreadcrumb("session.close")).not.toThrow();
  });
});
