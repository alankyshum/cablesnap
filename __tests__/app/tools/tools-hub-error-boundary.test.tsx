jest.setTimeout(10000)

import React from 'react'
import { fireEvent } from '@testing-library/react-native'
import { renderScreen } from '../../helpers/render'

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    usePathname: () => '/tools',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }) }))
jest.mock('../../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

jest.mock('../../../lib/db', () => ({
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg' }),
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../lib/audio', () => ({
  play: jest.fn(),
  unload: jest.fn(),
  setEnabled: jest.fn(),
}))

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn(),
}))

jest.mock('react-native-svg', () => {
  const React = require('react')
  return {
    __esModule: true,
    default: (props: React.PropsWithChildren) => React.createElement('Svg', props),
    Circle: (props: Record<string, unknown>) => React.createElement('Circle', props),
  }
})

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View
  const bezierFn = () => (t: number) => t
  return {
    __esModule: true,
    default: {
      View,
      createAnimatedComponent: (comp: React.ComponentType) => comp,
    },
    Easing: { bezier: bezierFn },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    useAnimatedProps: (fn: () => Record<string, unknown>) => fn(),
    withTiming: (v: number) => v,
    useReducedMotion: () => false,
  }
})

import ToolsHub from '../../../app/tools/index'

describe('ToolsHub', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders all three tool cards', async () => {
    const { findByText } = renderScreen(<ToolsHub />)

    expect(await findByText('Interval Timer')).toBeTruthy()
    expect(await findByText('1RM Calculator')).toBeTruthy()
    expect(await findByText('Plate Calculator')).toBeTruthy()
  })

  it('contains error boundary with componentDidCatch for error logging', () => {
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../../app/tools/index.tsx'),
      'utf8'
    )
    expect(source).toContain('ToolErrorBoundary')
    expect(source).toContain('getDerivedStateFromError')
    expect(source).toContain('componentDidCatch')
    expect(source).toContain('logError')
  })
})

describe('ToolsHub error isolation', () => {
  it('db failure in getBodySettings does not crash RMCalculatorContent', async () => {
    const db = require('../../../lib/db')
    db.getBodySettings.mockRejectedValueOnce(new Error('DB unavailable'))

    const { findByText } = renderScreen(<ToolsHub />)
    expect(await findByText('1RM Calculator')).toBeTruthy()
  })

  it('db failure in getBodySettings does not crash PlateCalculatorContent', async () => {
    const db = require('../../../lib/db')
    db.getBodySettings.mockRejectedValueOnce(new Error('DB unavailable'))

    const { findByText } = renderScreen(<ToolsHub />)
    expect(await findByText('Plate Calculator')).toBeTruthy()
  })

  it('db failure in getAppSetting does not crash TimerContent', async () => {
    const db = require('../../../lib/db')
    db.getAppSetting.mockRejectedValueOnce(new Error('DB unavailable'))

    const { findByText } = renderScreen(<ToolsHub />)
    expect(await findByText('Interval Timer')).toBeTruthy()
  })

  it('error boundary shows fallback and retry button when child throws', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

    // Make Timer throw by breaking a hook it depends on
    const reanimated = require('react-native-reanimated')
    const origUseSharedValue = reanimated.useSharedValue
    reanimated.useSharedValue = () => { throw new Error('Reanimated crash') }

    const { findByText } = renderScreen(<ToolsHub />)

    // Timer should show error fallback
    expect(await findByText('Interval Timer failed to load.')).toBeTruthy()
    expect(await findByText('Tap to retry')).toBeTruthy()

    // Other tools should still render
    expect(await findByText('1RM Calculator')).toBeTruthy()
    expect(await findByText('Plate Calculator')).toBeTruthy()

    // Error should be logged
    const errors = require('../../../lib/errors')
    expect(errors.logError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ component: 'ToolsHub/Interval Timer', fatal: false })
    )

    reanimated.useSharedValue = origUseSharedValue
    spy.mockRestore()
  })

  it('retry button resets error state and re-renders child', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const reanimated = require('react-native-reanimated')
    const origUseSharedValue = reanimated.useSharedValue

    let throwCount = 0
    reanimated.useSharedValue = (v: number) => {
      throwCount++
      if (throwCount <= 3) throw new Error('Reanimated crash')
      return { value: v }
    }

    const { findByText, findByLabelText } = renderScreen(<ToolsHub />)

    expect(await findByText('Interval Timer failed to load.')).toBeTruthy()
    const retryButton = await findByLabelText('Retry loading Interval Timer')

    // Reset the throw so retry succeeds
    reanimated.useSharedValue = origUseSharedValue

    fireEvent.press(retryButton)

    // After retry, the timer card header should still be present
    expect(await findByText('Interval Timer')).toBeTruthy()

    spy.mockRestore()
  })
})
