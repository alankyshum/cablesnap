/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for the `claimSwipeCompleteHintOnce` module-level helper inside
 * components/session/SetRow.tsx (BLD-614 reviewer round 2).
 *
 * Invariants under test:
 *   1. First caller (no flag in DB) -> true (winner).
 *   2. Same-tick concurrent callers -> false (lose, await inflight).
 *   3. Caller AFTER winner resolves -> false (consumed).
 *   4. First caller when DB flag already set -> false (no winner ever).
 *   5. DB error path -> false; consumed-state still latches.
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  getAppSetting: async () => {
    const g: any = globalThis;
    g.__hintGetCalls = (g.__hintGetCalls ?? 0) + 1;
    if (g.__hintErrorOnce) {
      g.__hintErrorOnce = false;
      throw new Error("db down");
    }
    return g.__hintMockDb?.value ?? null;
  },
  setAppSetting: async (key: string, value: string) => {
    const g: any = globalThis;
    g.__hintSetCalls = (g.__hintSetCalls ?? []).concat([{ key, value }]);
    if (!g.__hintMockDb) g.__hintMockDb = { value: null };
    g.__hintMockDb.value = value;
  },
}));

jest.mock("@/hooks/useThemeColors", () => ({
  useThemeColors: () => ({}),
}));
jest.mock("@/hooks/useSetCompletionFeedback", () => ({
  useSetCompletionFeedback: () => ({ fire: () => {} }),
}));
jest.mock("../../../components/SwipeRowAction", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("react-native-reanimated", () => {
  const bez = () => () => 0;
  return {
    __esModule: true,
    default: { View: () => null },
    useSharedValue: () => ({ value: 0 }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: any) => v,
    withSpring: (v: any) => v,
    withDelay: (_d: any, v: any) => v,
    withSequence: (...args: any[]) => args[args.length - 1],
    runOnJS: (fn: any) => fn,
    Easing: { bezier: bez, linear: bez, ease: bez, in: bez, out: bez, inOut: bez },
  };
});
jest.mock("react-native-gesture-handler", () => {
  const make = () => {
    const obj: any = {};
    const noop = () => obj;
    obj.onStart = noop; obj.onUpdate = noop; obj.onEnd = noop;
    obj.enabled = noop; obj.activeOffsetX = noop; obj.activeOffsetY = noop;
    obj.failOffsetX = noop; obj.failOffsetY = noop; obj.minDistance = noop;
    return obj;
  };
  return {
    GestureDetector: ({ children }: any) => children,
    Gesture: { Pan: make },
  };
});

import {
  __claimSwipeCompleteHintOnceForTests as claim,
  __resetSwipeCompleteHintClaimForTests as reset,
} from "../../../components/session/SetRow";

const g: any = globalThis;

describe("claimSwipeCompleteHintOnce", () => {
  beforeEach(() => {
    reset();
    g.__hintMockDb = { value: null };
    g.__hintGetCalls = 0;
    g.__hintSetCalls = [];
    g.__hintErrorOnce = false;
  });

  it("first caller wins when DB flag is unset", async () => {
    const won = await claim();
    expect(won).toBe(true);
    expect(g.__hintSetCalls).toEqual([
      { key: "hint:swipe-complete-set:v1", value: "1" },
    ]);
    expect(g.__hintMockDb.value).toBe("1");
  });

  it("same-tick concurrent callers: exactly one wins, others see false", async () => {
    const a = claim();
    const b = claim();
    const c = claim();
    const [ra, rb, rc] = await Promise.all([a, b, c]);
    const wins = [ra, rb, rc].filter((v) => v === true).length;
    expect(wins).toBe(1);
    expect(ra).toBe(true);
    expect(rb).toBe(false);
    expect(rc).toBe(false);
    expect(g.__hintSetCalls.length).toBe(1);
  });

  it("subsequent caller after winner resolves returns false (consumed)", async () => {
    const first = await claim();
    expect(first).toBe(true);
    const second = await claim();
    expect(second).toBe(false);
    const third = await claim();
    expect(third).toBe(false);
    // Once consumed, no further DB activity.
    expect(g.__hintSetCalls.length).toBe(1);
    expect(g.__hintGetCalls).toBe(1);
  });

  it("first caller when DB flag already set -> false; all subsequent -> false", async () => {
    g.__hintMockDb.value = "1";
    const first = await claim();
    expect(first).toBe(false);
    const second = await claim();
    expect(second).toBe(false);
    expect(g.__hintSetCalls.length).toBe(0);
  });

  it("DB error path -> false; consumed latches so future calls also false", async () => {
    g.__hintErrorOnce = true;
    const first = await claim();
    expect(first).toBe(false);
    const second = await claim();
    expect(second).toBe(false);
    expect(g.__hintSetCalls.length).toBe(0);
  });
});
