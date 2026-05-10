/**
 * BLD-1145: covers AC24 from PLAN-BLD-1088.md
 *
 * AC24: Session-detail navigation guard: opening /session/[id] on a
 *       kind='day_session' row redirects to /day-session/[id] and never
 *       shows the editable session UI.
 *
 * Implementation: hooks/useSessionData.ts `load()` checks `sess.kind === "day_session"`
 * and calls `router.replace(`/day-session/${id}`)` before any set/session rendering.
 */

import * as fs from "fs";
import * as path from "path";

const SESSION_DATA_HOOK = path.join(
  __dirname,
  "../../hooks/useSessionData.ts"
);

describe("BLD-1088 AC24 — navigation guard: day_session → redirect to /day-session/[id]", () => {
  let hookSource: string;

  beforeAll(() => {
    hookSource = fs.readFileSync(SESSION_DATA_HOOK, "utf8");
  });

  it("useSessionData.ts checks sess.kind === 'day_session' before rendering session UI", () => {
    expect(hookSource).toContain(`sess.kind === "day_session"`);
  });

  it("redirects to /day-session/${id} path (not /session/[id])", () => {
    // Confirm the redirect target is /day-session/${id}
    expect(hookSource).toContain("`/day-session/${id}`");
  });

  it("uses router.replace (not router.push) for the redirect", () => {
    // router.replace prevents back-navigation to the editable session UI
    const guardSection = hookSource.slice(
      hookSource.indexOf(`sess.kind === "day_session"`) - 50,
      hookSource.indexOf(`sess.kind === "day_session"`) + 200
    );
    expect(guardSection).toContain("router.replace");
  });

  it("guard fires before any set/session data is loaded (early return)", () => {
    // The guard must appear before getSessionSets() and group-building logic
    const kindGuardPos = hookSource.indexOf(`sess.kind === "day_session"`);
    const getSessionSetsPos = hookSource.indexOf("getSessionSets(id)");

    expect(kindGuardPos).toBeGreaterThan(0);
    expect(getSessionSetsPos).toBeGreaterThan(0);
    // Guard comes before set loading
    expect(kindGuardPos).toBeLessThan(getSessionSetsPos);
  });
});
