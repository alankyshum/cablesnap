/* eslint-disable */
import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useColor } from '@/hooks/useColor';
import React, { useEffect } from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  TouchableWithoutFeedback,
  ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { interiorDuration, interiorSpring, radii, spacing, scrim } from '@/constants/design-tokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAX_TRANSLATE_Y = -SCREEN_HEIGHT + 50;

// Height of the drag-handle area (paddingVertical: 12 top + 12 bottom + pill height 6 = 30px).
const HANDLE_HEIGHT = 30;
// Height of the title block when present (marginTop: 16, paddingBottom: 8, approx text height 24 = ~48px).
const TITLE_HEIGHT = 48;

type BottomSheetContentProps = {
  children: React.ReactNode;
  title?: string;
  style?: ViewStyle;
  rBottomSheetStyle: any;
  cardColor: string;
  handleColor: string;
  onHandlePress?: () => void;
  /** Live translateY so the content area height tracks the sheet position. */
  translateY: SharedValue<number>;
  /** Scroll offset of the inner ScrollView, read by the pan gesture worklet. */
  scrollY: SharedValue<number>;
  /** Pre-computed chrome height (handle + optional title). */
  headerHeight: number;
  /** Bottom safe-area inset for home indicator clearance. */
  safeBottomPadding: number;
  disableContentScroll: boolean;
};

// Component for the bottom sheet content
// It now includes a ScrollView by default for better form handling.
const BottomSheetContent = ({
  children,
  title,
  style,
  rBottomSheetStyle,
  cardColor,
  handleColor,
  onHandlePress,
  translateY,
  scrollY,
  headerHeight,
  safeBottomPadding,
  disableContentScroll,
}: BottomSheetContentProps) => {
  // Track scroll offset in a shared value so the pan gesture worklet can read it.
  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number } } }) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  };

  // Dynamic height: the visible portion of the sheet (-translateY) minus chrome.
  // This makes the scrollable frame grow when the user drags to a higher snap
  // point, so the footer buttons are never hidden below the fold. (BLD-1819)
  const liveContentHeight = useAnimatedStyle(() => {
    const onScreenHeight = Math.min(-translateY.value, SCREEN_HEIGHT);
    return {
      height: Math.max(0, onScreenHeight - headerHeight),
    };
  });

  return (
    <Animated.View
      style={[
        {
          height: SCREEN_HEIGHT,
          width: '100%',
          position: 'absolute',
          top: SCREEN_HEIGHT,
          overflow: 'hidden',
          backgroundColor: cardColor,
            borderTopLeftRadius: radii.xl,
            borderTopRightRadius: radii.xl,
        },
        rBottomSheetStyle,
        style,
      ]}
    >
      {/* Handle */}
      <TouchableWithoutFeedback onPress={onHandlePress}>
        <View
          testID="bottom-sheet-handle"
          style={{
            width: '100%',
             paddingVertical: spacing.md,
            alignItems: 'center',
          }}
        >
          <View
            style={{
             width: spacing.xxl * 2,
             height: spacing.xs + 2,
              backgroundColor: handleColor,
             borderRadius: radii.pill,
            }}
          />
        </View>
      </TouchableWithoutFeedback>

      {/* Title */}
      {title && (
        <View
          style={{
             marginHorizontal: spacing.base,
             marginTop: spacing.base,
             paddingBottom: spacing.sm,
          }}
        >
          <Text variant='title' style={{ textAlign: 'center' }}>
            {title}
          </Text>
        </View>
      )}

      {/* Content wrapper with live height that tracks translateY, so the
          scrollable frame expands when the sheet is dragged higher. The inner
          ScrollView (from RNGH for native gesture coordination) fills it. */}
      <Animated.View style={[liveContentHeight, { flexShrink: 0 }]}>
        {disableContentScroll ? children : <ScrollView
          style={{ flex: 1 }}
           contentContainerStyle={{ padding: spacing.base, paddingBottom: spacing.xl + spacing.base + safeBottomPadding }}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>}
      </Animated.View>
    </Animated.View>
  );
};

type BottomSheetProps = {
  isVisible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  snapPoints?: number[];
  enableBackdropDismiss?: boolean;
  title?: string;
  style?: ViewStyle;
  disablePanGesture?: boolean;
  disableContentScroll?: boolean;
};

export function BottomSheet({
  isVisible,
  onClose,
  children,
  snapPoints = [0.3, 0.6, 0.9],
  enableBackdropDismiss = true,
  title,
  style,
  disablePanGesture = false,
  disableContentScroll = false,
}: BottomSheetProps) {
  const cardColor = useColor('card');
  // Use mutedForeground for handle pill — ensures ≥3:1 contrast against card background (WCAG AA for non-text UI)
  const handleColor = useColor('mutedForeground');
  const { keyboardHeight, isKeyboardVisible } = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const reducedMotion = typeof useReducedMotion === 'function' ? useReducedMotion() : false;

  const translateY = useSharedValue(0);
  const context = useSharedValue({ y: 0 });
  const opacity = useSharedValue(0);
  const currentSnapIndex = useSharedValue(0);
  // Shared value to hold keyboard height for use in worklets
  const keyboardHeightSV = useSharedValue(0);
  // Shared value to hold ScrollView scroll offset for the pan gesture worklet
  const scrollY = useSharedValue(0);

  const snapPointsHeights: number[] = [];
  for (let i = 0; i < snapPoints.length; i++) {
    snapPointsHeights.push(-SCREEN_HEIGHT * snapPoints[i]);
  }
  const defaultHeight = snapPointsHeights[0];

  // Pre-compute the chrome height so the content wrapper can size itself
  // relative to the live translateY (which IS the on-screen height).
  const headerHeight = HANDLE_HEIGHT + (title ? TITLE_HEIGHT : 0);

  const [modalVisible, setModalVisible] = React.useState(false);

  // Effect to handle opening and closing the bottom sheet
  useEffect(() => {
    if (isVisible) {
      setModalVisible(true);
      translateY.value = reducedMotion ? defaultHeight : withSpring(defaultHeight, interiorSpring.disclose);
      opacity.value = reducedMotion ? 1 : withTiming(1, { duration: interiorDuration.modalBackdrop });
      currentSnapIndex.value = 0;
      scrollY.value = 0;
    } else {
      translateY.value = reducedMotion ? 0 : withSpring(0, interiorSpring.disclose);
      opacity.value = reducedMotion ? 0 : withTiming(0, { duration: interiorDuration.exit }, (finished) => {
        if (finished) {
          runOnJS(setModalVisible)(false);
        }
      });
    }
  }, [isVisible, defaultHeight, reducedMotion]);

  // Function to animate the sheet to a specific destination
  const scrollTo = (destination: number, velocity = 0) => {
    'worklet';
    translateY.value = reducedMotion ? destination : withSpring(destination, { ...interiorSpring.disclose, velocity });
  };

  // --- START: KEYBOARD HANDLING LOGIC ---
  useEffect(() => {
    // Update the shared value whenever keyboardHeight changes
    keyboardHeightSV.value = keyboardHeight;

    // Only adjust position if the sheet is currently visible
    if (isVisible) {
      const currentSnapHeight = snapPointsHeights[currentSnapIndex.value];
      let destination: number;

      if (isKeyboardVisible) {
        // Keyboard is open, move sheet up by keyboard height but don't push content off-screen
        destination = Math.max(currentSnapHeight - keyboardHeight, MAX_TRANSLATE_Y);
      } else {
        // Keyboard is closed, return to original snap point
        destination = currentSnapHeight;
      }
      scrollTo(destination);
    }
  }, [keyboardHeight, isKeyboardVisible, isVisible]);
  // --- END: KEYBOARD HANDLING LOGIC ---

  const findClosestSnapPoint = (currentY: number) => {
    'worklet';
    // Adjust the currentY by the keyboard height to find the original snap point
    const adjustedY = currentY + keyboardHeightSV.value;

    let closest = snapPointsHeights[0];
    let minDistance = Math.abs(adjustedY - closest);
    let closestIndex = 0;

    for (let i = 0; i < snapPointsHeights.length; i++) {
      const snapPoint = snapPointsHeights[i];
      const distance = Math.abs(adjustedY - snapPoint);
      if (distance < minDistance) {
        minDistance = distance;
        closest = snapPoint;
        closestIndex = i;
      }
    }
    currentSnapIndex.value = closestIndex;
    return closest;
  };

  const handlePress = () => {
    const nextIndex = (currentSnapIndex.value + 1) % snapPointsHeights.length;
    currentSnapIndex.value = nextIndex;
    const destination = snapPointsHeights[nextIndex] - keyboardHeightSV.value;
    scrollTo(destination);
  };

  const animateClose = () => {
    'worklet';
    translateY.value = reducedMotion ? 0 : withSpring(0, { ...interiorSpring.disclose, velocity: 0 });
    opacity.value = reducedMotion ? 0 : withTiming(0, { duration: interiorDuration.exit }, (finished) => {
      if (finished) {
        runOnJS(onClose)();
      }
    });
  };

  // Highest (most negative) snap point — the sheet is fully expanded.
  const maxSnapY = snapPointsHeights[snapPointsHeights.length - 1];

  const panGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const currentY = translateY.value;
      const isMaxSnap = currentY <= maxSnapY;
      const isScrollAtTop = scrollY.value <= 0;
      const isDraggingDown = event.translationY > 0;

      // At the max snap point: only drag the sheet when the scroll view is at
      // the top AND the user is dragging downward (pull-to-dismiss). Otherwise
      // let the RNGH ScrollView's native gesture handle scrolling.
      // The .activeOffsetY([-10, 10]) already creates a small dead zone so the
      // pan does not steal quick scrolls, and the handle is always draggable
      // because touching above the ScrollView never activates the scroll gesture.
      if (isMaxSnap && !(isScrollAtTop && isDraggingDown)) {
        return;
      }

      const newY = context.value.y + event.translationY;
      if (newY <= 0 && newY >= MAX_TRANSLATE_Y) {
        translateY.value = newY;
      }
    })
    .onEnd((event) => {
      const currentY = translateY.value;
      const startY = context.value.y;

      // If the sheet didn't actually move (the scroll view was scrolling), skip snapping.
      if (Math.abs(currentY - startY) < 1) return;

      const velocity = event.velocityY;

      if (velocity > 500 && currentY > -SCREEN_HEIGHT * 0.2) {
        animateClose();
        return;
      }

      // Find the closest original snap point
      const closestSnapPoint = findClosestSnapPoint(currentY);
      // Calculate the final destination, accounting for the keyboard height
      const finalDestination = closestSnapPoint - keyboardHeightSV.value;
      scrollTo(finalDestination, event.velocityY);
    });

  // Native scroll gesture for coordination with the RNGH ScrollView.
  const nativeScrollGesture = Gesture.Native();
  const composedGesture = Gesture.Simultaneous(panGesture, nativeScrollGesture);

  const rBottomSheetStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const rBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  const handleBackdropPress = () => {
    if (enableBackdropDismiss) {
      animateClose();
    }
  };

  const handleRequestClose = () => {
    animateClose();
  };

  const safeBottomPadding = insets.bottom;

  return (
    <Modal
      visible={modalVisible}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={handleRequestClose}
      // iOS: modal content is the only content exposed to assistive tech, so
      // screen-reader users can't swipe past the sheet to background content.
      // Disabled under test (NODE_ENV=test) so @testing-library/react-native
      // can still query the full tree behind the modal.
      accessibilityViewIsModal={Platform.OS !== 'web' && process.env.NODE_ENV !== 'test'}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Animated.View
          style={[
            { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)' },
            rBackdropStyle,
          ]}
        >
          <TouchableWithoutFeedback onPress={handleBackdropPress}>
            <Animated.View style={{ flex: 1 }} />
          </TouchableWithoutFeedback>

          {disablePanGesture ? (
            <BottomSheetContent
              children={children}
              title={title}
              style={style}
              rBottomSheetStyle={rBottomSheetStyle}
              cardColor={cardColor}
              handleColor={handleColor}
              onHandlePress={() => runOnJS(handlePress)()}
              translateY={translateY}
              scrollY={scrollY}
              headerHeight={headerHeight}
              safeBottomPadding={safeBottomPadding}
              disableContentScroll={disableContentScroll}
            />
          ) : (
            <GestureDetector gesture={composedGesture}>
              <BottomSheetContent
                children={children}
                title={title}
                style={style}
                rBottomSheetStyle={rBottomSheetStyle}
                cardColor={cardColor}
                handleColor={handleColor}
                onHandlePress={() => runOnJS(handlePress)()}
                translateY={translateY}
                scrollY={scrollY}
                headerHeight={headerHeight}
                safeBottomPadding={safeBottomPadding}
                disableContentScroll={disableContentScroll}
              />
            </GestureDetector>
          )}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

// Hook for managing bottom sheet state
export function useBottomSheet() {
  const [isVisible, setIsVisible] = React.useState(false);

  const open = React.useCallback(() => {
    setIsVisible(true);
  }, []);

  const close = React.useCallback(() => {
    setIsVisible(false);
  }, []);

  const toggle = React.useCallback(() => {
    setIsVisible((prev) => !prev);
  }, []);

  return {
    isVisible,
    open,
    close,
    toggle,
  };
}
