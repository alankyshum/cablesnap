jest.setTimeout(10000)

/**
 * BLD-57 / BLD-318: Built-in Food Database acceptance tests.
 * Tests search, macro display, serving multipliers, favorites toggle,
 * and logging flow via InlineFoodSearch component.
 */

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
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

const mockAddFoodEntry = jest.fn().mockResolvedValue({ id: 'fe-1', name: 'Chicken Breast (grilled)', calories: 165, protein: 31, carbs: 0, fat: 3.6, serving: '100g', is_favorite: false })
const mockAddDailyLog = jest.fn().mockResolvedValue({ id: 'dl-1' })
const mockGetFavoriteFoods = jest.fn().mockResolvedValue([])
const mockDeleteDailyLog = jest.fn().mockResolvedValue(undefined)
const mockFindDuplicateFoodEntry = jest.fn().mockResolvedValue(null)
const mockToggleFavorite = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  addFoodEntry: (...args: unknown[]) => mockAddFoodEntry(...args),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavoriteFoods(...args),
  deleteDailyLog: (...args: unknown[]) => mockDeleteDailyLog(...args),
  findDuplicateFoodEntry: (...args: unknown[]) => mockFindDuplicateFoodEntry(...args),
  toggleFavorite: (...args: unknown[]) => mockToggleFavorite(...args),
}))

jest.mock('../../lib/openfoodfacts', () => ({
  fetchWithTimeout: jest.fn().mockResolvedValue({ ok: true, foods: [] }),
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

describe('Built-in Food Database (BLD-57)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetFavoriteFoods.mockResolvedValue([])
  })

  describe('search rendering', () => {
    it('shows search input', async () => {
      const screen = renderSearch()
      await waitFor(() => {
        expect(screen.getByLabelText('Search foods')).toBeTruthy()
      })
    })

    it('shows meal selector chips', async () => {
      const screen = renderSearch()
      await waitFor(() => {
        expect(screen.getByLabelText(/Meal: Breakfast/)).toBeTruthy()
        expect(screen.getByLabelText(/Meal: Lunch/)).toBeTruthy()
        expect(screen.getByLabelText(/Meal: Dinner/)).toBeTruthy()
        expect(screen.getByLabelText(/Meal: Snack/)).toBeTruthy()
      })
    })
  })

  describe('search functionality', () => {
    it('shows foods matching search query', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken')

      await waitFor(() => {
        expect(screen.getByLabelText(/Chicken Breast/)).toBeTruthy()
      })
    })

    it('hides non-matching foods', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken')

      await waitFor(() => {
        expect(screen.queryByLabelText(/Brown Rice/)).toBeNull()
      })
    })
  })

  describe('food item expansion and macros', () => {
    it('expands food item showing multiplier and log button', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken breast')

      const foodCard = await screen.findByLabelText(/Chicken Breast/)
      fireEvent.press(foodCard)

      await waitFor(() => {
        expect(screen.getByText('0.5x')).toBeTruthy()
        expect(screen.getByText('1x')).toBeTruthy()
        expect(screen.getByText('1.5x')).toBeTruthy()
        expect(screen.getByText('2x')).toBeTruthy()
        expect(screen.getByLabelText('Log food')).toBeTruthy()
      })
    })

    it('updates scaled macros when multiplier changes', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken breast')

      const foodCard = await screen.findByLabelText(/Chicken Breast/)
      fireEvent.press(foodCard)

      const twoX = await screen.findByText('2x')
      fireEvent.press(twoX)

      await waitFor(() => {
        expect(screen.getByText(/330 cal/)).toBeTruthy()
        expect(screen.getByText(/62\.0p/)).toBeTruthy()
      })
    })

    it('shows serving multiplier input with accessible label', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken breast')

      const foodCard = await screen.findByLabelText(/Chicken Breast/)
      fireEvent.press(foodCard)

      await waitFor(() => {
        expect(screen.getByLabelText(/Serving multiplier/)).toBeTruthy()
      })
    })
  })

  describe('favorites toggle', () => {
    it('shows save as favorite button when food is expanded', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken breast')

      const foodCard = await screen.findByLabelText(/Chicken Breast/)
      fireEvent.press(foodCard)

      await waitFor(() => {
        expect(screen.getByLabelText('Save as favorite')).toBeTruthy()
      })
    })

    it('toggles favorite label when pressed', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken breast')

      const foodCard = await screen.findByLabelText(/Chicken Breast/)
      fireEvent.press(foodCard)

      const favBtn = await screen.findByLabelText('Save as favorite')
      fireEvent.press(favBtn)

      await waitFor(() => {
        expect(screen.getByLabelText('Remove from favorites')).toBeTruthy()
      })
    })
  })

  describe('logging flow', () => {
    it('calls addFoodEntry and addDailyLog when logging food', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken breast')

      const foodCard = await screen.findByLabelText(/Chicken Breast/)
      fireEvent.press(foodCard)

      const logBtn = await screen.findByLabelText('Log food')
      fireEvent.press(logBtn)

      await waitFor(() => {
        expect(mockAddFoodEntry).toHaveBeenCalledWith(
          'Chicken Breast (grilled)',
          165, 31, 0, 3.6,
          '100g',
          false
        )
        expect(mockAddDailyLog).toHaveBeenCalled()
      })
    })

    it('logs with correct multiplier', async () => {
      const screen = renderSearch()
      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken breast')

      const foodCard = await screen.findByLabelText(/Chicken Breast/)
      fireEvent.press(foodCard)

      const twoX = await screen.findByText('2x')
      fireEvent.press(twoX)

      const logBtn = await screen.findByLabelText('Log food')
      fireEvent.press(logBtn)

      await waitFor(() => {
        expect(mockAddDailyLog).toHaveBeenCalledWith(
          'fe-1',
          '2026-01-15',
          'snack',
          2
        )
      })
    })
  })
})
