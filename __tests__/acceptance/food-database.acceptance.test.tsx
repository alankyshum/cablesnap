jest.setTimeout(10000)

/**
 * BLD-57: Built-in Food Database acceptance tests.
 * Tests search, category filtering, macro display, serving multipliers,
 * favorites toggle, and logging flow in the add-nutrition screen.
 */

import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
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

const mockAddFoodEntry = jest.fn().mockResolvedValue({ id: 'fe-1', name: 'Chicken Breast (grilled)', calories: 165, protein: 31, carbs: 0, fat: 3.6, serving: '100g', is_favorite: false })
const mockAddDailyLog = jest.fn().mockResolvedValue(undefined)
const mockGetFavoriteFoods = jest.fn().mockResolvedValue([])

jest.mock('../../lib/db', () => ({
  addFoodEntry: (...args: unknown[]) => mockAddFoodEntry(...args),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavoriteFoods(...args),
}))

import AddFood from '../../app/nutrition/add'

function renderAddFood() {
  return renderScreen(<AddFood />)
}

async function switchToDatabase(screen: ReturnType<typeof renderScreen>) {
  const dbBtn = await screen.findByText('Database')
  fireEvent.press(dbBtn)
}

describe('Built-in Food Database (BLD-57)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    Object.keys(mockParams).forEach((k) => delete mockParams[k])
    mockGetFavoriteFoods.mockResolvedValue([])
  })

  describe('database tab rendering', () => {
    it('shows search input after switching to database tab', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)
      await waitFor(() => {
        expect(screen.getByLabelText('Search foods')).toBeTruthy()
      })
    })

    it('shows category filter chips', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)
      await waitFor(() => {
        expect(screen.getByText('All')).toBeTruthy()
        expect(screen.getByText('Protein')).toBeTruthy()
        expect(screen.getByText('Grains')).toBeTruthy()
        expect(screen.getByText('Dairy')).toBeTruthy()
      })
    })

    it('shows food items from the built-in database', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)
      await waitFor(() => {
        expect(screen.getByLabelText(/Chicken Breast \(grilled\), 165 calories/)).toBeTruthy()
      })
    })
  })

  describe('search functionality', () => {
    it('filters foods by search query', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken')

      await waitFor(() => {
        expect(screen.getByLabelText(/Chicken Breast/)).toBeTruthy()
        expect(screen.queryByLabelText(/Brown Rice/)).toBeNull()
      })
    })

    it('shows all foods when search is cleared', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const searchInput = await screen.findByLabelText('Search foods')
      fireEvent.changeText(searchInput, 'chicken')
      fireEvent.changeText(searchInput, '')

      await waitFor(() => {
        // Should show items from various categories
        expect(screen.getByLabelText(/Chicken Breast/)).toBeTruthy()
      })
    })
  })

  describe('category filtering', () => {
    it('filters by Protein category', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const proteinChip = await screen.findByText('Protein')
      fireEvent.press(proteinChip)

      await waitFor(() => {
        expect(screen.getByLabelText(/Chicken Breast/)).toBeTruthy()
        // Rice is in grains category, should not appear
        expect(screen.queryByLabelText(/Brown Rice/)).toBeNull()
      })
    })

    it('resets filter when pressing same category again', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const proteinChip = await screen.findByText('Protein')
      fireEvent.press(proteinChip)
      fireEvent.press(proteinChip)

      await waitFor(() => {
        // All category should show all foods
        expect(screen.getByLabelText(/Chicken Breast/)).toBeTruthy()
      })
    })
  })

  describe('food item expansion and macros', () => {
    it('expands food item showing macro details', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
      fireEvent.press(foodCard)

      await waitFor(() => {
        expect(screen.getByText(/Serving: 100g/)).toBeTruthy()
        expect(screen.getByLabelText('Log food')).toBeTruthy()
      })
    })

    it('shows serving multiplier chips when expanded', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
      fireEvent.press(foodCard)

      await waitFor(() => {
        expect(screen.getByText('0.5x')).toBeTruthy()
        expect(screen.getByText('1x')).toBeTruthy()
        expect(screen.getByText('1.5x')).toBeTruthy()
        expect(screen.getByText('2x')).toBeTruthy()
      })
    })

    it('updates scaled macros when multiplier changes', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
      fireEvent.press(foodCard)

      // Press 2x multiplier
      const twoX = await screen.findByText('2x')
      fireEvent.press(twoX)

      await waitFor(() => {
        // 165 * 2 = 330 cal, 31 * 2 = 62.0p
        expect(screen.getByText(/330 cal/)).toBeTruthy()
        expect(screen.getByText(/62\.0p/)).toBeTruthy()
      })
    })

    it('shows serving multiplier input with accessible label', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
      fireEvent.press(foodCard)

      await waitFor(() => {
        expect(screen.getByLabelText(/Serving multiplier/)).toBeTruthy()
      })
    })
  })

  describe('favorites toggle', () => {
    it('shows save as favorite button when food is expanded', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
      fireEvent.press(foodCard)

      await waitFor(() => {
        expect(screen.getByLabelText('Save as favorite')).toBeTruthy()
      })
    })

    it('toggles favorite label when pressed', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
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
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
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
      const screen = renderAddFood()
      await switchToDatabase(screen)

      const foodCard = await screen.findByLabelText(/Chicken Breast \(grilled\), 165 calories/)
      fireEvent.press(foodCard)

      const twoX = await screen.findByText('2x')
      fireEvent.press(twoX)

      const logBtn = await screen.findByLabelText('Log food')
      fireEvent.press(logBtn)

      await waitFor(() => {
        expect(mockAddDailyLog).toHaveBeenCalledWith(
          'fe-1',
          expect.any(String),
          'snack',
          2
        )
      })
    })

    it('meal selector chips are accessible', async () => {
      const screen = renderAddFood()
      await switchToDatabase(screen)

      await waitFor(() => {
        expect(screen.getByLabelText(/Meal: Breakfast/)).toBeTruthy()
        expect(screen.getByLabelText(/Meal: Lunch/)).toBeTruthy()
        expect(screen.getByLabelText(/Meal: Dinner/)).toBeTruthy()
        expect(screen.getByLabelText(/Meal: Snack/)).toBeTruthy()
      })
    })
  })
})
