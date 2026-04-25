/**
 * BLD-600 — Hydration acceptance test (happy path #2 from PLAN-BLD-599).
 *
 * "Given a 250 ml chip preset, when the user taps it once, then a new
 *  water_logs row is persisted with amount_ml = 250 and date_key = todayKey(),
 *  and the header total reflects the new value on the next render after
 *  useNutritionData.load() resolves."
 */
import React from 'react';
import { fireEvent, waitFor } from '@testing-library/react-native';
import { renderScreen } from '../helpers/render';

jest.mock('expo-router', () => {
  const RealReact = require('react');
  return {
    router: { back: jest.fn(), push: jest.fn(), setParams: jest.fn() },
    useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
    useLocalSearchParams: () => ({}),
    usePathname: () => '/nutrition',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb();
        return typeof cleanup === 'function' ? cleanup : undefined;
      }, [cb]);
    },
    Stack: { Screen: () => null },
    Redirect: () => null,
  };
});

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon');
jest.mock('../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 375, scale: 1.0, horizontalPadding: 16 }),
}));
jest.mock('../../components/FloatingTabBar', () => ({
  useFloatingTabBarHeight: () => 0,
  __esModule: true,
  default: () => null,
}));
jest.mock('../../components/InlineFoodSearch', () => 'InlineFoodSearch');
jest.mock('../../components/SaveAsTemplateSheet', () => 'SaveAsTemplateSheet');
jest.mock('../../components/nutrition/MacroTargetsSheet', () => ({
  MacroTargetsSheet: () => null,
}));
jest.mock('../../components/nutrition/MealTemplatesSheet', () => ({
  MealTemplatesSheet: () => null,
}));
jest.mock('@/components/ui/bottom-sheet', () => ({
  BottomSheet: ({ children, isVisible }: { children: React.ReactNode; isVisible: boolean }) => isVisible ? children : null,
}));
jest.mock('@/components/ui/progress', () => {
  const RealReact = require('react');
  return {
    Progress: ({ value }: { value: number }) =>
      RealReact.createElement('Progress', { testID: 'water-progress', value }),
  };
});

let waterTotalMl = 0;
const waterEntries: Array<{ id: string; date_key: string; amount_ml: number; logged_at: number }> = [];
const mockAddWaterLog = jest.fn(async (dateKey: string, amount: number) => {
  const row = { id: `w${waterEntries.length + 1}`, date_key: dateKey, amount_ml: amount, logged_at: Date.now() };
  waterEntries.unshift(row);
  waterTotalMl += amount;
  return row;
});

const mockGetDailyTotalMl = jest.fn(async (dateKey: string) => {
  void dateKey;
  return waterTotalMl;
});
const mockGetWaterLogsForDate = jest.fn(async (dateKey: string) => {
  void dateKey;
  return [...waterEntries];
});

jest.mock('../../lib/db', () => ({
  getDailyLogs: jest.fn().mockResolvedValue([]),
  getDailySummary: jest.fn().mockResolvedValue({ calories: 0, protein: 0, carbs: 0, fat: 0 }),
  getMacroTargets: jest.fn().mockResolvedValue({ id: 'm', calories: 2000, protein: 150, carbs: 250, fat: 65, updated_at: 0 }),
  deleteDailyLog: jest.fn(),
  addDailyLog: jest.fn(),
  getDailyTotalMl: (...a: unknown[]) => mockGetDailyTotalMl(...(a as [string])),
  getWaterLogsForDate: (...a: unknown[]) => mockGetWaterLogsForDate(...(a as [string])),
  addWaterLog: (...a: unknown[]) => mockAddWaterLog(...(a as [string, number])),
  deleteWaterLog: jest.fn(),
  updateWaterLog: jest.fn(),
  getAppSetting: jest.fn().mockResolvedValue(null),
}));

import Nutrition from '../../app/(tabs)/nutrition';

beforeEach(() => {
  waterTotalMl = 0;
  waterEntries.length = 0;
  jest.clearAllMocks();
});

describe('Hydration acceptance', () => {
  it('tapping the 250ml preset chip persists a water_logs row and updates header total', async () => {
    const { getByText, getByLabelText } = renderScreen(<Nutrition />);

    // Initial render — empty state
    await waitFor(() => {
      expect(getByText('0 / 2,000 ml')).toBeTruthy();
    });

    // Tap +250 ml chip
    fireEvent.press(getByLabelText('Log 250 ml of water'));

    // addWaterLog called with today's dateKey + 250
    await waitFor(() => {
      expect(mockAddWaterLog).toHaveBeenCalledTimes(1);
    });
    const [dateKey, amount] = mockAddWaterLog.mock.calls[0];
    expect(amount).toBe(250);
    expect(dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Header reflects new total after load() resolves
    await waitFor(() => {
      expect(getByText('250 / 2,000 ml')).toBeTruthy();
    });
  });
});
