// BLD-561: Full-screen image viewer with pinch-zoom + swipe-down dismiss.
//
// Usage:
//   <ExerciseImageZoomModal
//     visible={open}
//     source={resolved.start}
//     accessibilityLabel={resolved.startAlt}
//     onClose={() => setOpen(false)}
//   />
//
// Why not package this as a general-purpose modal: gesture composition needs
// to be tight (Pinch + Tap on the MODAL, not the drawer inline image) to
// avoid intercepting bottom-sheet drag. This component owns that contract.
import React, { useCallback } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from "react-native-reanimated";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { X } from "lucide-react-native";
import { Text } from "@/components/ui/text";
import { useThemeColors } from "@/hooks/useThemeColors";

type Source = number | { uri: string };

interface Props {
  visible: boolean;
  source: Source | null;
  accessibilityLabel: string;
  onClose: () => void;
}

function ZoomContents({ source, accessibilityLabel, onClose }: { source: Source; accessibilityLabel: string; onClose: () => void }) {
  const colors = useThemeColors();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateY = useSharedValue(0);

  const reset = useCallback(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateY.value = 0;
  }, [scale, savedScale, translateY]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(4, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      }
    });

  const swipeDown = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value <= 1.05) {
        translateY.value = Math.max(0, e.translationY);
      }
    })
    .onEnd(() => {
      if (translateY.value > 120) {
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0);
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (savedScale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
      } else {
        scale.value = withSpring(2);
        savedScale.value = 2;
      }
    });

  const composed = Gesture.Exclusive(pinch, Gesture.Exclusive(doubleTap, swipeDown));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.92)" }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close zoomed image"
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={12}
        >
          <X size={28} color={colors.onPrimary} />
        </Pressable>
        <GestureDetector gesture={composed}>
          <Animated.View style={[styles.imageWrap, animatedStyle]}>
            <Image
              source={source}
              style={styles.image}
              contentFit="contain"
              accessible
              accessibilityRole="image"
              accessibilityLabel={accessibilityLabel}
              transition={150}
            />
          </Animated.View>
        </GestureDetector>
        <Text
          variant="body"
          style={[styles.hint, { color: colors.onSurfaceVariant }]}
        >
          Pinch to zoom • Swipe down to close
        </Text>
      </View>
    </GestureHandlerRootView>
  );
}

export function ExerciseImageZoomModal({ visible, source, accessibilityLabel, onClose }: Props) {
  // Only mount the gesture-heavy contents while visible so tests that don't
  // open the modal never construct gesture objects. Modal transparent scrim
  // remains cheap to render.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {visible && source ? (
        <ZoomContents source={source} accessibilityLabel={accessibilityLabel} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    top: 48,
    right: 16,
    padding: 8,
    zIndex: 10,
  },
  imageWrap: {
    width: "90%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  hint: {
    position: "absolute",
    bottom: 36,
    alignSelf: "center",
    opacity: 0.7,
    fontSize: 12,
  },
});
