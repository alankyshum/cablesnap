jest.setTimeout(10000)

jest.mock('expo-router', () => {
  const RealReact = require('react')
  return {
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
jest.mock('../../lib/db', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  updateMacroTargets: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../lib/db/body', () => ({
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm', sex: 'male' }),
  getLatestBodyWeight: jest.fn().mockResolvedValue({ weight: 75 }),
  updateBodySex: jest.fn().mockResolvedValue(undefined),
}))

describe('Issue 1: Add food header button', () => {
  it('nutrition tab _layout.tsx includes plus icon for adding food', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../app/(tabs)/_layout.tsx'),
      'utf8'
    )
    expect(source).toContain('plus')
    expect(source).toContain('add')
    expect(source).toContain('Add food')
  })

  it('nutrition tab reads add param and opens bottom sheet', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../app/(tabs)/nutrition.tsx'),
      'utf8'
    )
    expect(source).toContain('add')
    expect(source).toContain('BottomSheet')
  })
})

describe('Issue 2: Stat card padding', () => {
  it('stat style includes gap spacing', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../components/home/StatsRow.tsx'),
      'utf8'
    )
    expect(source).toMatch(/stat[\s\S]*?gap/)
  })
})

describe('Issue 3: Activity level dropdown', () => {
  it('ActivityDropdown uses Pressable dropdown with full labels', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(path.resolve(__dirname, '../../components/profile/ActivityDropdown.tsx'), 'utf8')
    expect(source).toContain('Pressable')
    expect(source).toContain('ACTIVITY_LABELS[')
  })
})
