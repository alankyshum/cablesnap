// BLD-753a: Guard rail — keep the manual mock at `lib/__mocks__/audio.ts`
// in sync with the real `lib/audio` public surface. If the real module
// adds an export that the mock doesn't know about, this test fails so the
// author updates the mock instead of leaving a latent
// `TypeError: (0 , _audio.<missing>) is not a function` bomb.

describe("lib/audio mock completeness (BLD-753a)", () => {
  it("manual mock exports every value-export of the real module", () => {
    // Use jest.requireActual to bypass the manual mock and get the real shape.
    const real = jest.requireActual("../../lib/audio") as Record<string, unknown>
    // The manual mock is what jest substitutes when we do a plain require.
    jest.mock("../../lib/audio")
    const mock = require("../../lib/audio") as Record<string, unknown>

    const realKeys = Object.keys(real).sort()
    const mockKeys = Object.keys(mock).sort()
    const missing = realKeys.filter((k) => !(k in mock))

    expect(missing).toEqual([])
    // Defensive: also surface the full diff in the failure message.
    expect(mockKeys).toEqual(expect.arrayContaining(realKeys))
  })
})
