import { REST_MULTIPLIERS } from "../../lib/rest";

// Freeze v1 multiplier tables. Any intentional tune-up in v2 must update this
// snapshot (the plan explicitly calls this out as a contract, BLD-531 §Tests).
describe("REST_MULTIPLIERS v1 snapshot", () => {
  it("set-type multipliers are frozen", () => {
    expect(REST_MULTIPLIERS.setType).toMatchInlineSnapshot(`
{
  "dropset": 0.1,
  "failure": 1.3,
  "normal": 1,
  "warmup": 0.3,
}
`);
  });

  it("RPE bucket multipliers are frozen", () => {
    expect(REST_MULTIPLIERS.rpe).toMatchInlineSnapshot(`
{
  "high": 1.15,
  "low": 0.8,
  "midOrNull": 1,
  "veryHigh": 1.3,
}
`);
  });

  it("category multipliers are frozen", () => {
    expect(REST_MULTIPLIERS.category).toMatchInlineSnapshot(`
{
  "bodyweight": 0.85,
  "cable": 0.8,
  "standard": 1,
}
`);
  });
});
