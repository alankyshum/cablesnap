/**
 * BLD-1770: Regression test for the react-native-svg prepare() patch.
 *
 * Verifies that the patched prepare() function does NOT include React Native
 * responder-system props (onStartShouldSetResponder, onResponder*) in its
 * output when called with a truthy onPress handler.
 *
 * Background:
 *   react-native-body-highlighter passes onPress={() => fn?.(part)} to every
 *   <Path> element. Even when `fn` is undefined, the arrow function is truthy,
 *   so hasTouchableProperty() returns true. The pre-patch prepare() then spread
 *   six onResponder* props into the clean object. These fell through
 *   createDOMProps's domProps spread onto SVG <path> DOM elements, causing
 *   React's "Unknown event handler property" warning — rendered visually as a
 *   red error toast in the bld-480-prefix fixture.
 *
 *   BLD-1670 patch stripped onPressIn/onPressOut/onLongPress/delay* from
 *   `...rest` (via props destructuring) but left the 6 onResponder* props that
 *   are conditionally spread into clean{} via hasTouchableProperty.
 *
 *   BLD-1770 patch extends the fix: destructures and discards the 6 responder
 *   props from clean{} before returning, so they never reach createElement.
 *
 * Refs: BLD-1670, BLD-1770.
 */

// We require the patched commonjs build directly (the ESM module build is
// not usable in Jest's CommonJS environment without transpilation).
// patch-package applies the patch before tests run (via the postinstall hook
// which runs `npx patch-package` — Jest picks up the patched node_modules).
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const { prepare } = require('react-native-svg/lib/commonjs/web/utils/prepare') as { prepare: (...args: never[]) => Record<string, unknown> };

// Minimal WebShape stub — prepare() only reads elementRef and touchable* methods.
const makeStub = () => ({
  props: {},
  elementRef: { current: null },
  touchableHandleStartShouldSetResponder: jest.fn(),
  touchableHandleResponderTerminationRequest: jest.fn(),
  touchableHandleResponderGrant: jest.fn(),
  touchableHandleResponderMove: jest.fn(),
  touchableHandleResponderRelease: jest.fn(),
  touchableHandleResponderTerminate: jest.fn(),
  _remeasureMetricsOnActivation: jest.fn(),
});

const RN_RESPONDER_PROPS = [
  'onStartShouldSetResponder',
  'onResponderTerminationRequest',
  'onResponderGrant',
  'onResponderMove',
  'onResponderRelease',
  'onResponderTerminate',
] as const;

describe('react-native-svg prepare() patch (BLD-1770)', () => {
  describe('when onPress is a truthy arrow function (body-highlighter pattern)', () => {
    it('does NOT include any onResponder* prop in the output', () => {
      const stub = makeStub();
      // Mimic body-highlighter: () => onBodyPartPress?.(part) — truthy even
      // when onBodyPartPress is undefined.
      const onPress = () => (undefined as unknown as (x: unknown) => void)?.(null);
      const result = prepare(stub as never, { onPress } as never);

      for (const prop of RN_RESPONDER_PROPS) {
        expect(result).not.toHaveProperty(prop);
      }
    });

    it('does NOT include onStartShouldSetResponder specifically', () => {
      const stub = makeStub();
      const result = prepare(stub as never, { onPress: () => undefined } as never);
      expect(result).not.toHaveProperty('onStartShouldSetResponder');
    });

    it('still maps onPress to onClick', () => {
      const stub = makeStub();
      const handler = jest.fn();
      const result = prepare(stub as never, { onPress: handler } as never);
      expect(result).toHaveProperty('onClick', handler);
    });
  });

  describe('when onPress is not set (no press handler)', () => {
    it('does NOT include any onResponder* prop in the output', () => {
      const stub = makeStub();
      const result = prepare(stub as never, {} as never);
      for (const prop of RN_RESPONDER_PROPS) {
        expect(result).not.toHaveProperty(prop);
      }
    });
  });

  describe('BLD-1670 props also remain stripped', () => {
    it('does NOT include onPressIn/onPressOut/onLongPress in the output', () => {
      const stub = makeStub();
      const result = prepare(stub as never, {
        onPress: () => undefined,
        onPressIn: jest.fn(),
        onPressOut: jest.fn(),
        onLongPress: jest.fn(),
        delayPressIn: 100,
        delayPressOut: 100,
        delayLongPress: 500,
        disabled: true,
      } as never);
      for (const prop of ['onPressIn', 'onPressOut', 'onLongPress', 'delayPressIn', 'delayPressOut', 'delayLongPress', 'disabled']) {
        expect(result).not.toHaveProperty(prop);
      }
    });
  });
});

/**
 * BLD-2349: Regression test for RN-only accessibility prop stripping.
 *
 * react-native-body-highlighter's SvgMaleWrapper/SvgFemaleWrapper hardcodes
 * `accessible={true}` (and `accessibilityLabel`) on every <Svg>/<Path> element.
 * The render tree is: MusclesWorkedCard → MuscleMap → <Body> → <Svg>/<Path>.
 *
 * `accessible`, `accessibilityElementsHidden`, and `importantForAccessibility`
 * are RN-only props with no SVG DOM equivalent. When they fall into `...rest`
 * they reach `createDOMProps` and are emitted raw onto the SVG DOM element,
 * causing React's "Received `true` for a non-boolean attribute `accessible`"
 * warning — rendered as a red error toast in dev mode on the bld-480-prefix
 * audit fixture.
 *
 * `accessibilityLabel` is intentionally NOT stripped here — react-native-web
 * correctly maps it to `aria-label` (it is in createDOMProps's `_excluded`
 * denylist) so stripping it would remove legitimate a11y labeling.
 *
 * Refs: BLD-2349, BLD-1670, BLD-1770.
 */

const RN_A11Y_PROPS = [
  'accessible',
  'accessibilityElementsHidden',
  'importantForAccessibility',
] as const;

describe('react-native-svg prepare() patch (BLD-2349)', () => {
  describe('RN-only accessibility props are stripped', () => {
    it('does NOT include accessible / accessibilityElementsHidden / importantForAccessibility in the output', () => {
      const stub = makeStub();
      const result = prepare(stub as never, {
        accessible: true,
        accessibilityElementsHidden: false,
        importantForAccessibility: 'yes',
      } as never);
      for (const prop of RN_A11Y_PROPS) {
        expect(result).not.toHaveProperty(prop);
      }
    });

    it('does NOT include accessible specifically (body-highlighter hardcodes accessible={true})', () => {
      const stub = makeStub();
      const onPress = () => (undefined as unknown as (x: unknown) => void)?.(null);
      const result = prepare(stub as never, {
        onPress,
        accessible: true,
        accessibilityLabel: 'body figure',
      } as never);
      expect(result).not.toHaveProperty('accessible');
    });

    it('preserves accessibilityLabel so react-native-web can map it to aria-label', () => {
      const stub = makeStub();
      const result = prepare(stub as never, {
        accessibilityLabel: 'muscle group diagram',
        accessible: true,
      } as never);
      // accessibilityLabel must NOT be stripped — it is handled by createDOMProps
      // which maps it to aria-label. Stripping it would remove legitimate a11y.
      expect(result).toHaveProperty('accessibilityLabel', 'muscle group diagram');
    });

    it('strips all three RN a11y props together (body-highlighter SvgWrapper pattern)', () => {
      const stub = makeStub();
      const onPress = () => (undefined as unknown as (x: unknown) => void)?.(null);
      const result = prepare(stub as never, {
        onPress,
        accessible: true,
        accessibilityLabel: 'human body diagram',
        accessibilityElementsHidden: false,
        importantForAccessibility: 'yes',
      } as never);
      for (const prop of RN_A11Y_PROPS) {
        expect(result).not.toHaveProperty(prop);
      }
      // accessibilityLabel must survive
      expect(result).toHaveProperty('accessibilityLabel', 'human body diagram');
    });
  });
});
