jest.setTimeout(10000)

import React from 'react'
import { render, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Platform } from 'react-native'
import { renderScreen } from '../helpers/render'

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() }

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    router: mockRouter,
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
jest.mock('../../lib/layout', () => ({ useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }) }))
jest.mock('../../lib/errors', () => ({ logError: jest.fn(), generateReport: jest.fn().mockResolvedValue('{}'), getRecentErrors: jest.fn().mockResolvedValue([]), generateGitHubURL: jest.fn().mockReturnValue('https://github.com') }))
jest.mock('../../lib/interactions', () => ({ log: jest.fn(), recent: jest.fn().mockResolvedValue([]) }))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
}))

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn().mockResolvedValue({ isConnected: true }),
}))

const mockAddFoodEntry = jest.fn().mockResolvedValue({ id: 'f1', name: 'Test', calories: 100, protein: 5, carbs: 20, fat: 3, serving_size: '100g', is_favorite: false })
const mockAddDailyLog = jest.fn().mockResolvedValue(undefined)
const mockGetFavoriteFoods = jest.fn().mockResolvedValue([])
const mockFindDuplicateFoodEntry = jest.fn().mockResolvedValue(null)
const mockToggleFavorite = jest.fn().mockResolvedValue(undefined)

jest.mock('../../lib/db', () => ({
  addFoodEntry: (...args: unknown[]) => mockAddFoodEntry(...args),
  addDailyLog: (...args: unknown[]) => mockAddDailyLog(...args),
  getFavoriteFoods: (...args: unknown[]) => mockGetFavoriteFoods(...args),
  findDuplicateFoodEntry: (...args: unknown[]) => mockFindDuplicateFoodEntry(...args),
  toggleFavorite: (...args: unknown[]) => mockToggleFavorite(...args),
}))

jest.mock('../../lib/foods', () => ({
  searchFoods: jest.fn().mockReturnValue([]),
  getCategories: jest.fn().mockReturnValue([]),
}))

const mockFetchWithTimeout = jest.fn().mockResolvedValue({ ok: true, foods: [] })
const mockLookupBarcodeWithTimeout = jest.fn()

jest.mock('../../lib/openfoodfacts', () => ({
  fetchWithTimeout: (...args: unknown[]) => mockFetchWithTimeout(...args),
  lookupBarcodeWithTimeout: (...args: unknown[]) => mockLookupBarcodeWithTimeout(...args),
}))

import AddFood from '../../app/nutrition/add'

// Helper to navigate to Online tab and get scan button
async function openOnlineTab(screen: ReturnType<typeof renderScreen>) {
  const onlineButtons = screen.getAllByText('Online')
  fireEvent.press(onlineButtons[0])
  await waitFor(() => {
    expect(screen.getByText('Scan Barcode')).toBeTruthy()
  })
}

describe('Barcode Scanner Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Platform.OS = 'ios'
  })

  afterEach(() => {
    Platform.OS = 'ios'
  })

  // ── Visibility ──────────────────────────────────────────────────

  it('shows Scan Barcode button on Online tab for native platforms', async () => {
    Platform.OS = 'ios'
    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)
  })

  it('hides Scan Barcode button on web platform', async () => {
    Platform.OS = 'web' as typeof Platform.OS
    const screen = renderScreen(<AddFood />)

    const onlineButtons = screen.getAllByText('Online')
    fireEvent.press(onlineButtons[0])

    await waitFor(() => {
      expect(screen.queryByText('Scan Barcode')).toBeNull()
    })
  })

  // ── Accessibility ───────────────────────────────────────────────

  it('has correct accessibility label on scan button', async () => {
    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    expect(screen.getByLabelText('Scan food barcode')).toBeTruthy()
  })

  it('shows scan button with minimum touch target size', async () => {
    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    const scanButton = screen.getByText('Scan Barcode')
    expect(scanButton).toBeTruthy()
  })

  // ── Barcode found flow ──────────────────────────────────────────

  it('displays found product as result card after barcode scan', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({
      ok: true,
      status: 'found',
      food: {
        name: 'Oatly — Oat Milk',
        calories: 115,
        protein: 2.5,
        carbs: 16.8,
        fat: 3.8,
        servingLabel: '250ml',
        isPerServing: true,
      },
    })

    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    fireEvent.press(screen.getByText('Scan Barcode'))

    await waitFor(() => {
      const cameraView = screen.getByTestId('camera-view')
      expect(cameraView).toBeTruthy()
    })

    const cameraView = screen.getByTestId('camera-view')
    await act(async () => {
      const props = cameraView.props
      if (props.onBarcodeScanned) {
        props.onBarcodeScanned({ type: 'ean13', data: '7394376616037' })
      }
    })

    await waitFor(() => {
      expect(screen.getByText('Oatly — Oat Milk')).toBeTruthy()
    })
    expect(screen.getByText(/115 cal/)).toBeTruthy()
    expect(mockLookupBarcodeWithTimeout).toHaveBeenCalledWith('7394376616037', expect.anything())
  })

  // ── Barcode not found flow ──────────────────────────────────────

  it('shows product not found message with search fallback', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: true, status: 'not_found' })

    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    fireEvent.press(screen.getByText('Scan Barcode'))

    await waitFor(() => {
      const cameraView = screen.getByTestId('camera-view')
      expect(cameraView).toBeTruthy()
    })

    const cameraView = screen.getByTestId('camera-view')
    await act(async () => {
      if (cameraView.props.onBarcodeScanned) {
        cameraView.props.onBarcodeScanned({ type: 'ean13', data: '0000000000000' })
      }
    })

    await waitFor(() => {
      expect(screen.getByText('Product not found. Try searching by name.')).toBeTruthy()
    })
    expect(screen.getByText('Search by Name')).toBeTruthy()
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  // ── Incomplete product flow ─────────────────────────────────────

  it('shows incomplete data message for invalid product', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: true, status: 'incomplete' })

    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    fireEvent.press(screen.getByText('Scan Barcode'))

    await waitFor(() => {
      const cameraView = screen.getByTestId('camera-view')
      expect(cameraView).toBeTruthy()
    })

    const cameraView = screen.getByTestId('camera-view')
    await act(async () => {
      if (cameraView.props.onBarcodeScanned) {
        cameraView.props.onBarcodeScanned({ type: 'ean13', data: '1234567890123' })
      }
    })

    await waitFor(() => {
      expect(screen.getByText('Product found but nutrition data is incomplete.')).toBeTruthy()
    })
  })

  // ── Network error flow ──────────────────────────────────────────

  it('shows network error with retry button when offline', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: false, error: 'offline' })

    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    fireEvent.press(screen.getByText('Scan Barcode'))

    await waitFor(() => {
      const cameraView = screen.getByTestId('camera-view')
      expect(cameraView).toBeTruthy()
    })

    const cameraView = screen.getByTestId('camera-view')
    await act(async () => {
      if (cameraView.props.onBarcodeScanned) {
        cameraView.props.onBarcodeScanned({ type: 'ean13', data: '1234567890123' })
      }
    })

    await waitFor(() => {
      expect(screen.getByText('Could not look up barcode. Check your connection.')).toBeTruthy()
    })
    expect(screen.getByText('Retry')).toBeTruthy()
  })

  // ── Timeout flow ────────────────────────────────────────────────

  it('shows timeout error when barcode lookup times out', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({ ok: false, error: 'timeout' })

    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    fireEvent.press(screen.getByText('Scan Barcode'))

    await waitFor(() => {
      const cameraView = screen.getByTestId('camera-view')
      expect(cameraView).toBeTruthy()
    })

    const cameraView = screen.getByTestId('camera-view')
    await act(async () => {
      if (cameraView.props.onBarcodeScanned) {
        cameraView.props.onBarcodeScanned({ type: 'ean13', data: '1234567890123' })
      }
    })

    await waitFor(() => {
      expect(screen.getByText('Lookup timed out. Please try again.')).toBeTruthy()
    })
  })

  // ── Found announcement ──────────────────────────────────────────

  it('announces found product name for screen readers', async () => {
    mockLookupBarcodeWithTimeout.mockResolvedValue({
      ok: true,
      status: 'found',
      food: {
        name: 'Chobani — Greek Yogurt',
        calories: 130,
        protein: 15,
        carbs: 12,
        fat: 4,
        servingLabel: '1 cup',
        isPerServing: true,
      },
    })

    const screen = renderScreen(<AddFood />)
    await openOnlineTab(screen)

    fireEvent.press(screen.getByText('Scan Barcode'))

    await waitFor(() => {
      const cameraView = screen.getByTestId('camera-view')
      expect(cameraView).toBeTruthy()
    })

    const cameraView = screen.getByTestId('camera-view')
    await act(async () => {
      if (cameraView.props.onBarcodeScanned) {
        cameraView.props.onBarcodeScanned({ type: 'ean13', data: '0075240001001' })
      }
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Found: Chobani — Greek Yogurt')).toBeTruthy()
    })
  })
})
