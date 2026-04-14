import { muscle } from "../../constants/theme";

describe("muscle theme colors", () => {
  it("defines light mode colors", () => {
    expect(muscle.light.primary).toBeDefined();
    expect(muscle.light.secondary).toBeDefined();
    expect(muscle.light.inactive).toBeDefined();
    expect(muscle.light.outline).toBeDefined();
  });

  it("defines dark mode colors", () => {
    expect(muscle.dark.primary).toBeDefined();
    expect(muscle.dark.secondary).toBeDefined();
    expect(muscle.dark.inactive).toBeDefined();
    expect(muscle.dark.outline).toBeDefined();
  });

  it("light and dark colors differ for contrast", () => {
    expect(muscle.light.primary).not.toBe(muscle.dark.primary);
    expect(muscle.light.secondary).not.toBe(muscle.dark.secondary);
    expect(muscle.light.inactive).not.toBe(muscle.dark.inactive);
  });

  it("primary is red-family and secondary is orange-family", () => {
    // Light primary should be red (#D...)
    expect(muscle.light.primary.toLowerCase()).toMatch(/^#[d-f]/);
    // Light secondary should be orange (#F5...)
    expect(muscle.light.secondary.toLowerCase()).toMatch(/^#f/);
  });
});
