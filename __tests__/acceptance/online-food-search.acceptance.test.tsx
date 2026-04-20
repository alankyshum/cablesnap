/**
 * BLD-248 / BLD-318: Online Food Search acceptance tests.
 * Tests online search flow, dedup+favorite, and error states
 * via InlineFoodSearch component.
 */

import React from 'react'
import { fireEvent, waitFor, act } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { resetIds } from '../helpers/factories'

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    useLocalSearchParams: () => ({}),
    usePathname: () => '/nutrition',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [cb])
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn() }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn() }))

const mockAddFoodEntry = jest.fn().mockResolvedValue({
  id: 'fe-1', name: 'Test Food', calories: 200, protein: 10,
  carbs: 25, fat: 8, serving_size: '1 cup (240ml)', is_favorite: false, created_at: Date.now(),
})
const mockAddDailyLog = jest.fn().mockResolvedValue({ id: 'dl-1' })
const mockGetFavoriteFoods = jest.fn().mockResolvedValue([])
const mockDeleteDailyLog = jest.fn().mockResolvedValue(undefined)
const mockFindDuplicate = jest.fn().mockResolvedValue(null)
const mockToggleFavorite = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  addFoodEntry: (...args: unknown[]) => mockAddFoodEntry(...args),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavoriteFoods(...args),
  deleteDailyLog: (...args: unknown[]) => mockDeleteDailyLog(...args),
  findDuplicateFoodEntry: (...args: unknown[]) => mockFindDuplicate(...args),
  toggleFavorite: (...args: unknown[]) => mockToggleFavorite(...args),
}))

const mockFetchWithTimeout = jest.fn()

jest.mock('../../lib/openfoodfacts', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  lookupBarcodeWithTimeout: jest.fn().mockResolvedValue({ ok: false, error: 'timeout' }),
}))

import InlineFoodSearch from '../../components/InlineFoodSearch'

const mockOnFoodLogged = jest.fn()
const mockOnSnack = jest.fn()

function renderSearch() {
  return renderScreen(
    <InlineFoodSearch dateKey="2026-01-15" onFoodLogged={mockOnFoodLogged} onSnack={mockOnSnack} />
  )
}

describe('Online Food Search (BLD-248)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    resetIds()
    mockGetFavoriteFoods.mockResolvedValue([])
    mockFetchWithTimeout.mockResolvedValue({ ok: true, foods: [] })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('search flow', () => {
    it('fires online search after debounce for queries >= 2 chars', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        foods: [{
          name: 'Chobani Greek Yogurt',
          calories: 100, protein: 15, carbs: 6, fat: 2,
          servingLabel: '1 cup (150g)', isPerServing: true,
        }],
      })

      const screen = renderSearch()
      const input = await screen.findByLabelText('Search foods')

      await act(async () => {
        fireEvent.changeText(input, 'yogurt')
        jest.advanceTimersByTime(500)
      })

      await waitFor(() => {
        expect(mockFetchWithTimeout).toHaveBeenCalledWith('yogurt', expect.anything())
      })
    })

    it('shows no results message when search returns empty', async () => {
      mockFetchWithTimeout.mockResolvedValue({ ok: true, foods: [] })

      const screen = renderSearch()
      const input = await screen.findByLabelText('Search foods')

      await act(async () => {
        fireEvent.changeText(input, 'zznonexistent')
        jest.advanceTimersByTime(500)
      })

      await waitFor(() => {
        expect(screen.getByText(/No foods found/)).toBeTruthy()
      })
    })
  })

  describe('dedup and favorite', () => {
    it('toggles favorite when dedup reuses unfavorited entry with saveFav=true', async () => {
      const existingEntry = {
        id: 'existing-1', name: 'Test Food', calories: 200, protein: 10,
        carbs: 25, fat: 8, serving_size: '1 cup', is_favorite: false, created_at: Date.now(),
      }
      mockFindDuplicate.mockResolvedValue(existingEntry)

      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        foods: [{
          name: 'Test Food', calories: 200, protein: 10, carbs: 25, fat: 8,
          servingLabel: '1 cup', isPerServing: true,
        }],
      })

      const screen = renderSearch()
      const input = await screen.findByLabelText('Search foods')

      await act(async () => {
        fireEvent.changeText(input, 'test food')
        jest.advanceTimersByTime(500)
      })

      await waitFor(() => {
        expect(screen.getByLabelText(/Test Food, 200 calories/)).toBeTruthy()
      })

      const resultCard = screen.getByLabelText(/Test Food, 200 calories/)
      await act(async () => {
        fireEvent.press(resultCard)
      })

      // Toggle favorite
      const favChip = await screen.findByLabelText('Save as favorite')
      await act(async () => {
        fireEvent.press(favChip)
      })

      // Log food
      const logBtn = screen.getByLabelText('Log food')
      await act(async () => {
        fireEvent.press(logBtn)
        jest.advanceTimersByTime(100)
      })

      await waitFor(() => {
        expect(mockFindDuplicate).toHaveBeenCalled()
        expect(mockToggleFavorite).toHaveBeenCalledWith('existing-1')
        expect(mockAddFoodEntry).not.toHaveBeenCalled()
        expect(mockAddDailyLog).toHaveBeenCalledWith('existing-1', '2026-01-15', 'snack', 1)
      })
    })
  })

  describe('error states', () => {
    it('shows timeout error', async () => {
      mockFetchWithTimeout.mockResolvedValue({ ok: false, error: 'timeout' })

      const screen = renderSearch()
      const input = await screen.findByLabelText('Search foods')

      await act(async () => {
        fireEvent.changeText(input, 'test')
        jest.advanceTimersByTime(500)
      })

      await waitFor(() => {
        expect(screen.getByText(/timed out/)).toBeTruthy()
      })
    })

    it('shows network error message', async () => {
      mockFetchWithTimeout.mockResolvedValue({ ok: false, error: 'offline' })

      const screen = renderSearch()
      const input = await screen.findByLabelText('Search foods')

      await act(async () => {
        fireEvent.changeText(input, 'test')
        jest.advanceTimersByTime(500)
      })

      await waitFor(() => {
        expect(screen.getByText(/Could not reach food database/)).toBeTruthy()
      })
    })
  })
})
