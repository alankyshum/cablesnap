import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WeeklySummary from '@/components/WeeklySummary';
import { useWeeklySummary } from '@/hooks/useWeeklySummary';

jest.mock('@/hooks/useWeeklySummary', () => ({
  useWeeklySummary: jest.fn(),
  formatWeekRange: () => 'Jul 6 - Jul 12',
  formatNumber: (n?: number) => n != null ? n.toLocaleString() : '0',
}));

jest.mock('@/hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    primary: '#6200ee',
    onPrimary: '#fff',
    onSurface: '#000',
    onSurfaceVariant: '#666',
    outlineVariant: '#ccc',
    surface: '#fff',
    error: '#f00',
    onError: '#fff',
  }),
}));

jest.mock('lucide-react-native', () => ({
  ChevronLeft: 'ChevronLeft',
  ChevronRight: 'ChevronRight',
  AlertCircle: 'AlertCircle',
  RotateCcw: 'RotateCcw',
}));

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withTiming: (v: unknown) => v,
    Easing: { out: () => {}, bezier: () => {} },
  };
});

describe('WeeklySummary Component', () => {
  const mockRefetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the loading state', () => {
    (useWeeklySummary as jest.Mock).mockReturnValue({
      loading: true,
      data: null,
      error: false,
      expanded: false,
      setExpanded: jest.fn(),
      weekOffset: 0,
      weekStartMs: Date.now(),
      unit: 'kg',
      canGoBack: true,
      canGoForward: false,
      navigateWeek: jest.fn(),
      handleShare: jest.fn(),
      expandAnimStyle: {},
      volChange: null,
      refetch: mockRefetch,
    });

    const { getByText } = render(<WeeklySummary />);
    expect(getByText(/Loading/i)).toBeTruthy();
  });

  it('renders the error state with Icon and Retry action button', () => {
    (useWeeklySummary as jest.Mock).mockReturnValue({
      loading: false,
      data: null,
      error: true,
      expanded: false,
      setExpanded: jest.fn(),
      weekOffset: 0,
      weekStartMs: Date.now(),
      unit: 'kg',
      canGoBack: true,
      canGoForward: false,
      navigateWeek: jest.fn(),
      handleShare: jest.fn(),
      expandAnimStyle: {},
      volChange: null,
      refetch: mockRefetch,
    });

    const { getByText, getByLabelText, getByTestId } = render(<WeeklySummary />);
    
    // Check error container testID
    expect(getByTestId('weekly-summary-error')).toBeTruthy();
    expect(getByText("Couldn't load summary")).toBeTruthy();
    
    // Retry button trigger
    const retryBtn = getByLabelText('Retry loading summary');
    expect(retryBtn).toBeTruthy();
    fireEvent.press(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('renders the normal state when workouts logged', () => {
    const mockData = {
      workouts: {
        sessionCount: 3,
        scheduledCount: 4,
        totalDurationSeconds: 7200,
        totalVolume: 12000,
        previousWeekVolume: 10000,
      },
      prs: [],
      nutrition: { avgCalories: 2000, calorieTarget: 2000 },
      body: { entryCount: 1, startWeight: 80, endWeight: 80 },
      streak: 3,
    };

    (useWeeklySummary as jest.Mock).mockReturnValue({
      loading: false,
      data: mockData,
      error: false,
      expanded: false,
      setExpanded: jest.fn(),
      weekOffset: 0,
      weekStartMs: Date.now(),
      unit: 'kg',
      canGoBack: true,
      canGoForward: false,
      navigateWeek: jest.fn(),
      handleShare: jest.fn(),
      expandAnimStyle: {},
      volChange: '+20%',
      refetch: mockRefetch,
    });

    const { getByText } = render(<WeeklySummary />);
    expect(getByText(/Week of/)).toBeTruthy();
    expect(getByText(/3\/4 workouts/)).toBeTruthy();
  });
});
