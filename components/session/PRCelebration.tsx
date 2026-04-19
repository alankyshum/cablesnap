/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/text";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withSequence,
  cancelAnimation,
  Easing,
} from "react-native-reanimated";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { PRCelebrationState } from "@/hooks/usePRCelebration";

const PARTICLE_COUNT = 18;

const CONFETTI_COLORS = [
  "#FFD700", // gold
  "#FF6038", // primary
  "#FF7A55", // primary light
  "#4CAF50", // green
  "#2196F3", // blue
  "#FF9800", // orange
];

type ParticleConfig = {
  spread: number;
  yOffset: number;
  delay: number;
  rotDir: number;
};

function generateParticleConfigs(): ParticleConfig[] {
  return Array.from({ length: PARTICLE_COUNT }, () => ({
    spread: 80 + Math.random() * 60,
    yOffset: Math.random() * 80,
    delay: Math.random() * 200,
    rotDir: Math.random() > 0.5 ? 1 : -1,
  }));
}

type ConfettiParticleProps = {
  index: number;
  colors: string[];
  config: ParticleConfig;
};

function ConfettiParticle({ index, colors, config }: ConfettiParticleProps) {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0);

  const color = colors[index % colors.length];
  const angle = (index / PARTICLE_COUNT) * 2 * Math.PI;
  const targetX = Math.cos(angle) * config.spread;
  const targetY = -120 - config.yOffset;

  useEffect(() => {
    scale.value = withDelay(config.delay, withSpring(1, { damping: 8, stiffness: 200 }));
    translateX.value = withDelay(config.delay, withTiming(targetX, { duration: 800 }));
    translateY.value = withDelay(
      config.delay,
      withSequence(
        withTiming(targetY, { duration: 600, easing: Easing.out(Easing.cubic) }),
        withTiming(targetY + 200, { duration: 600, easing: Easing.in(Easing.cubic) })
      )
    );
    rotate.value = withDelay(config.delay, withTiming(360 * config.rotDir, { duration: 1200 }));
    opacity.value = withDelay(800, withTiming(0, { duration: 400 }));

    return () => {
      cancelAnimation(translateY);
      cancelAnimation(translateX);
      cancelAnimation(opacity);
      cancelAnimation(rotate);
      cancelAnimation(scale);
    };
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotate.value}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        { backgroundColor: color },
        style,
      ]}
    />
  );
}

type PRCelebrationProps = {
  celebration: PRCelebrationState;
};

export function PRCelebration({ celebration }: PRCelebrationProps) {
  const colors = useThemeColors();
  const badgeScale = useSharedValue(0);
  const badgeOpacity = useSharedValue(0);

  useEffect(() => {
    if (celebration.visible) {
      badgeScale.value = withSpring(1, { damping: 6, stiffness: 180 });
      badgeOpacity.value = withTiming(1, { duration: 200 });
    } else {
      badgeScale.value = withTiming(0, { duration: 300 });
      badgeOpacity.value = withTiming(0, { duration: 300 });
    }

    return () => {
      cancelAnimation(badgeScale);
      cancelAnimation(badgeOpacity);
    };
  }, [celebration.visible]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
    opacity: badgeOpacity.value,
  }));

  const [configs] = useState<ParticleConfig[]>(() => generateParticleConfigs());

  const particles = useMemo(
    () =>
      configs.map((config, i) => (
        <ConfettiParticle key={i} index={i} colors={CONFETTI_COLORS} config={config} />
      )),
    [configs]
  );

  if (!celebration.visible) return null;

  return (
    <View
      style={styles.overlay}
      pointerEvents="none"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={`New personal record for ${celebration.exerciseName}`}
    >
      {celebration.showConfetti && (
        <View style={styles.confettiContainer}>
          {particles}
        </View>
      )}
      <Animated.View style={[styles.badge, { backgroundColor: colors.primary }, badgeStyle]}>
        <Text style={styles.badgeEmoji}>🏆</Text>
        <Text style={[styles.badgeText, { color: colors.onPrimary }]}>NEW PR!</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  confettiContainer: {
    position: "absolute",
    top: "40%",
    left: "50%",
    width: 0,
    height: 0,
  },
  particle: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    elevation: 8,
    shadowColor: "#000", // shadow colors are theme-independent per platform conventions
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  badgeEmoji: {
    fontSize: 24,
  },
  badgeText: {
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 1,
  },
});
