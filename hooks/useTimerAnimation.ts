import { useEffect } from "react"
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from "react-native-reanimated"
import { hexToRgb } from "@/lib/format"

interface TimerAnimationInput {
  phase: string
  status: string
  remaining: number
  currentProgress: number
  reduced: boolean | null
  colors: { primary: string; error: string }
}

interface TimerAnimationResult {
  bgStyle: { backgroundColor: string }
  bgColor: string
  ringProgress: SharedValue<number>
}

export function useTimerAnimation({
  phase,
  status,
  remaining,
  currentProgress,
  reduced,
  colors,
}: TimerAnimationInput): TimerAnimationResult {
  const bgOpacity = useSharedValue(0)
  const isWork = useSharedValue(true)
  const ringProgress = useSharedValue(0)

  useEffect(() => {
    const dur = reduced ? 0 : 300
    bgOpacity.value = withTiming(status === "running" ? 0.15 : 0, { duration: dur })
    isWork.value = phase === "work"
    ringProgress.value = withTiming(currentProgress, { duration: dur })
  }, [remaining, phase, status, reduced, bgOpacity, isWork, ringProgress, currentProgress])

  const phaseColorMap = { work: colors.primary, rest: colors.error } as const
  const bgColor = phaseColorMap[phase as keyof typeof phaseColorMap] ?? "transparent"

  const workRgb = hexToRgb(colors.primary)
  const restRgb = hexToRgb(colors.error)

  const bgStyle = useAnimatedStyle(() => ({
    backgroundColor: isWork.value
      ? `rgba(${workRgb}, ${bgOpacity.value})`
      : `rgba(${restRgb}, ${bgOpacity.value})`,
  }))

  return { bgStyle, bgColor, ringProgress }
}
