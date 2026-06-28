import { StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadeInUp,
  type EntryExitAnimationFunction,
} from 'react-native-reanimated';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { duration, easing, spacing } from '@/constants/design-tokens';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import type { ThemeColors } from '@/hooks/useThemeColors';

/**
 * Per-tile stagger step (ms). Each tile's entrance is delayed by
 * `min(index, MAX_STAGGER_STEPS) * STAGGER_STEP_MS` so the stack reveals as a
 * gentle cascade rather than all at once.
 */
export const STAGGER_STEP_MS = 40;

/**
 * Cap the number of staggered steps so the *last* tile is never perceptibly
 * slow and the screenshot/e2e settle window stays bounded
 * (`MAX_STAGGER_STEPS * STAGGER_STEP_MS` = 320ms added delay at most).
 */
export const MAX_STAGGER_STEPS = 8;

/** Staggered entrance delay (ms) for the tile at `index` (clamped, never negative). */
export function staggerDelayMs(index: number): number {
  const safe = Number.isFinite(index) && index > 0 ? Math.floor(index) : 0;
  return Math.min(safe, MAX_STAGGER_STEPS) * STAGGER_STEP_MS;
}

/**
 * Resolve the `entering` animation for a tile.
 *
 * - Under reduced motion → `undefined` (the tile mounts at its final state
 *   instantly; **no** animation). This is the key accessibility contract.
 * - Otherwise → a short fade/slide-up (`duration.fast`, decelerate) staggered by
 *   tile order. Built inline from `FadeInUp` + design tokens (rather than the
 *   `lib/animations/layout` barrel) so the tile owns exactly the entrance it
 *   uses and pulls in no unrelated exit/slide animators.
 *
 * Extracted as a pure function so the reduced-motion + stagger decision is unit
 * testable without inspecting reanimated's opaque builder internals.
 */
export function tileEntering(
  index: number,
  reduceMotion: boolean,
): EntryExitAnimationFunction | undefined {
  if (reduceMotion) return undefined;
  return FadeInUp.duration(duration.fast)
    .easing(easing.decelerate)
    .delay(staggerDelayMs(index)) as unknown as EntryExitAnimationFunction;
}

type Props = {
  /**
   * Optional tile heading, rendered at `subtitle` scale (18/600). Omit for
   * tiles whose child component supplies its own heading.
   */
  title?: string;
  children: ReactNode;
  colors: ThemeColors;
  /** Extra style merged onto the underlying Card (e.g. masonry cell sizing). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * Position of this tile in the Settings stack (0-based). Drives the staggered
   * entrance delay. Defaults to `0` (no stagger). Has no visible effect under
   * reduced motion.
   */
  index?: number;
};

/**
 * SettingsTile — the standard flat container for one Settings section.
 *
 * BLD-2032 (epic BLD-2028, P0-4): centralizes tile padding (`spacing.base`) and
 * title type (`subtitle` 18/600) so density is tuned in one place rather than
 * per-card. The tile *is* the Card — children must not nest another Card inside
 * (the declutter epic bans card-in-card).
 *
 * Renders the `outline` Card variant (1px hairline, no drop shadow) so the
 * Settings stack reads as a calm list rather than a column of floating cards,
 * matching the declutter treatment applied to every other Settings card in
 * BLD-2030.
 *
 * Motion (BLD-2036, P2-8): the Card is wrapped in an `Animated.View` that plays
 * a short, staggered fade/slide-up on first paint, and is **instant under
 * reduced motion**. The entrance uses reanimated's declarative `entering` (the
 * element is mounted and laid out immediately) — tile content is NEVER gated on
 * the animation, so the headless-safe contract of `Masonry` is preserved: tiles
 * render fully even where worklets don't run (SSR/Playwright/jest) or the
 * animation short-circuits. The wrapper is layout-transparent (`width: 100%`,
 * no padding/margin) so masonry cell sizing is unaffected.
 */
export function SettingsTile({ title, children, colors, style, testID, index = 0 }: Props) {
  const reduceMotion = useReducedMotion();
  const entering = tileEntering(index, reduceMotion);

  return (
    <Animated.View
      entering={entering}
      style={styles.entrance}
      testID={testID ? `${testID}-entrance` : undefined}
    >
      <Card
        variant="outline"
        testID={testID}
        style={StyleSheet.flatten([
          styles.tile,
          { backgroundColor: colors.surface },
          style,
        ])}
      >
        {title ? (
          <Text variant="subtitle" style={[styles.title, { color: colors.onSurface }]}>
            {title}
          </Text>
        ) : null}
        {children}
      </Card>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Layout-transparent wrapper: full-width so the Card fills the masonry cell
  // exactly as it did before, with no padding/margin of its own.
  entrance: {
    width: '100%',
  },
  tile: {
    padding: spacing.base,
  },
  title: {
    marginBottom: spacing.sm,
  },
});
