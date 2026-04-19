// Lightweight mock for react-native-reanimated v4
// Avoids loading native worklets module in Jest

const React = require('react');

const noop = () => {};
const noopValue = (v) => ({ value: v });

// Chainable layout animation mock — supports .delay().duration() and .duration().delay()
const makeLayoutAnim = () => {
  const anim = {};
  anim.duration = () => anim;
  anim.delay = () => anim;
  anim.springify = () => anim;
  anim.damping = () => anim;
  anim.stiffness = () => anim;
  anim.withInitialValues = () => anim;
  anim.withCallback = () => anim;
  anim.randomDelay = () => anim;
  anim.build = () => anim;
  return anim;
};

module.exports = {
  __esModule: true,
  default: {
    View: React.forwardRef((props, ref) => React.createElement('View', { ...props, ref })),
    Text: React.forwardRef((props, ref) => React.createElement('Text', { ...props, ref })),
    Image: React.forwardRef((props, ref) => React.createElement('Image', { ...props, ref })),
    ScrollView: React.forwardRef((props, ref) => React.createElement('ScrollView', { ...props, ref })),
    FlatList: React.forwardRef((props, ref) => React.createElement('FlatList', { ...props, ref })),
    createAnimatedComponent: (Component) => React.forwardRef((props, ref) => React.createElement(Component, { ...props, ref })),
  },
  useSharedValue: noopValue,
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedStyle: (fn) => fn(),
  useAnimatedScrollHandler: () => noop,
  useAnimatedGestureHandler: () => noop,
  useAnimatedRef: () => ({ current: null }),
  useAnimatedReaction: noop,
  useReducedMotion: () => false,
  withTiming: (v) => v,
  withSpring: (v) => v,
  withDecay: (v) => v,
  withDelay: (_delay, v) => v,
  withSequence: (...args) => args[args.length - 1],
  withRepeat: (v) => v,
  cancelAnimation: noop,
  Easing: {
    linear: noop,
    ease: noop,
    quad: noop,
    cubic: noop,
    poly: noop,
    sin: noop,
    circle: noop,
    exp: noop,
    elastic: noop,
    back: noop,
    bounce: noop,
    bezier: () => noop,
    bezierFn: () => noop,
    steps: noop,
    in: noop,
    out: noop,
    inOut: noop,
  },
  interpolate: (v) => v,
  interpolateColor: (_value, _inputRange, outputRange) => outputRange[0],
  Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
  runOnUI: (fn) => fn,
  runOnJS: (fn) => fn,
  createAnimatedComponent: (Component) =>
    React.forwardRef((props, ref) => React.createElement(Component, { ...props, ref })),
  FadeIn: makeLayoutAnim(),
  FadeOut: makeLayoutAnim(),
  FadeInDown: makeLayoutAnim(),
  FadeInUp: makeLayoutAnim(),
  FadeOutDown: makeLayoutAnim(),
  FadeOutUp: makeLayoutAnim(),
  SlideInRight: makeLayoutAnim(),
  SlideOutRight: makeLayoutAnim(),
  Layout: makeLayoutAnim(),
  LinearTransition: makeLayoutAnim(),
  ZoomIn: makeLayoutAnim(),
  ZoomOut: makeLayoutAnim(),
  measure: () => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 }),
  scrollTo: noop,
  setGestureState: noop,
  makeMutable: noopValue,
  SharedValue: {},
  ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
  getRelativeCoords: () => ({ x: 0, y: 0 }),
  enableLayoutAnimations: noop,
  configureLayoutAnimations: noop,
};
