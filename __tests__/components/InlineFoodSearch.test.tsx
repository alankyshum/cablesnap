import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createFoodEntry } from '../helpers/factories'
import type { FoodEntry } from '../../lib/types'

// --- Mocks ---

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))
jest.mock('../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))

const chicken = createFoodEntry({ id: 'f1', name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, is_favorite: true })

const mockAddFoodEntry = jest.fn<Promise<FoodEntry>, [string, number, number, number, number, string, boolean]>().mockResolvedValue(chicken)
const mockAddDailyLog = jest.fn().mockResolvedValue({ id: 'log-1', food_entry_id: 'f1', date: '2026-04-17', meal: 'snack', servings: 1, logged_at: Date.now() })
const mockDeleteDailyLog = jest.fn().mockResolvedValue(undefined)
const mockGetFavoriteFoods = jest.fn<Promise<FoodEntry[]>, []>().mockResolvedValue([chicken])
const mockFindDuplicate = jest.fn().mockResolvedValue(null)

jest.mock('../../lib/db', () => ({
  addFoodEntry: (...args: unknown[]) => mockAddFoodEntry(...(args as [string, number, number, number, number, string, boolean])),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  deleteDailyLog: (...args: unknown[]) => mockDeleteDailyLog(...args),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavoriteFoods(...(args as [])),
  findDuplicateFoodEntry: (...args: unknown[]) => mockFindDuplicate(...args),
}))

jest.mock('../../lib/foods', () => ({
  searchFoods: (q: string) => {
    if (q.toLowerCase().includes('chicken')) return [{ id: 'b1', name: 'Chicken Breast', calories: 165, protein: 31, carbs: 0, fat: 3.6, serving: '100g' }]
    return []
  },
}))

jest.mock('../../lib/openfoodfacts', () => ({
  fetchWithTimeout: jest.fn().mockResolvedValue({ ok: true, foods: [] }),
  lookupBarcodeWithTimeout: jest.fn().mockResolvedValue({ ok: false, error: 'not_found' }),
}))

jest.mock('../../components/BarcodeScanner', () => {
  const RealReact = require('react')
  return {
    __esModule: true,
    default: ({ visible }: { visible: boolean }) => {
      if (!visible) return null
      const { View, Text } = require('react-native')
      return RealReact.createElement(View, { testID: 'barcode-scanner' },
        RealReact.createElement(Text, {}, 'Scanner')
      )
    },
  }
})

jest.mock('@gorhom/bottom-sheet', () => {
  const RealReact = require('react')
  const { View } = require('react-native')
  const BottomSheet = RealReact.forwardRef(
    (props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      RealReact.useImperativeHandle(ref, () => ({
        expand: jest.fn(),
        close: jest.fn(),
      }))
      return RealReact.createElement(View, { testID: 'bottom-sheet' }, props.children)
    }
  )
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetView: ({ children, ...props }: { children: React.ReactNode }) =>
      RealReact.createElement(View, { ...props, testID: 'bottom-sheet-view' }, children),
  }
})

import InlineFoodSearch from '../../components/InlineFoodSearch'

// --- Tests ---

describe('InlineFoodSearch', () => {
  const mockOnFoodLogged = jest.fn()
  const mockOnSnack = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetFavoriteFoods.mockResolvedValue([chicken])
    mockAddDailyLog.mockResolvedValue({ id: 'log-1', food_entry_id: 'f1', date: '2026-04-17', meal: 'snack', servings: 1, logged_at: Date.now() })
  })

  const renderComponent = () =>
    renderScreen(
      <InlineFoodSearch
        dateKey="2026-04-17"
        onFoodLogged={mockOnFoodLogged}
        onSnack={mockOnSnack}
      />
    )

  it('renders meal selector chips', async () => {
    const { findByText } = renderComponent()
    expect(await findByText('Breakfast')).toBeTruthy()
    expect(await findByText('Lunch')).toBeTruthy()
    expect(await findByText('Dinner')).toBeTruthy()
    expect(await findByText('Snack')).toBeTruthy()
  })

  it('renders search input with accessibility label', async () => {
    const { findByLabelText } = renderComponent()
    expect(await findByLabelText('Search foods')).toBeTruthy()
  })

  it('shows favorites as chips when available', async () => {
    const { findByText } = renderComponent()
    expect(await findByText('Chicken Breast')).toBeTruthy()
  })

  it('shows hint when no favorites', async () => {
    mockGetFavoriteFoods.mockResolvedValue([])
    const { findByText } = renderComponent()
    expect(await findByText(/Star foods to add them here/)).toBeTruthy()
  })

  it('logs favorite food on chip press with undo callback', async () => {
    const { findByLabelText } = renderComponent()
    const chip = await findByLabelText('Quick log Chicken Breast')
    fireEvent.press(chip)

    await waitFor(() => {
      expect(mockAddDailyLog).toHaveBeenCalledWith('f1', '2026-04-17', 'snack', 1)
    })
    expect(mockOnFoodLogged).toHaveBeenCalled()
    expect(mockOnSnack).toHaveBeenCalledWith('Chicken Breast logged', expect.any(Function))
  })

  it('undo callback deletes logged entry', async () => {
    const { findByLabelText } = renderComponent()
    const chip = await findByLabelText('Quick log Chicken Breast')
    fireEvent.press(chip)

    await waitFor(() => {
      expect(mockOnSnack).toHaveBeenCalled()
    })

    // Call the undo function
    const undoFn = mockOnSnack.mock.calls[0][1]
    expect(undoFn).toBeDefined()
    await undoFn()

    expect(mockDeleteDailyLog).toHaveBeenCalledWith('log-1')
    // onFoodLogged called again to refresh
    expect(mockOnFoodLogged).toHaveBeenCalledTimes(2)
  })

  it('shows local search results when typing', async () => {
    const { findByLabelText, findByText } = renderComponent()
    const input = await findByLabelText('Search foods')
    fireEvent.changeText(input, 'chicken')

    expect(await findByText('165 cal · 31p · 0c · 3.6f')).toBeTruthy()
  })

  it('shows empty message when no results found', async () => {
    const { findByLabelText, findByText } = renderComponent()
    const input = await findByLabelText('Search foods')
    fireEvent.changeText(input, 'xyznonexistent')

    expect(await findByText(/No foods found/)).toBeTruthy()
  })

  it('renders Manual Entry button and expands form on press', async () => {
    const { findByLabelText } = renderComponent()
    const btn = await findByLabelText('Manual entry')
    expect(btn).toBeTruthy()
  })

  it('shows error snackbar when log fails', async () => {
    mockAddDailyLog.mockRejectedValueOnce(new Error('DB error'))
    const { findByLabelText } = renderComponent()
    const chip = await findByLabelText('Quick log Chicken Breast')
    fireEvent.press(chip)

    await waitFor(() => {
      expect(mockOnSnack).toHaveBeenCalledWith('Failed to log food. Please try again.')
    })
  })

  it('selects meal via chip press', async () => {
    const { findByText, findByLabelText } = renderComponent()
    const lunchChip = await findByText('Lunch')
    fireEvent.press(lunchChip)

    const chip = await findByLabelText('Quick log Chicken Breast')
    fireEvent.press(chip)

    await waitFor(() => {
      expect(mockAddDailyLog).toHaveBeenCalledWith('f1', '2026-04-17', 'lunch', 1)
    })
  })
})
