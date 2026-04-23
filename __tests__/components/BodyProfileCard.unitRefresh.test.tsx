import React from 'react'
import { waitFor, act } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/test',
  useFocusEffect: jest.fn(),
  Stack: { Screen: () => null },
  Redirect: () => null,
}))

jest.mock('@react-navigation/native', () => {
  const RealReact = require('react')
  return {
    // Use [cb] dep so callback-identity changes re-fire while focused —
    // matches react-navigation's actual behavior and exposes regressions
    // where load is unintentionally tied to props (BLD-515 review).
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [cb])
    },
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }),
}))

jest.mock('../../lib/db', () => {
  const SAVED = JSON.stringify({
    birthYear: 1990,
    weight: 70,
    height: 175,
    sex: 'male',
    activityLevel: 'moderately_active',
    goal: 'maintain',
    weightUnit: 'kg',
    heightUnit: 'cm',
  })
  return {
    getAppSetting: jest.fn().mockImplementation((key: string) => {
      if (key === 'nutrition_profile') return Promise.resolve(SAVED)
      return Promise.resolve(null)
    }),
    setAppSetting: jest.fn().mockResolvedValue(undefined),
    updateMacroTargets: jest.fn().mockResolvedValue(undefined),
    getBodySettings: jest.fn().mockResolvedValue({
      weight_unit: 'kg',
      measurement_unit: 'cm',
      sex: 'male',
      weight_goal: null,
      body_fat_goal: null,
    }),
  }
})

jest.mock('../../lib/db/body', () => ({
  getBodySettings: jest.fn().mockResolvedValue({
    weight_unit: 'kg',
    measurement_unit: 'cm',
    sex: 'male',
    weight_goal: null,
    body_fat_goal: null,
  }),
  getLatestBodyWeight: jest.fn().mockResolvedValue(null),
  updateBodySex: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../lib/nutrition-calc', () => ({
  ACTIVITY_LABELS: {
    sedentary: 'Sedentary',
    lightly_active: 'Lightly Active',
    moderately_active: 'Moderately Active',
    very_active: 'Very Active',
    extra_active: 'Extra Active',
  },
  ACTIVITY_DESCRIPTIONS: {
    sedentary: '', lightly_active: '', moderately_active: '', very_active: '', extra_active: '',
  },
  GOAL_LABELS: { cut: 'Cut', maintain: 'Maintain', bulk: 'Bulk' },
  calculateFromProfile: jest.fn().mockReturnValue({ calories: 2200, protein: 150, carbs: 275, fat: 73 }),
  calculateBMR: jest.fn().mockReturnValue(1700),
  convertToMetric: jest.fn().mockReturnValue({ weight_kg: 70, height_cm: 175 }),
  calculateDeviationPercent: jest.fn().mockReturnValue(0),
  migrateProfile: (p: unknown) => p,
}))

import BodyProfileCard from '../../components/BodyProfileCard'

type HarnessHandle = {
  setW: (v: 'kg' | 'lb') => void
  setH: (v: 'cm' | 'in') => void
}

const Harness = React.forwardRef<HarnessHandle, { initialWeight?: 'kg' | 'lb'; initialHeight?: 'cm' | 'in' }>(
  function Harness({ initialWeight = 'kg', initialHeight = 'cm' }, ref) {
    const [w, setW] = React.useState<'kg' | 'lb'>(initialWeight)
    const [h, setH] = React.useState<'cm' | 'in'>(initialHeight)
    React.useImperativeHandle(ref, () => ({ setW, setH }), [])
    return <BodyProfileCard weightUnit={w} heightUnit={h} />
  },
)

describe('BodyProfileCard — unit prop refresh (GH #311)', () => {
  it('renders label in kg when prop is kg', async () => {
    const { findByLabelText } = renderScreen(<BodyProfileCard weightUnit="kg" heightUnit="cm" />)
    await findByLabelText('Weight in kg')
    await findByLabelText('Height in cm')
  })

  it('switches label and converts value when weightUnit prop changes from kg → lb', async () => {
    const handle = React.createRef<HarnessHandle>()
    const { findByLabelText, queryByLabelText } = renderScreen(<Harness ref={handle} />)

    const kgInput = await findByLabelText('Weight in kg')
    expect(kgInput.props.value).toBe('70')

    await act(async () => {
      handle.current!.setW('lb')
    })

    await waitFor(() => {
      expect(queryByLabelText('Weight in lb')).not.toBeNull()
    })
    const lbInput = await findByLabelText('Weight in lb')
    expect(lbInput.props.value).toBe('154.3')
    expect(queryByLabelText('Weight in kg')).toBeNull()
  })

  it('switches label and converts height when heightUnit prop changes from cm → in', async () => {
    const handle = React.createRef<HarnessHandle>()
    const { findByLabelText, queryByLabelText } = renderScreen(<Harness ref={handle} />)

    const cmInput = await findByLabelText('Height in cm')
    expect(cmInput.props.value).toBe('175')

    await act(async () => {
      handle.current!.setH('in')
    })

    await waitFor(() => {
      expect(queryByLabelText('Height in in')).not.toBeNull()
    })
    const inInput = await findByLabelText('Height in in')
    expect(inInput.props.value).toBe('68.9')
    expect(queryByLabelText('Height in cm')).toBeNull()
  })

  it('is symmetric: lb → kg conversion also works', async () => {
    const handle = React.createRef<HarnessHandle>()
    const { findByLabelText } = renderScreen(<Harness ref={handle} />)
    await findByLabelText('Weight in kg')

    await act(async () => {
      handle.current!.setW('lb')
    })
    const lbInput = await findByLabelText('Weight in lb')
    expect(lbInput.props.value).toBe('154.3')

    await act(async () => {
      handle.current!.setW('kg')
    })
    const kgInput = await findByLabelText('Weight in kg')
    expect(parseFloat(kgInput.props.value)).toBeCloseTo(70, 1)
  })

  // Regression test for review feedback (BLD-515): an in-progress unsaved
  // edit must survive a unit toggle. Previously, loadProfile depended on the
  // external unit props via useCallback, so useFocusEffect re-fired on
  // toggle and clobbered the edit with the persisted (70 kg) value.
  it('preserves in-progress unsaved edit when unit toggles (regression)', async () => {
    const { fireEvent } = require('@testing-library/react-native')
    const handle = React.createRef<HarnessHandle>()
    const { findByLabelText } = renderScreen(<Harness ref={handle} />)

    const kgInput = await findByLabelText('Weight in kg')
    expect(kgInput.props.value).toBe('70')

    // User edits weight in-place to 72 kg
    await act(async () => {
      fireEvent.changeText(kgInput, '72')
    })

    // User toggles unit kg → lb without leaving the screen
    await act(async () => {
      handle.current!.setW('lb')
    })

    const lbInput = await findByLabelText('Weight in lb')
    // 72 kg * 2.20462 = 158.7 — the EDITED value converted, NOT the
    // persisted 70 kg (which would convert to 154.3).
    expect(lbInput.props.value).toBe('158.7')
    expect(lbInput.props.value).not.toBe('154.3')
  })
})
