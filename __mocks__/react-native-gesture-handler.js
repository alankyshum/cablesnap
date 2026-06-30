// Lightweight mock for react-native-gesture-handler in Jest
const React = require('react');
// RNGH re-exports RN's ScrollView/FlatList wrapped as native gesture handlers.
// In tests we just delegate to the real RN components so data/renderItem/
// ListHeaderComponent/ListFooterComponent actually render (a dumb host stub
// would render nothing and break any test that queries list content).
const { ScrollView: RNScrollView, FlatList: RNFlatList } = require('react-native');

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
  ScrollView: React.forwardRef((props, ref) => React.createElement(RNScrollView, { ...props, ref })),
  FlatList: React.forwardRef((props, ref) => React.createElement(RNFlatList, { ...props, ref })),
  gestureHandlerRootHOC: (Component) => Component,
};
