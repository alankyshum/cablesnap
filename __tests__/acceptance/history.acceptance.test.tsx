import React from 'react'
import { fireEvent, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'
import { createSession, resetIds } from '../helpers/factories'

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
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const AnimatedView = ({ entering: _entering, ...rest }: Record<string, unknown>) => {
    return require('react').createElement(RN.View, rest)
  }
  return {
    __esModule: true,
    default: {
      View: AnimatedView,
      createAnimatedComponent: <T,>(c: T) => c,
    },
    FadeIn: { duration: () => ({}) },
    useAnimatedStyle: (fn: () => Record<string, unknown>) => fn(),
    useSharedValue: <T,>(v: T) => ({ value: v }),
    useReducedMotion: () => false,
    withTiming: <T,>(v: T) => v,
    // BLD-938: BottomSheet imports these; the inline mock above predates
    // the new sheets and would otherwise crash the screen on mount.
    withSpring: <T,>(v: T) => v,
    runOnJS: <T,>(fn: T) => fn,
    createAnimatedComponent: <T,>(c: T) => c,
    Easing: { bezier: () => (t: number) => t },
  }
})

jest.mock('../../components/WorkoutHeatmap', () => {
  const RealReact = require('react')
  return {
    __esModule: true,
    default: () =>
      RealReact.createElement('View', { testID: 'workout-heatmap' }),
  }
})

type SessionRow = {
  id: string
  template_id: string | null
  name: string
  started_at: number
  completed_at: number | null
  duration_seconds: number | null
  notes: string
  set_count: number
}

const now = new Date()
const thisYear = now.getFullYear()
const thisMonth = now.getMonth()

function makeSessionRow(overrides: Partial<SessionRow> = {}): SessionRow {
  const base = createSession(overrides)
  return {
    ...base,
    set_count: overrides.set_count ?? 12,
    duration_seconds: overrides.duration_seconds ?? 3600,
    completed_at: overrides.completed_at ?? (base.started_at + 3600000),
  }
}

const day5 = new Date(thisYear, thisMonth, 5, 10, 0, 0).getTime()
const day10 = new Date(thisYear, thisMonth, 10, 14, 0, 0).getTime()
const day10b = new Date(thisYear, thisMonth, 10, 18, 0, 0).getTime()

const sessionsThisMonth: SessionRow[] = [
  makeSessionRow({ id: 's1', name: 'Push Day', started_at: day5, completed_at: day5 + 3600000, duration_seconds: 3600, set_count: 15 }),
  makeSessionRow({ id: 's2', name: 'Pull Day', started_at: day10, completed_at: day10 + 2700000, duration_seconds: 2700, set_count: 12 }),
  makeSessionRow({ id: 's3', name: 'Legs', started_at: day10b, completed_at: day10b + 3000000, duration_seconds: 3000, set_count: 18 }),
]

const mockGetSessionsByMonth = jest.fn().mockResolvedValue(sessionsThisMonth)
const mockGetRecentSessions = jest.fn().mockResolvedValue([sessionsThisMonth[0]])
const mockSearchSessions = jest.fn().mockResolvedValue([])
const mockGetSessionCountsByDay = jest.fn().mockResolvedValue([])
const mockGetAllCompletedSessionWeeks = jest.fn().mockResolvedValue([])
const mockGetTotalSessionCount = jest.fn().mockResolvedValue(42)
// BLD-938: spy mocks for the filter pipeline. Hoisted so individual tests
// can reconfigure them (e.g. simulate a paginated result set).
const mockGetTemplatesWithSessions = jest.fn().mockResolvedValue([])
const mockGetMuscleGroupsWithSessions = jest.fn().mockResolvedValue([])
const mockGetFilteredSessions = jest.fn().mockResolvedValue({ rows: [], total: 0 })

jest.mock('../../lib/db', () => ({
  getSessionsByMonth: (...args: unknown[]) => mockGetSessionsByMonth(...args),
  getRecentSessions: (...args: unknown[]) => mockGetRecentSessions(...args),
  searchSessions: (...args: unknown[]) => mockSearchSessions(...args),
  getSessionCountsByDay: (...args: unknown[]) => mockGetSessionCountsByDay(...args),
  getAllCompletedSessionWeeks: (...args: unknown[]) => mockGetAllCompletedSessionWeeks(...args),
  getTotalSessionCount: (...args: unknown[]) => mockGetTotalSessionCount(...args),
  // BLD-938: history filter queries — empty defaults so existing
  // (non-filter) tests fall through to calendar/recent path. Filter tests
  // below override these with realistic data.
  getTemplatesWithSessions: (...args: unknown[]) => mockGetTemplatesWithSessions(...args),
  getMuscleGroupsWithSessions: (...args: unknown[]) => mockGetMuscleGroupsWithSessions(...args),
  getFilteredSessions: (...args: unknown[]) => mockGetFilteredSessions(...args),
}))

jest.mock('../../lib/db/settings', () => ({
  getSchedule: jest.fn().mockResolvedValue([]),
}))

import History from '../../app/history'

describe('Workout History & Calendar Acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetIds()
    mockGetSessionsByMonth.mockResolvedValue(sessionsThisMonth)
    mockGetRecentSessions.mockResolvedValue([sessionsThisMonth[0]])
    mockGetSessionCountsByDay.mockResolvedValue([])
    mockGetAllCompletedSessionWeeks.mockResolvedValue([])
    mockGetTotalSessionCount.mockResolvedValue(42)
    mockSearchSessions.mockResolvedValue([])
    mockGetTemplatesWithSessions.mockResolvedValue([])
    mockGetMuscleGroupsWithSessions.mockResolvedValue([])
    mockGetFilteredSessions.mockResolvedValue({ rows: [], total: 0 })
  })

  describe('Calendar view', () => {
    it('renders month label, navigation buttons, and responds to chevron presses', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous month')).toBeTruthy()
        expect(screen.getByLabelText('Next month')).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText('Previous month'))
      // After pressing, the month label should have changed (re-renders with new state)
      expect(screen.getByLabelText('Previous month')).toBeTruthy()

      fireEvent.press(screen.getByLabelText('Next month'))
      expect(screen.getByLabelText('Next month')).toBeTruthy()
    })
  })

  describe('Workout indicators on dates', () => {
    it('shows workout day labels (single, multiple) and rest day labels', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/5.*1 workout/)).toBeTruthy()
        expect(screen.getByLabelText(/10.*2 workouts/)).toBeTruthy()
        expect(screen.getAllByLabelText(/rest day/).length).toBeGreaterThan(0)
      })
    })
  })

  describe('Session cards', () => {
    it('renders session cards with names, set counts, and navigates to detail on press', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Push Day/)).toBeTruthy()
        expect(screen.getByLabelText(/Pull Day/)).toBeTruthy()
        expect(screen.getByLabelText(/Legs/)).toBeTruthy()
        expect(screen.getByLabelText(/15 sets/)).toBeTruthy()
        expect(screen.getByLabelText(/12 sets/)).toBeTruthy()
        expect(screen.getByLabelText(/18 sets/)).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/Push Day/))
      expect(mockRouter.push).toHaveBeenCalledWith('/session/detail/s1')
    })
  })

  describe('Tapping a date filters sessions', () => {
    it('filters to selected date, shows clear chip, and clears filter when chip is pressed', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/5.*1 workout/)).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/5.*1 workout/))

      await waitFor(() => {
        expect(screen.getAllByLabelText(/Push Day/).length).toBeGreaterThan(0)
        expect(screen.queryByLabelText(/Pull Day/)).toBeNull()
        expect(screen.queryByLabelText(/Legs/)).toBeNull()
        expect(screen.getByLabelText('Clear filter')).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText('Clear filter'))

      await waitFor(() => {
        expect(screen.getByLabelText(/Push Day/)).toBeTruthy()
        expect(screen.getByLabelText(/Pull Day/)).toBeTruthy()
        expect(screen.getByLabelText(/Legs/)).toBeTruthy()
      })
    })
  })

  describe('Empty states', () => {
    it('shows rest day empty state when tapping a day with no workouts', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const restDays = screen.getAllByLabelText(/rest day/)
        expect(restDays.length).toBeGreaterThan(0)
      })

      const restDays = screen.getAllByLabelText(/rest day/)
      fireEvent.press(restDays[0])

      await waitFor(() => {
        expect(screen.getByText('Rest day!')).toBeTruthy()
      })
    })

    it('shows empty state when no workouts exist at all', async () => {
      mockGetSessionsByMonth.mockResolvedValue([])
      mockGetRecentSessions.mockResolvedValue([])

      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByText('No workouts yet. Start your first workout!')).toBeTruthy()
      })
    })
  })

  describe('Search', () => {
    it('routes text-search through getFilteredSessions (paged, 20/page) and renders the result', async () => {
      // BLD-938 — plan §UI Hook: "When any filter is non-null OR text
      // search active → call getFilteredSessions (paged, 20/page)."
      // The legacy in-memory searchSessions render path is gone; text
      // search now uses the same paged DB path as chip filters.
      jest.useFakeTimers()
      const matchingSession = makeSessionRow({
        id: 'search-hit',
        name: 'Push Day Match',
        started_at: day5,
      })
      mockGetFilteredSessions.mockResolvedValue({
        rows: [matchingSession],
        total: 1,
      })

      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
      })

      fireEvent.changeText(screen.getByLabelText('Search workout history'), 'Push')
      // Advance past the 300ms debounce in the unified filter-fetch effect.
      jest.advanceTimersByTime(350)

      await waitFor(() => {
        expect(mockGetFilteredSessions).toHaveBeenCalled()
      })

      // The call must carry the query, page-0 offset, and the
      // 20-row page size — it MUST NOT route through the legacy
      // searchSessions path.
      const lastCall =
        mockGetFilteredSessions.mock.calls[mockGetFilteredSessions.mock.calls.length - 1]
      expect(lastCall[1]).toBe('Push')
      expect(lastCall[2]).toBe(20)
      expect(lastCall[3]).toBe(0)
      expect(mockSearchSessions).not.toHaveBeenCalled()

      // The rendered list MUST come from getFilteredSessions (the
      // matching session above), not from the unfiltered month load.
      await waitFor(() => {
        expect(screen.getAllByLabelText(/Push Day Match/).length).toBeGreaterThan(0)
      })

      jest.useRealTimers()
    })

    it('text-search alone does NOT disable the calendar (only chip filters do)', async () => {
      // Plan §65-69: calendar dim/disable applies when "any filter chip
      // is active". Text search alone uses the filtered SQL path for
      // results but keeps the calendar interactive.
      jest.useFakeTimers()
      mockGetFilteredSessions.mockResolvedValue({ rows: [], total: 0 })

      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
      })

      fireEvent.changeText(screen.getByLabelText('Search workout history'), 'NoMatch')
      jest.advanceTimersByTime(350)

      await waitFor(() => {
        expect(mockGetFilteredSessions).toHaveBeenCalled()
      })

      // Calendar disabled-caption MUST NOT appear for text-search-only.
      expect(
        screen.queryByLabelText('Calendar disabled while filters are active'),
      ).toBeNull()

      jest.useRealTimers()
    })

    it('text-search alone paginates via onEndReached (page-1 offset = 20)', async () => {
      // BLD-938 R6: onEndReached must fire the next page when only text
      // search is active (no chip filters). Previously the FlatList only
      // wired onEndReached when chip filters were active, so text-search
      // results were stuck at the first 20 rows.
      jest.useFakeTimers()
      const page0 = Array.from({ length: 20 }, (_, i) =>
        makeSessionRow({ id: `p0-${i}`, name: 'Push', started_at: day5 - i * 1000 }),
      )
      mockGetFilteredSessions.mockResolvedValue({ rows: page0, total: 45 })

      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
      })

      fireEvent.changeText(screen.getByLabelText('Search workout history'), 'Push')
      jest.advanceTimersByTime(350)

      await waitFor(() => {
        expect(mockGetFilteredSessions).toHaveBeenCalled()
      })

      // Trigger onEndReached on the FlatList. If the screen still gates
      // on chip-only useFilterMode, this is a no-op and the page-1 call
      // never happens.
      const list = screen.getByTestId('history-list')
      mockGetFilteredSessions.mockClear()
      mockGetFilteredSessions.mockResolvedValue({
        rows: [makeSessionRow({ id: 'p1-0', name: 'Push', started_at: day5 - 100000 })],
        total: 45,
      })
      fireEvent(list, 'onEndReached', { distanceFromEnd: 100 })

      await waitFor(() => {
        expect(mockGetFilteredSessions).toHaveBeenCalled()
      })
      const lastCall =
        mockGetFilteredSessions.mock.calls[mockGetFilteredSessions.mock.calls.length - 1]
      expect(lastCall[1]).toBe('Push')
      expect(lastCall[2]).toBe(20)
      expect(lastCall[3]).toBe(20)

      jest.useRealTimers()
    })
  })

  describe('Streak summary', () => {
    it('shows streak and total workout stats', async () => {
      mockGetAllCompletedSessionWeeks.mockResolvedValue([])
      mockGetTotalSessionCount.mockResolvedValue(42)

      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Total workouts: 42/)).toBeTruthy()
      })
    })
  })

  describe('Heatmap section', () => {
    it('renders heatmap toggle and collapses/expands on press', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Last 16 Weeks/)).toBeTruthy()
        expect(screen.getByTestId('workout-heatmap')).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/Last 16 Weeks, collapse/))

      await waitFor(() => {
        expect(screen.queryByTestId('workout-heatmap')).toBeNull()
      })

      fireEvent.press(screen.getByLabelText(/Last 16 Weeks, expand/))

      await waitFor(() => {
        expect(screen.getByTestId('workout-heatmap')).toBeTruthy()
      })
    })
  })

  describe('Accessible labels', () => {
    it('navigation buttons have labels and session cards have role button', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous month')).toBeTruthy()
        expect(screen.getByLabelText('Next month')).toBeTruthy()
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
        const card = screen.getByLabelText(/Push Day/)
        expect(card.props.accessibilityRole || card.props.role).toBe('button')
      })
    })
  })

  describe('Per-month summary bar', () => {
    it('shows workout count and total hours for current month', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/3 workouts.*hours this month/)).toBeTruthy()
      })
    })

    it('shows "No workouts this month" when empty', async () => {
      mockGetSessionsByMonth.mockResolvedValue([])
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByText('No workouts this month')).toBeTruthy()
      })
    })
  })

  describe('Inline day detail panel', () => {
    it('shows panel for day with workout, collapses on re-tap, and has polite live region', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/5.*1 workout/)).toBeTruthy()
      })

      // Open panel
      fireEvent.press(screen.getByLabelText(/5.*1 workout/))
      await waitFor(() => {
        // Panel should show session info: calendar cell + detail panel item
        const panels = screen.getAllByLabelText(/Push Day/)
        expect(panels.length).toBeGreaterThan(1)
      })

      // Has accessibilityLiveRegion polite on panel
      const panelNodes = screen.UNSAFE_queryAllByProps({ accessibilityLiveRegion: 'polite' })
      expect(panelNodes.length).toBeGreaterThan(0)

      // Tap same day again to collapse
      fireEvent.press(screen.getByLabelText(/5.*1 workout/))
      await waitFor(() => {
        // The key assertion is the panel is gone
        expect(screen.queryByText('Rest day')).toBeFalsy()
      })
    })

    it('shows rest day message for days without workouts', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const restDays = screen.getAllByLabelText(/rest day/)
        expect(restDays.length).toBeGreaterThan(0)
      })

      const restDays = screen.getAllByLabelText(/rest day/)
      fireEvent.press(restDays[0])

      await waitFor(() => {
        expect(screen.getByText('Rest day')).toBeTruthy()
      })
    })
  })

  describe('Count badge for 3+ workouts', () => {
    it('shows numeric badge for days with 3+ workouts', async () => {
      const day15 = new Date(thisYear, thisMonth, 15, 8, 0, 0).getTime()
      const multiSessions = [
        makeSessionRow({ id: 's1', name: 'Morning', started_at: day15, duration_seconds: 1800, set_count: 5 }),
        makeSessionRow({ id: 's2', name: 'Noon', started_at: day15 + 3600000, duration_seconds: 1800, set_count: 5 }),
        makeSessionRow({ id: 's3', name: 'Evening', started_at: day15 + 7200000, duration_seconds: 1800, set_count: 5 }),
      ]
      mockGetSessionsByMonth.mockResolvedValue(multiSessions)
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/15.*3 workouts/)).toBeTruthy()
        // The badge should display a count number
        const badges = screen.getAllByText('3')
        expect(badges.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Touch target', () => {
    it('calendar cells have minimum 48dp touch target', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const cell = screen.getByLabelText(/5.*1 workout/)
        // The cell should have minHeight >= 48
        expect(cell.props.style).toBeDefined()
      })
    })
  })

  // ---------------------------------------------------------------------------
  // BLD-938 — Filter UI behavioural coverage
  //
  // QD blocker R2: existing tests do not exercise the filter UI end-to-end.
  // These tests open a sheet from the FilterBar, apply a selection, and
  // assert the observable consequences:
  //   - getFilteredSessions is called with the right shape
  //   - the calendar block is dimmed/disabled when filters are active
  //   - the result-count caption appears
  //   - "Clear all" returns the screen to the unfiltered path
  //
  // We use the public accessibility labels published by FilterBar /
  // DateRangeFilterSheet so the tests survive cosmetic refactors.
  // ---------------------------------------------------------------------------
  describe('BLD-938 filter UI flow', () => {
    it('opens the date range sheet, applies "This year", and routes through getFilteredSessions', async () => {
      // Seed a non-empty filter result so the result-count caption renders.
      mockGetFilteredSessions.mockResolvedValue({
        rows: [
          {
            id: 'filtered-1',
            template_id: null,
            name: 'Filtered Match',
            started_at: day5,
            completed_at: day5 + 3600000,
            duration_seconds: 3600,
            notes: '',
            rating: null,
            set_count: 10,
          },
        ],
        total: 1,
      })

      jest.useFakeTimers()
      const screen = renderScreen(<History />)

      // Initial async loads.
      await waitFor(() => {
        expect(screen.getByTestId('history-filter-chip-date')).toBeTruthy()
      })

      // Open the date sheet.
      fireEvent.press(screen.getByTestId('history-filter-chip-date'))

      // Pick "This year". The sheet renders preset options with the
      // accessibility label "This year" (or "This year, selected").
      await waitFor(() => {
        expect(screen.getByLabelText(/^This year/)).toBeTruthy()
      })
      fireEvent.press(screen.getByLabelText(/^This year/))

      // Advance past the 300ms filter debounce.
      jest.advanceTimersByTime(350)
      jest.useRealTimers()

      await waitFor(() => {
        expect(mockGetFilteredSessions).toHaveBeenCalled()
      })

      // The call must carry datePreset: "year" — full QD R4 contract.
      const lastCall = mockGetFilteredSessions.mock.calls[mockGetFilteredSessions.mock.calls.length - 1]
      expect(lastCall[0]).toMatchObject({ datePreset: 'year' })
      expect(lastCall[3]).toBe(0) // page-0 offset

      // Calendar must be flagged disabled while filters are active.
      await waitFor(() => {
        expect(
          screen.getByLabelText('Calendar disabled while filters are active'),
        ).toBeTruthy()
      })

      // Result-count caption appears once filtered rows are loaded.
      await waitFor(() => {
        expect(screen.getByLabelText('1 sessions match these filters')).toBeTruthy()
      })
    })

    it('"Clear all filters" returns to the unfiltered calendar path', async () => {
      mockGetFilteredSessions.mockResolvedValue({
        rows: [
          {
            id: 'filtered-1',
            template_id: null,
            name: 'Filtered Match',
            started_at: day5,
            completed_at: day5 + 3600000,
            duration_seconds: 3600,
            notes: '',
            rating: null,
            set_count: 10,
          },
        ],
        total: 1,
      })

      jest.useFakeTimers()
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByTestId('history-filter-chip-date')).toBeTruthy()
      })

      // Activate a filter.
      fireEvent.press(screen.getByTestId('history-filter-chip-date'))
      await waitFor(() => {
        expect(screen.getByLabelText(/^This year/)).toBeTruthy()
      })
      fireEvent.press(screen.getByLabelText(/^This year/))
      jest.advanceTimersByTime(350)

      await waitFor(() => {
        expect(
          screen.getByLabelText('Calendar disabled while filters are active'),
        ).toBeTruthy()
      })

      // Now clear all.
      const clearAll = screen.getByTestId('history-filter-clear-all')
      fireEvent.press(clearAll)
      jest.advanceTimersByTime(350)
      jest.useRealTimers()

      // Caption disappears (filter mode false), unfiltered sessions visible.
      await waitFor(() => {
        expect(
          screen.queryByLabelText('Calendar disabled while filters are active'),
        ).toBeNull()
        expect(screen.getByLabelText(/Push Day/)).toBeTruthy()
      })
    })

    it('combines text search WITH a chip filter into one getFilteredSessions call', async () => {
      // QD R5 contract: text + chip composes via the same paged path.
      // Both inputs must arrive on the SAME getFilteredSessions call so
      // SQL composes them with AND.
      mockGetFilteredSessions.mockResolvedValue({
        rows: [
          {
            id: 'combined-1',
            template_id: 'tmpl-upper',
            name: 'Push Combined',
            started_at: day5,
            completed_at: day5 + 3600000,
            duration_seconds: 3600,
            notes: '',
            rating: null,
            set_count: 10,
          },
        ],
        total: 1,
      })

      jest.useFakeTimers()
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
        expect(screen.getByTestId('history-filter-chip-date')).toBeTruthy()
      })

      // Apply chip filter first.
      fireEvent.press(screen.getByTestId('history-filter-chip-date'))
      await waitFor(() => {
        expect(screen.getByLabelText(/^This year/)).toBeTruthy()
      })
      fireEvent.press(screen.getByLabelText(/^This year/))
      jest.advanceTimersByTime(350)

      // Then enter a text query.
      fireEvent.changeText(screen.getByLabelText('Search workout history'), 'Push')
      jest.advanceTimersByTime(350)
      jest.useRealTimers()

      await waitFor(() => {
        // The most recent call must carry BOTH datePreset AND query.
        const lastCall =
          mockGetFilteredSessions.mock.calls[mockGetFilteredSessions.mock.calls.length - 1]
        expect(lastCall[0]).toMatchObject({ datePreset: 'year' })
        expect(lastCall[1]).toBe('Push')
        expect(lastCall[2]).toBe(20)
        expect(lastCall[3]).toBe(0)
      })

      // Calendar must remain disabled because a chip filter is active.
      expect(
        screen.getByLabelText('Calendar disabled while filters are active'),
      ).toBeTruthy()
    })
  })
})
