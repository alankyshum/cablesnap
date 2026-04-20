/**
 * BLD-318: Barcode Scanner acceptance tests.
 * Tests barcode scanning flow (found, not found, incomplete, offline, timeout)
 * via InlineFoodSearch component.
 */

import React from 'react'
import { Platform } from 'react-native'
import { waitFor, act } from '@testing-library/react-native'
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

const mockAddFoodEntry = jest.fn().mockResolvedValue({ id: 'fe-1', name: 'Test', calories: 100, protein: 10, carbs: 5, fat: 3, serving_size: '1 cup', is_favorite: false })
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

const mockLookupBarcodeWithTimeout = jest.fn()
jest.mock('../../lib/openfoodfacts', () => ({
  fetchWithTimeout: jest.fn().mockResolvedValue({ ok: true, foods: [] }),
  lookupBarcodeWithTimeout: (...args: unknown[]) => mockLookupBarcodeWithTimeout(...args),
}))

// Mock BarcodeScanner to expose onBarcodeScanned via captured ref
let capturedOnBarcodeScanned: ((barcode: string) => void) | null = null
jest.mock('../../components/BarcodeScanner', () => {
  const RealReact = require('react')
  const { View, Text, Pressable } = require('react-native')
  return {
    __esModule: true,
    default: ({ visible, onBarcodeScanned }: { visible: boolean; onBarcodeScanned: (b: string) => void; onClose: () => void }) => {
      capturedOnBarcodeScanned = onBarcodeScanned
      if (!visible) return null
      return RealReact.createElement(View, { testID: 'barcode-scanner' },
        RealReact.createElement(Text, null, 'Camera Preview'),
        RealReact.createElement(Pressable, {
          testID: 'mock-scan-trigger',
          onPress: () => onBarcodeScanned('1234567890123')
        }, RealReact.createElement(Text, null, 'Trigger Scan'))
      )
    }
  }
})

import InlineFoodSearch from '../../components/InlineFoodSearch'

const mockOnFoodLogged = jest.fn()
const mockOnSnack = jest.fn()

function renderSearch() {
  return renderScreen(
    <InlineFoodSearch dateKey="2026-01-15" onFoodLogged={mockOnFoodLogged} onSnack={mockOnSnack} />
  )
}

async function openScanner(screen: ReturnType<typeof renderSearch>) {
  const scanBtn = await screen.findByLabelText('Scan barcode')
  await act(async () => {
    const { fireEvent } = require('@testing-library/react-native')
    fireEvent.press(scanBtn)
  })
}

async function triggerBarcode(screen: ReturnType<typeof renderSearch>, barcode: string) {
  await openScanner(screen)
  await waitFor(() => {
    expect(screen.getByTestId('barcode-scanner')).toBeTruthy()
  })
  await act(async () => {
    if (capturedOnBarcodeScanned) capturedOnBarcodeScanned(barcode)
  })
}

describe('Barcode Scanner Acceptance (BLD-318)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    capturedOnBarcodeScanned = null
    Platform.OS = 'ios'
  })

  afterEach(() => {
    Platform.OS = 'ios'
  })

  it('hides scan button on web platform', () => {
    Platform.OS = 'web' as typeof Platform.OS
    const screen = renderSearch()
    expect(screen.queryByLabelText('Scan barcode')).toBeNull()
  })

  it('shows scan button on native platforms', () => {
    const screen = renderSearch()
    expect(screen.getByLabelText('Scan barcode')).toBeTruthy()
  })

  it('displays found product as result card after barcode scan', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({
      ok: true,
      status: 'found',
      food: {
        name: 'Oatly Oat Milk',
        calories: 115, protein: 2.5, carbs: 16.8, fat: 3.8,
        servingLabel: '250ml', isPerServing: true,
      },
    })

    const screen = renderSearch()
    await triggerBarcode(screen, '7394376616037')

    await waitFor(() => {
      expect(screen.getByText('Oatly Oat Milk')).toBeTruthy()
    })
    expect(screen.getByText(/115 cal/)).toBeTruthy()
    expect(mockLookupBarcodeWithTimeout).toHaveBeenCalledWith('7394376616037', expect.anything())
  })

  it('shows product not found message', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: true, status: 'not_found' })

    const screen = renderSearch()
    await triggerBarcode(screen, '0000000000000')

    await waitFor(() => {
      expect(screen.getByText('Product not found. Try searching by name.')).toBeTruthy()
    })
  })

  it('shows incomplete data message for invalid product', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: true, status: 'incomplete' })

    const screen = renderSearch()
    await triggerBarcode(screen, '1234567890123')

    await waitFor(() => {
      expect(screen.getByText('Product found but nutrition data is incomplete.')).toBeTruthy()
    })
  })

  it('shows network error when offline', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: false, error: 'offline' })

    const screen = renderSearch()
    await triggerBarcode(screen, '1234567890123')

    await waitFor(() => {
      expect(screen.getByText('Could not look up barcode. Check your connection.')).toBeTruthy()
    })
  })

  it('shows timeout error when barcode lookup times out', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: false, error: 'timeout' })

    const screen = renderSearch()
    await triggerBarcode(screen, '1234567890123')

    await waitFor(() => {
      expect(screen.getByText('Lookup timed out. Please try again.')).toBeTruthy()
    })
  })

  it('shows retry button on error', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: false, error: 'offline' })

    const screen = renderSearch()
    await triggerBarcode(screen, '1234567890123')

    await waitFor(() => {
      expect(screen.getByLabelText('Retry barcode scan')).toBeTruthy()
    })
  })

  it('announces found product name for screen readers', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({
      ok: true,
      status: 'found',
      food: {
        name: 'Chobani Greek Yogurt',
        calories: 130, protein: 15, carbs: 12, fat: 4,
        servingLabel: '1 cup', isPerServing: true,
      },
    })

    const screen = renderSearch()
    await triggerBarcode(screen, '0075240001001')

    await waitFor(() => {
      expect(screen.getByLabelText('Found: Chobani Greek Yogurt')).toBeTruthy()
    })
  })
})
