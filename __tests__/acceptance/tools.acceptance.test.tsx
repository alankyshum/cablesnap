jest.setTimeout(10000)

import React from 'react'
import { fireEvent } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => ({}),
    usePathname: () => '/test',
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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))

const mockGetBodySettings = jest.fn().mockResolvedValue({ weight_unit: 'kg' })

jest.mock('../../lib/db', () => ({
  getBodySettings: (...args: unknown[]) => mockGetBodySettings(...args),
}))

import PlateCalculator from '../../app/tools/plates'
import RMCalculator from '../../app/tools/rm'

describe('Plate Calculator Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetBodySettings.mockResolvedValue({ weight_unit: 'kg' })
  })

  it('renders and shows initial empty state', async () => {
    const { findByLabelText } = renderScreen(<PlateCalculator />)

    expect(await findByLabelText('Target weight in kilograms')).toBeTruthy()
  })

  it('entering weight shows plate breakdown', async () => {
    const { findByLabelText, findByText } = renderScreen(<PlateCalculator />)

    const input = await findByLabelText('Target weight in kilograms')
    fireEvent.changeText(input, '100')

    // 100kg with 20kg bar → perSide = 40 → solve: [25, 15]
    expect(await findByText(/\(100 − 20\) ÷ 2 = 40 kg per side/)).toBeTruthy()
    expect(await findByText(/1× 25kg/)).toBeTruthy()
    expect(await findByText(/1× 15kg/)).toBeTruthy()
    expect(await findByText(/Total: 100kg/)).toBeTruthy()
  })

  it('switching unit (kg → lb) updates results', async () => {
    mockGetBodySettings.mockResolvedValue({ weight_unit: 'lb' })
    const { findByLabelText, findByText } = renderScreen(<PlateCalculator />)

    const input = await findByLabelText('Target weight in pounds')
    fireEvent.changeText(input, '225')

    expect(await findByText(/lb per side/)).toBeTruthy()
  })

  it('renders bar weight preset chips without crash (BLD-344)', async () => {
    const { findByLabelText } = renderScreen(<PlateCalculator />)

    // Bar preset chips render numeric children — previously crashed
    // with "Text strings must be rendered within a <Text> component"
    expect(await findByLabelText('20 kilograms bar')).toBeTruthy()
  })

  it('shows appropriate state for empty and invalid weight', async () => {
    const { findByText, findByLabelText } = renderScreen(<PlateCalculator />)

    const input = await findByLabelText('Target weight in kilograms')
    fireEvent.changeText(input, 'abc')

    expect(await findByText('Enter a valid weight')).toBeTruthy()
  })
})

describe('1RM Calculator Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetBodySettings.mockResolvedValue({ weight_unit: 'kg' })
  })

  it('renders weight and reps inputs', async () => {
    const { findByLabelText } = renderScreen(<RMCalculator />)

    expect(await findByLabelText('Weight in kilograms')).toBeTruthy()
    expect(await findByLabelText('Number of repetitions')).toBeTruthy()
  })

  it('entering weight and reps shows estimated 1RM', async () => {
    const { findByLabelText, findByText } = renderScreen(<RMCalculator />)


    fireEvent.changeText(await findByLabelText('Weight in kilograms'), '100')
    fireEvent.changeText(await findByLabelText('Number of repetitions'), '5')

    expect(await findByText('Estimated 1RM')).toBeTruthy()
    // epley(100,5)=116.7 brzycki(100,5)=112.5 lombardi(100,5)=117.5 avg=115.5
    expect(await findByLabelText(/Epley formula, 116\.7/)).toBeTruthy()
    expect(await findByLabelText(/Brzycki formula, 112\.5/)).toBeTruthy()
    expect(await findByLabelText(/Lombardi formula, 117\.5/)).toBeTruthy()
    expect(await findByLabelText(/Average of all formulas, 115\.5/)).toBeTruthy()
  })

  it('shows percentage table', async () => {
    const { findByLabelText, findByText } = renderScreen(<RMCalculator />)

    fireEvent.changeText(await findByLabelText('Weight in kilograms'), '100')
    fireEvent.changeText(await findByLabelText('Number of repetitions'), '5')

    expect(await findByText('% 1RM Table')).toBeTruthy()
    expect(await findByText(/100%/)).toBeTruthy()
    expect(await findByText(/95%/)).toBeTruthy()
  })
})
