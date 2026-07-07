import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import SummaryFooter from '../../components/session/summary/SummaryFooter';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import type { AchievementDef } from '../../lib/achievements';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('file://test-captured-achievement-card.png'),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-file-system', () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../components/ui/bna-toast', () => ({
  useToast: () => ({
    toast: jest.fn(),
  }),
}));

jest.mock('../../lib/db', () => ({
  saveShareSettings: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function MockIcon(props: { name: string; size?: number; color?: string; testID?: string }) {
    return <Text testID={props.testID || `icon-${props.name}`}>{props.name}</Text>;
  };
});

const mockEvaluate = () => ({ earned: true, progress: 1 });

const mockAchievements: AchievementDef[] = [
  {
    id: 'pr-breaker',
    name: 'PR Breaker',
    description: 'Hit your first PR',
    category: 'strength',
    icon: '🏆',
    iconName: 'trophy',
    evaluate: mockEvaluate,
  },
];

function makeProps(overrides: Partial<React.ComponentProps<typeof SummaryFooter>> = {}) {
  const achievementCardRefVal = { current: {} } as unknown as React.RefObject<import('react-native').View | null>;
  return {
    colors: {
      surface: '#fff',
      surfaceVariant: '#eee',
      onSurface: '#000',
      onSurfaceDisabled: '#888',
      outline: '#ccc',
      outlineVariant: '#ddd',
      primary: '#0af',
      error: '#f00',
      onSurfaceVariant: '#333',
    } as unknown as React.ComponentProps<typeof SummaryFooter>['colors'],
    session: { completed_at: 1700000000, name: 'Test workout' },
    completedSetCount: 5,
    templateModalVisible: false,
    setTemplateModalVisible: jest.fn(),
    templateName: '',
    setTemplateName: jest.fn(),
    saving: false,
    handleSaveAsTemplate: jest.fn(),
    onDone: jest.fn(),
    onViewDetails: jest.fn(),
    onSharePress: jest.fn(),
    previewVisible: false,
    setPreviewVisible: jest.fn(),
    imageLoading: false,
    setImageLoading: jest.fn(),
    stravaPreviewVisible: false,
    setStravaPreviewVisible: jest.fn(),
    stravaImageLoading: false,
    setStravaImageLoading: jest.fn(),
    stravaCardRef: { current: null },
    handleCaptureStravaAndShare: jest.fn(),
    achievementPreviewVisible: true,
    setAchievementPreviewVisible: jest.fn(),
    achievementImageLoading: false,
    setAchievementImageLoading: jest.fn(),
    achievementCardRef: achievementCardRefVal,
    handleCaptureAchievementAndShare: jest.fn(async () => {
      const uri = await captureRef(achievementCardRefVal, { format: 'png', quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    }),
    newAchievements: mockAchievements,
    promoCaption: 'Summary Default Promo',
    promoEnabled: true,
    shareCardRef: { current: null },
    handleCaptureAndShare: jest.fn(),
    shareCardDate: '2026-01-01',
    duration: '1h',
    completedCount: 5,
    volumeDisplay: '1000',
    unit: 'kg' as const,
    rating: 4,
    shareCardPrs: [],
    shareCardExercises: [],
    ...overrides,
  };
}

describe('SummaryFooter — Achievement functional tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with Achievement preview visible and displays achievements and initial promo caption', () => {
    const props = makeProps();
    const { getByTestId, getByText } = render(<SummaryFooter {...props} />);

    expect(getByTestId('summary-achievement-preview-overlay')).toBeTruthy();
    expect(getByText('PR Breaker')).toBeTruthy();
    expect(getByTestId('strava-promo-caption-input').props.value).toBe('Summary Default Promo');
  });

  it('triggers capture and share when Share is clicked inside achievement preview', async () => {
    jest.useFakeTimers();
    const props = makeProps();
    const { getByAccessibilityHint } = render(<SummaryFooter {...props} />);

    const shareBtn = getByAccessibilityHint('Capture and share the achievement recap card image');
    fireEvent.press(shareBtn);

    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    expect(props.handleCaptureAchievementAndShare).toHaveBeenCalled();
    expect(captureRef).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file://test-captured-achievement-card.png', {
      mimeType: 'image/png',
    });
    jest.useRealTimers();
  });
});
