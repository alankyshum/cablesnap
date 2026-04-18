import { Platform, StyleSheet, View } from "react-native"
import { Text } from "@/components/ui/text"
import Svg, { Circle } from "react-native-svg"
import Animated, { useAnimatedProps, SharedValue } from "react-native-reanimated"
import { format } from "../../lib/timer"
import { typography } from "../../constants/design-tokens"

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export const RING_SIZE = 220
export const RING_STROKE = 8
export const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

type TimerRingProps = {
  remaining: number
  bgColor: string
  ringProgress: SharedValue<number>
  colors: {
    surfaceVariant: string
    primary: string
    onSurface: string
  }
}

export function TimerRing({ remaining, bgColor, ringProgress, colors }: TimerRingProps) {
  const ringAnimated = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - ringProgress.value),
  }))

  return (
    <View style={styles.ringWrap} accessibilityLabel={`${format(remaining)} remaining`}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={colors.surfaceVariant}
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke={bgColor || colors.primary}
          strokeWidth={RING_STROKE}
          fill="none"
          strokeDasharray={RING_CIRCUMFERENCE}
          animatedProps={ringAnimated}
          strokeLinecap="round"
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <View style={styles.countdown}>
        <Text
          style={[styles.time, { color: colors.onSurface }]}
          accessibilityLabel={`${remaining} seconds remaining`}
          accessibilityLiveRegion="polite"
        >
          {format(remaining)}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  ringWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 16,
  },
  ringSvg: {
    position: "absolute",
  },
  countdown: {
    justifyContent: "center",
    alignItems: "center",
  },
  time: {
    ...typography.display,
    fontVariant: ["tabular-nums"],
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
})
