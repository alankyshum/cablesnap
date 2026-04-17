jest.setTimeout(10000)

/**
 * BLD-248: Online Food Search acceptance tests.
 * Tests the OnlineTab in the add-nutrition screen: tab rendering,
 * search flow, dedup+favorite, offline detection, and error states.
 */

import React from 'react'
import { fireEvent, waitFor, act } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { resetIds } from '../helpers/factories'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }
const mockParams: Record<string, string> = {}

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    router: { back: jest.fn(), push: jest.fn() },
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/nutrition/add',
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
const mockAddDailyLog = jest.fn().mockResolvedValue(undefined)
const mockGetFavoriteFoods = jest.fn().mockResolvedValue([])
const mockFindDuplicate = jest.fn().mockResolvedValue(null)
const mockToggleFavorite = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  addFoodEntry: (...args: unknown[]) => mockAddFoodEntry(...args),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavoriteFoods(...args),
  findDuplicateFoodEntry: (...args: unknown[]) => mockFindDuplicate(...args),
  toggleFavorite: (...args: unknown[]) => mockToggleFavorite(...args),
}))

let mockNetInfoConnected = true
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(() => Promise.resolve({ isConnected: mockNetInfoConnected })),
  },
}))

const mockFetchWithTimeout = jest.fn()
jest.mock('../../lib/openfoodfacts', () => ({
  ...jest.requireActual('../../lib/openfoodfacts'),
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
}))

import AddFood from '../../app/nutrition/add'

function renderAddFood() {
  return renderScreen(<AddFood />)
}

async function switchToOnline(screen: ReturnType<typeof renderScreen>) {
  const btn = await screen.findByText('Online')
  fireEvent.press(btn)
}

describe('Online Food Search (BLD-248)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    resetIds()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
    mockGetFavoriteFoods.mockResolvedValue([])
    mockNetInfoConnected = true
    mockFetchWithTimeout.mockResolvedValue({ ok: true, foods: [] })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('tab rendering', () => {
    it('shows 4 tabs: New, Favs, Database, Online', async () => {
      const screen = renderAddFood()
      await waitFor(() => {
        expect(screen.getByText('New')).toBeTruthy()
        expect(screen.getByText('Favs')).toBeTruthy()
        expect(screen.getByText('Database')).toBeTruthy()
        expect(screen.getByText('Online')).toBeTruthy()
      })
    })

    it('shows search input on Online tab', async () => {
      const screen = renderAddFood()
      await switchToOnline(screen)
      await waitFor(() => {
        expect(screen.getByLabelText('Search online food database')).toBeTruthy()
      })
    })
  })

  describe('offline detection', () => {
    it('shows offline message when no network', async () => {
      mockNetInfoConnected = false
      const screen = renderAddFood()
      await switchToOnline(screen)
      await waitFor(() => {
        expect(screen.getByText(/offline/i)).toBeTruthy()
      })
    })
  })

  describe('search flow', () => {
    it('shows hint for queries < 2 chars', async () => {
      const screen = renderAddFood()
      await switchToOnline(screen)
      const input = await screen.findByLabelText('Search online food database')

      await act(async () => {
        fireEvent.changeText(input, 'a')
      })

      await waitFor(() => {
        expect(screen.getByText('Type at least 2 characters')).toBeTruthy()
      })
    })

    it('fires search after debounce for queries >= 2 chars', async () => {
      mockFetchWithTimeout.mockResolvedValue({
        ok: true,
        foods: [{
          name: 'Chobani — Greek Yogurt',
          calories: 100, protein: 15, carbs: 6, fat: 2,
          servingLabel: '1 cup (150g)', isPerServing: true,
        }],
      })

      const screen = renderAddFood()
      await switchToOnline(screen)
      const input = await screen.findByLabelText('Search online food database')

      await act(async () => {
        fireEvent.changeText(input, 'yogurt')
        jest.advanceTimersByTime(500) // past 400ms debounce
      })

      await waitFor(() => {
        expect(mockFetchWithTimeout).toHaveBeenCalledWith('yogurt', expect.anything())
      })
    })

    it('shows no results message when search returns empty', async () => {
      mockFetchWithTimeout.mockResolvedValue({ ok: true, foods: [] })

      const screen = renderAddFood()
      await switchToOnline(screen)
      const input = await screen.findByLabelText('Search online food database')

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

      const screen = renderAddFood()
      await switchToOnline(screen)
      const input = await screen.findByLabelText('Search online food database')

      await act(async () => {
        fireEvent.changeText(input, 'test food')
        jest.advanceTimersByTime(500)
      })

      // Wait for result to appear and tap to expand
      await waitFor(() => {
        expect(screen.getByText('Test Food')).toBeTruthy()
      })

      const resultCard = screen.getByLabelText(/Test Food, 200 calories/)
      await act(async () => {
        fireEvent.press(resultCard)
      })

      // Toggle favorite
      await waitFor(() => {
        expect(screen.getByText('Save as Favorite')).toBeTruthy()
      })
      const favChip = screen.getByLabelText('Save as favorite')
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
        expect(mockAddFoodEntry).not.toHaveBeenCalled() // reused existing
        expect(mockAddDailyLog).toHaveBeenCalledWith('existing-1', expect.any(String), 'snack', 1)
      })
    })
  })

  describe('error states', () => {
    it('shows timeout error with retry button', async () => {
      mockFetchWithTimeout.mockResolvedValue({ ok: false, error: 'timeout' })

      const screen = renderAddFood()
      await switchToOnline(screen)
      const input = await screen.findByLabelText('Search online food database')

      await act(async () => {
        fireEvent.changeText(input, 'test')
        jest.advanceTimersByTime(500)
      })

      await waitFor(() => {
        expect(screen.getByText(/timed out/)).toBeTruthy()
        expect(screen.getByLabelText('Retry search')).toBeTruthy()
      })
    })

    it('shows network error message', async () => {
      mockFetchWithTimeout.mockResolvedValue({ ok: false, error: 'offline' })

      const screen = renderAddFood()
      await switchToOnline(screen)
      const input = await screen.findByLabelText('Search online food database')

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
