/**
 * BLD-2355: Volume label in workout summary stats card must not truncate.
 *
 * Before the fix: `Volume ({unit})` used `numberOfLines={1}` with
 * `adjustsFontSizeToFit minimumFontScale={0.7}`, which still showed
 * "Volume …" at 390×844 because even 70% of the caption font is too wide
 * for the equal-flex column.
 *
 * After the fix: the label uses `numberOfLines={2}` (no `adjustsFontSizeToFit`)
 * so it wraps to two lines ("Volume" + "(kg)") instead of truncating.
 *
 * This test renders the full Summary route with a fully-resolved data mock
 * and asserts:
 *   1. The Volume label text node is present in the tree.
 *   2. Its closest `numberOfLines` prop is 2, not 1.
 *   3. It has no `adjustsFontSizeToFit` prop set to true (the broken prior fix).
 */

import React from 'react'
import { render } from '@testing-library/react-native'

// ── Minimal router mock ────────────────────────────────────────────────────
jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    Stack: { Screen: () => null },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({ id: 'session-1' }),
    usePathname: () => '/session/summary/session-1',
    useFocusEffect: (cb: () => (() => void) | void) => {
      RealReact.useEffect(() => {
        const cleanup = cb()
        return typeof cleanup === 'function' ? cleanup : undefined
      }, [])
    },
  }
})

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => 'Icon')
jest.mock('lucide-react-native', () => {
  const dummy = () => null
  return new Proxy({}, { get: () => dummy })
})

jest.mock('../../../../lib/layout', () => ({
  useLayout: () => ({ wide: false, width: 390, scale: 1.0, horizontalPadding: 16 }),
}))
jest.mock('../../../../lib/interactions', () => ({
  log: jest.fn(),
  recent: jest.fn().mockResolvedValue([]),
}))
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: { cache: '/cache' } }))
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }))
jest.mock('../../../../lib/errors', () => ({
  logError: jest.fn(),
  generateReport: jest.fn().mockResolvedValue('{}'),
  getRecentErrors: jest.fn().mockResolvedValue([]),
  generateGitHubURL: jest.fn().mockReturnValue('https://github.com'),
}))

// ── Data hook mocks — provide a completed session so the stats card renders ─
jest.mock('../../../../hooks/useSummaryData', () => ({
  useSummaryData: () => ({
    session: {
      id: 'session-1',
      name: 'Test Workout',
      completed_at: 1700000000,
      started_at: 1700000000,
      duration_seconds: 3600,
      rating: null,
      notes: null,
      edited_at: null,
    },
    grouped: [],
    prs: [],
    repPrs: [],
    increases: [],
    comparison: null,
    unit: 'kg' as const,
    volume: 3720,
    setsBreakdown: '',
    newAchievements: [],
    completedSetCount: 12,
    primaryMuscles: [],
    secondaryMuscles: [],
    error: null,
  }),
}))

jest.mock('../../../../hooks/useSummaryActions', () => ({
  useSummaryActions: () => ({
    rating: null,
    handleRatingChange: jest.fn(),
    notesExpanded: false,
    setNotesExpanded: jest.fn(),
    notesText: '',
    setNotesText: jest.fn(),
    handleNotesSave: jest.fn(),
    templateModalVisible: false,
    setTemplateModalVisible: jest.fn(),
    templateName: '',
    setTemplateName: jest.fn(),
    saving: false,
    handleSaveAsTemplate: jest.fn(),
    handleShareButtonPress: jest.fn(),
    previewVisible: false,
    setPreviewVisible: jest.fn(),
    imageLoading: false,
    setImageLoading: jest.fn(),
    shareCardRef: { current: null },
    handleCaptureAndShare: jest.fn(),
    handleShareImage: jest.fn(),
    shareSheetRef: { current: null },
  }),
}))

jest.mock('../../../../hooks/useSessionPacing', () => ({
  useSessionPacing: () => ({ pacing: null }),
}))

jest.mock('../../../../components/RatingWidget', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('../../../../components/ShareSheet', () => ({
  __esModule: true,
  default: () => null,
}))
jest.mock('../../../../components/session/summary/SummaryFooter', () => ({
  __esModule: true,
  default: () => null,
}))

import SummaryRoute from '../../../../app/session/summary/[id]'

describe('BLD-2355 — Volume stat label truncation fix', () => {
  it('renders the Volume label without truncation (numberOfLines === 2)', () => {
    const { getAllByText } = render(<SummaryRoute />)

    // The label rendered is "Volume (kg)" with the mocked unit='kg'.
    const nodes = getAllByText(/Volume \(kg\)/)
    expect(nodes.length).toBeGreaterThan(0)

    // Walk up the tree from the text node to find the closest numberOfLines prop.
    const textNode = nodes[0]
    let cursor: typeof textNode | null = textNode
    let resolvedNumberOfLines: number | undefined
    while (cursor) {
      const n = cursor.props?.numberOfLines as number | undefined
      if (typeof n === 'number') {
        resolvedNumberOfLines = n
        break
      }
      cursor = cursor.parent ?? null
    }

    // Must be 2 (wraps) — NOT 1 (truncates)
    expect(resolvedNumberOfLines).toBe(2)
  })

  it('Volume label does not use adjustsFontSizeToFit (previous broken workaround)', () => {
    const { getAllByText } = render(<SummaryRoute />)

    const nodes = getAllByText(/Volume \(kg\)/)
    expect(nodes.length).toBeGreaterThan(0)

    const textNode = nodes[0]
    // The fix removes adjustsFontSizeToFit from the label entirely.
    // Walk up to find the enclosing Text node and confirm the prop is absent/false.
    let cursor: typeof textNode | null = textNode
    let foundAdjusts: boolean | undefined
    while (cursor) {
      if (cursor.props && 'adjustsFontSizeToFit' in cursor.props) {
        foundAdjusts = cursor.props.adjustsFontSizeToFit as boolean
        break
      }
      cursor = cursor.parent ?? null
    }
    // Should not be true (either absent or explicitly false)
    expect(foundAdjusts).not.toBe(true)
  })
})
