// Lightweight mock for react-native-gesture-handler in Jest
const React = require('react');

const GestureDetector = ({ children }) => children;
const GestureHandlerRootView = ({ children, ...props }) =>
  React.createElement('View', props, children);

const createGesture = () => {
  const gesture = {
    onStart: () => gesture,
    onUpdate: () => gesture,
    onEnd: () => gesture,
    onFinalize: () => gesture,
    onChange: () => gesture,
    onTouchesDown: () => gesture,
    onTouchesMove: () => gesture,
    onTouchesUp: () => gesture,
    onTouchesCancelled: () => gesture,
    enabled: () => gesture,
    minDistance: () => gesture,
    minPointers: () => gesture,
    maxPointers: () => gesture,
    activeOffsetX: () => gesture,
    activeOffsetY: () => gesture,
    failOffsetX: () => gesture,
    failOffsetY: () => gesture,
    hitSlop: () => gesture,
    simultaneousWithExternalGesture: () => gesture,
    requireExternalGestureToFail: () => gesture,
    withTestId: () => gesture,
    runOnJS: () => gesture,
  };
  return gesture;
};

const Gesture = {
  Pan: createGesture,
  Tap: createGesture,
  LongPress: createGesture,
  Pinch: createGesture,
  Rotation: createGesture,
  Fling: createGesture,
  Native: createGesture,
  Manual: createGesture,
  Race: (...args) => createGesture(),
  Simultaneous: (...args) => createGesture(),
  Exclusive: (...args) => createGesture(),
};

module.exports = {
  GestureDetector,
  GestureHandlerRootView,
  Gesture,
  Directions: { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 },
  State: { UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5 },
  PanGestureHandler: 'PanGestureHandler',
  TapGestureHandler: 'TapGestureHandler',
  FlingGestureHandler: 'FlingGestureHandler',
  LongPressGestureHandler: 'LongPressGestureHandler',
  PinchGestureHandler: 'PinchGestureHandler',
  RotationGestureHandler: 'RotationGestureHandler',
  ScrollView: React.forwardRef((props, ref) => React.createElement('ScrollView', { ...props, ref })),
  FlatList: React.forwardRef((props, ref) => React.createElement('FlatList', { ...props, ref })),
  gestureHandlerRootHOC: (Component) => Component,
};
