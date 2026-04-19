jest.setTimeout(10000)

import React from 'react'
import { waitFor } from '@testing-library/react-native'
import { renderScreen } from '../helpers/render'

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
  getBodySettings: jest.fn().mockResolvedValue({ weight_unit: 'kg', measurement_unit: 'cm' }),
  getLatestBodyWeight: jest.fn().mockResolvedValue({ weight: 75 }),
}))

describe('Issue 1: Barcode scanner header icon', () => {
  it('nutrition tab _layout.tsx includes barcode-scan icon config', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../app/(tabs)/_layout.tsx'),
      'utf8'
    )
    expect(source).toContain('barcode-scan')
    expect(source).toContain('/nutrition?scan=true')
    expect(source).toContain('Scan food barcode')
  })

  it('nutrition tab reads scan param and passes scanOnMount to InlineFoodSearch', () => {
    const fs = require('fs')
    const path = require('path')
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../app/(tabs)/nutrition.tsx'),
      'utf8'
    )
    expect(source).toContain('scan')
    expect(source).toContain('scanOnMount')
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
  it('ProfileForm uses Menu instead of SegmentedButtons for activity level', () => {
    const fs = require('fs')
    const path = require('path')
    const source = [
      fs.readFileSync(path.resolve(__dirname, '../../components/ProfileForm.tsx'), 'utf8'),
      fs.readFileSync(path.resolve(__dirname, '../../components/profile/ActivityDropdown.tsx'), 'utf8'),
      fs.readFileSync(path.resolve(__dirname, '../../hooks/useProfileForm.ts'), 'utf8'),
    ].join('\n')
    // Should use Menu component for activity level
    expect(source).toContain('Menu') // Menu-like component via ActivityDropdown
    expect(source).toContain('activityMenuVisible')
    // Should NOT have truncated labels
    expect(source).not.toContain('ACTIVITY_LABELS.sedentary.split')
    // Should show full labels via ACTIVITY_LABELS[key]
    expect(source).toContain('ACTIVITY_LABELS[')
  })

  it('ProfileForm renders dropdown for activity level', async () => {
    const ProfileForm = require('../../components/ProfileForm').default
    const { findByLabelText } = renderScreen(
      <ProfileForm onSave={jest.fn()} />
    )

    // Should show full activity level label in dropdown
    await waitFor(async () => {
      const dropdown = await findByLabelText(/Activity level:/)
      expect(dropdown).toBeTruthy()
    })
  })
})
