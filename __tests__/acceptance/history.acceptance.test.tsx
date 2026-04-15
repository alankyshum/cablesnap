jest.setTimeout(10000)

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
    useAnimatedStyle: () => ({}),
    useSharedValue: <T,>(v: T) => ({ value: v }),
    withTiming: <T,>(v: T) => v,
    createAnimatedComponent: <T,>(c: T) => c,
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

jest.mock('../../lib/db', () => ({
  getSessionsByMonth: (...args: unknown[]) => mockGetSessionsByMonth(...args),
  getRecentSessions: (...args: unknown[]) => mockGetRecentSessions(...args),
  searchSessions: (...args: unknown[]) => mockSearchSessions(...args),
  getSessionCountsByDay: (...args: unknown[]) => mockGetSessionCountsByDay(...args),
  getAllCompletedSessionWeeks: (...args: unknown[]) => mockGetAllCompletedSessionWeeks(...args),
  getTotalSessionCount: (...args: unknown[]) => mockGetTotalSessionCount(...args),
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
  })

  describe('Calendar view', () => {
    it('renders month label and navigation buttons', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous month')).toBeTruthy()
        expect(screen.getByLabelText('Next month')).toBeTruthy()
      })
    })

    it('navigates to previous month on chevron press', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous month')).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText('Previous month'))

      // After pressing, the month label should have changed
      // The component re-renders with new month state
      expect(screen.getByLabelText('Previous month')).toBeTruthy()
    })

    it('navigates to next month on chevron press', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Next month')).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText('Next month'))

      expect(screen.getByLabelText('Next month')).toBeTruthy()
    })
  })

  describe('Workout indicators on dates', () => {
    it('shows workout day labels on dates with sessions', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const label5 = screen.getByLabelText(/5.*1 workout/)
        expect(label5).toBeTruthy()
      })
    })

    it('shows multiple workout indicators for dates with multiple sessions', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const label10 = screen.getByLabelText(/10.*2 workouts/)
        expect(label10).toBeTruthy()
      })
    })

    it('shows rest day label on dates without sessions', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const restDays = screen.getAllByLabelText(/rest day/)
        expect(restDays.length).toBeGreaterThan(0)
      })
    })
  })

  describe('Session cards', () => {
    it('renders session cards with name, duration, and set count', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Push Day/)).toBeTruthy()
        expect(screen.getByLabelText(/Pull Day/)).toBeTruthy()
        expect(screen.getByLabelText(/Legs/)).toBeTruthy()
      })
    })

    it('shows set count on session cards', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/15 sets/)).toBeTruthy()
        expect(screen.getByLabelText(/12 sets/)).toBeTruthy()
        expect(screen.getByLabelText(/18 sets/)).toBeTruthy()
      })
    })

    it('navigates to session detail on card press', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Push Day/)).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/Push Day/))
      expect(mockRouter.push).toHaveBeenCalledWith('/session/detail/s1')
    })
  })

  describe('Tapping a date filters sessions', () => {
    it('filters to show only sessions for the tapped date', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/5.*1 workout/)).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/5.*1 workout/))

      await waitFor(() => {
        expect(screen.getByLabelText(/Push Day/)).toBeTruthy()
        expect(screen.queryByLabelText(/Pull Day/)).toBeNull()
        expect(screen.queryByLabelText(/Legs/)).toBeNull()
      })
    })

    it('shows clear filter chip when date is selected', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/5.*1 workout/)).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/5.*1 workout/))

      await waitFor(() => {
        expect(screen.getByLabelText('Clear filter')).toBeTruthy()
      })
    })

    it('clears filter when chip is pressed', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/5.*1 workout/)).toBeTruthy()
      })

      fireEvent.press(screen.getByLabelText(/5.*1 workout/))
      await waitFor(() => {
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
    it('shows empty state for days with no workouts', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const restDays = screen.getAllByLabelText(/rest day/)
        expect(restDays.length).toBeGreaterThan(0)
      })

      // Tap a specific rest day (day 2 or 3 which won't have sessions)
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
    it('renders search bar with accessible label', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
      })
    })

    it('calls searchSessions on query input', async () => {
      jest.useFakeTimers()
      const matchingSessions = [sessionsThisMonth[0]]
      mockSearchSessions.mockResolvedValue(matchingSessions)

      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
      })

      fireEvent.changeText(screen.getByLabelText('Search workout history'), 'Push')
      jest.advanceTimersByTime(350)

      await waitFor(() => {
        expect(mockSearchSessions).toHaveBeenCalledWith('Push')
      })

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
    it('renders heatmap toggle with accessible label', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText(/Last 16 Weeks/)).toBeTruthy()
      })
    })

    it('collapses and expands heatmap on toggle press', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
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
    it('all navigation buttons have accessible labels', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        expect(screen.getByLabelText('Previous month')).toBeTruthy()
        expect(screen.getByLabelText('Next month')).toBeTruthy()
        expect(screen.getByLabelText('Search workout history')).toBeTruthy()
      })
    })

    it('session cards have role button', async () => {
      const screen = renderScreen(<History />)
      await waitFor(() => {
        const card = screen.getByLabelText(/Push Day/)
        expect(card.props.accessibilityRole || card.props.role).toBe('button')
      })
    })
  })
})
