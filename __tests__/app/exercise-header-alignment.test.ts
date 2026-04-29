import * as fs from "fs";
import * as path from "path";

/**
 * Structural tests for BLD-390 (Exercise header alignment) — UPDATED for
 * BLD-850.
 *
 * BLD-850 simplifies the header to three rows:
 *   Row 1: title (full width) — long names wrap instead of fighting actions.
 *   Row 2: Details (left) + controls (right) — `actionsRow`.
 *   Row 3: Last | Next — owned by `LastNextRow`.
 *
 * The original BLD-390 contract — "row1 contains name + actions" — was
 * explicitly relaxed by the plan in BLD-850. The progression-arrow icon
 * (`arrow-up-bold` / "Weight progression suggested") moved into
 * `LastNextRow`'s leading icon for `increase` suggestions. We pin the new
 * shape here so future refactors don't silently regress to a cramped
 * single-row layout.
 */

const groupCardHeaderSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/GroupCardHeader.tsx"),
  "utf-8",
);

const lastNextRowSrc = fs.readFileSync(
  path.resolve(__dirname, "../../components/session/LastNextRow.tsx"),
  "utf-8",
);

describe("exercise header alignment (BLD-390, updated by BLD-850)", () => {
  it("uses a `headerWrap` container with vertical gap so rows stack cleanly", () => {
    const block = groupCardHeaderSrc.match(/headerWrap:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/gap:\s*\d+/);
  });

  it("`actionsRow` is the controls row — flexDirection row with center alignment + space-between", () => {
    const block = groupCardHeaderSrc.match(/actionsRow:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/flexDirection:\s*["']row["']/);
    expect(block![0]).toMatch(/alignItems:\s*["']center["']/);
    expect(block![0]).toMatch(/justifyContent:\s*["']space-between["']/);
  });

  it("groupTitle has fontWeight 700 (visual emphasis preserved)", () => {
    const block = groupCardHeaderSrc.match(/groupTitle:\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/fontWeight:\s*["']700["']/);
  });

  it("progression-arrow signal (BLD-390) moved to LastNextRow for `increase` suggestions", () => {
    // The arrow icon now lives next to the "Next:" value, not next to the
    // group title. This is intentional per BLD-850 — Next is the canonical
    // location for the "you should push harder" cue.
    expect(lastNextRowSrc).toMatch(/arrow-up-bold/);
    expect(lastNextRowSrc).toMatch(/increase/);
  });
});
