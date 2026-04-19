/* eslint-disable */
import { Text } from '@/components/ui/text';
import { Colors } from '@/theme/colors';
import { AlertCircle, Check, Info, X } from 'lucide-react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  Dimensions,
  Platform,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
}

interface ToastProps extends ToastData {
  onDismiss: (id: string) => void;
  index: number;
}

const { width: screenWidth } = Dimensions.get('window');
const TOAST_HEIGHT = 52;
const TOAST_MARGIN = 8;
const MIN_TOAST_WIDTH = 200;
const MAX_TOAST_WIDTH = screenWidth - 64;

export function Toast({
  id,
  title,
  description,
  variant = 'default',
  onDismiss,
  index,
  action,
}: ToastProps) {
  // Reanimated shared values
  const translateY = useSharedValue(-20);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.85);

  // Dynamic Island colors (dark theme optimized)
  const backgroundColor = '#1C1C1E'; // iOS Dynamic Island background
  const mutedTextColor = '#8E8E93'; // iOS secondary text color

  useEffect(() => {
    // Punch-in animation: scale 0.85→1.0 + opacity 0→1, 200ms
    translateY.value = withTiming(0, { duration: 200 });
    opacity.value = withTiming(1, { duration: 200 });
    scale.value = withTiming(1, { duration: 200 });
  }, []);

  const getVariantColor = () => {
    switch (variant) {
      case 'success':
        return '#30D158'; // iOS green
      case 'error':
        return '#FF453A'; // iOS red
      case 'warning':
        return '#FF9F0A'; // iOS orange
      case 'info':
        return '#007AFF'; // iOS blue
      default:
        return '#8E8E93'; // iOS gray
    }
  };

  const getIcon = () => {
    const iconProps = { size: 16, color: getVariantColor() };

    switch (variant) {
      case 'success':
        return <Check {...iconProps} />;
      case 'error':
        return <X {...iconProps} />;
      case 'warning':
        return <AlertCircle {...iconProps} />;
      case 'info':
        return <Info {...iconProps} />;
      default:
        return null;
    }
  };

  const dismiss = useCallback(() => {
    const onDismissAction = () => {
      'worklet';
      runOnJS(onDismiss)(id);
    };

    // Fade out, 150ms
    opacity.value = withTiming(0, { duration: 150 }, (finished) => {
      if (finished) {
        onDismissAction();
      }
    });
    scale.value = withTiming(0.85, { duration: 150 });
  }, [id, onDismiss]);

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      const { translationX, velocityX } = event;

      if (
        Math.abs(translationX) > screenWidth * 0.25 ||
        Math.abs(velocityX) > 800
      ) {
        const onDismissAction = () => {
          'worklet';
          runOnJS(onDismiss)(id);
        };

        // Animate out horizontally
        translateX.value = withTiming(
          translationX > 0 ? screenWidth : -screenWidth,
          { duration: 200 }
        );
        opacity.value = withTiming(0, { duration: 150 }, (finished) => {
          if (finished) {
            onDismissAction();
          }
        });
      } else {
        // Snap back
        translateX.value = withTiming(0, { duration: 150 });
      }
    });

  const getTopPosition = () => {
    const statusBarHeight = Platform.OS === 'ios' ? 59 : 20;
    return statusBarHeight + index * (TOAST_HEIGHT + TOAST_MARGIN);
  };

  const animatedContainerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
      { scale: scale.value },
    ],
  }));

  const toastStyle: ViewStyle = {
    position: 'absolute',
    top: getTopPosition(),
    alignSelf: 'center',
    shadowColor: Colors.light.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000 + index,
  };

  const islandStyle: ViewStyle = {
    minWidth: MIN_TOAST_WIDTH,
    maxWidth: MAX_TOAST_WIDTH,
    borderRadius: 14,
    backgroundColor,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[toastStyle, animatedContainerStyle]}>
        <View style={islandStyle}>
          {getIcon() && (
            <View style={{ marginRight: 10 }}>{getIcon()}</View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            {title && (
              <Text
                variant='subtitle'
                style={{
                  color: Colors.light.onToast,
                  fontSize: 14,
                  fontWeight: '600',
                  marginBottom: description ? 2 : 0,
                }}
                numberOfLines={1}
                ellipsizeMode='tail'
              >
                {title}
              </Text>
            )}
            {description && (
              <Text
                variant='caption'
                style={{
                  color: mutedTextColor,
                  fontSize: 13,
                  fontWeight: '400',
                }}
                numberOfLines={2}
                ellipsizeMode='tail'
              >
                {description}
              </Text>
            )}
          </View>

          {action && (
            <TouchableOpacity
              onPress={action.onPress}
              style={{
                marginLeft: 12,
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: getVariantColor(),
                borderRadius: 12,
              }}
            >
              <Text
                variant='caption'
                style={{
                  color: Colors.light.onToast,
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {action.label}
              </Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={dismiss}
            style={{ marginLeft: 8, padding: 4, borderRadius: 8 }}
          >
            <X size={14} color={mutedTextColor} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastOptions {
  description?: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastContextType {
  toast: (toast: string | Omit<ToastData, 'id'>) => void;
  success: (title: string, options?: string | ToastOptions) => void;
  error: (title: string, options?: string | ToastOptions) => void;
  warning: (title: string, options?: string | ToastOptions) => void;
  info: (title: string, options?: string | ToastOptions) => void;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

interface ToastProviderProps {
  children: React.ReactNode;
  maxToasts?: number;
}

export function ToastProvider({ children, maxToasts = 3 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addToast = useCallback(
    (toastData: string | Omit<ToastData, 'id'>) => {
      const data: Omit<ToastData, 'id'> =
        typeof toastData === 'string' ? { title: toastData } : toastData;
      const id = generateId();
      const newToast: ToastData = {
        ...data,
        id,
        duration: data.duration ?? 4000,
      };

      setToasts((prev) => {
        const updated = [newToast, ...prev];
        return updated.slice(0, maxToasts);
      });

      // Auto dismiss after duration
      if (newToast.duration && newToast.duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, newToast.duration);
      }
    },
    [maxToasts]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const createVariantToast = useCallback(
    (variant: ToastVariant, title: string, options?: string | ToastOptions) => {
      const opts: ToastOptions | undefined =
        typeof options === 'string' ? { description: options } : options;
      addToast({
        title,
        description: opts?.description,
        variant,
        action: opts?.action,
        duration: opts?.duration,
      });
    },
    [addToast]
  );

  const contextValue: ToastContextType = {
    toast: addToast,
    success: (title, options) =>
      createVariantToast('success', title, options),
    error: (title, options) =>
      createVariantToast('error', title, options),
    warning: (title, options) =>
      createVariantToast('warning', title, options),
    info: (title, options) =>
      createVariantToast('info', title, options),
    dismiss: dismissToast,
    dismissAll,
  };

  const containerStyle: ViewStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    pointerEvents: 'box-none',
  };

  return (
    <ToastContext.Provider value={contextValue}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {children}
        <View style={containerStyle} pointerEvents='box-none'>
          {toasts.map((toast, index) => (
            <Toast
              key={toast.id}
              {...toast}
              index={index}
              onDismiss={dismissToast}
            />
          ))}
        </View>
      </GestureHandlerRootView>
    </ToastContext.Provider>
  );
}

// Hook to use toast
export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
