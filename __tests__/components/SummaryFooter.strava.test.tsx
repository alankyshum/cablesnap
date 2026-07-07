import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Linking } from 'react-native';
import SummaryFooter from '../../components/session/summary/SummaryFooter';
import { saveShareSettings } from '../../lib/db';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('file://test-captured-card.png'),
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

jest.mock('../../lib/strava-telemetry', () => ({
  stravaLog: jest.fn(),
  captureStravaError: jest.fn(),
  stravaBreakcrumb: jest.fn(),
}));

jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function MockIcon(props: { name: string; size?: number; color?: string; testID?: string }) {
    return <Text testID={props.testID || `icon-${props.name}`}>{props.name}</Text>;
  };
});

function makeProps(overrides: Partial<React.ComponentProps<typeof SummaryFooter>> = {}) {
  const stravaCardRefVal = { current: {} } as unknown as React.RefObject<import('react-native').View | null>;
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
    stravaPreviewVisible: true,
    setStravaPreviewVisible: jest.fn(),
    stravaImageLoading: false,
    setStravaImageLoading: jest.fn(),
    stravaCardRef: stravaCardRefVal,
    handleCaptureStravaAndShare: jest.fn(async () => {
      const uri = await captureRef(stravaCardRefVal, { format: 'png', quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      const { stravaLog } = require('../../lib/strava-telemetry');
      stravaLog('info', 'strava_share_image_shared', { sessionId: 'sess-abc' });
    }),
    achievementPreviewVisible: false,
    setAchievementPreviewVisible: jest.fn(),
    achievementImageLoading: false,
    setAchievementImageLoading: jest.fn(),
    achievementCardRef: { current: null },
    handleCaptureAchievementAndShare: jest.fn(async (count) => {
      const uri = await captureRef({ current: null }, { format: 'png', quality: 1.0 });
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      const { stravaLog } = require('../../lib/strava-telemetry');
      stravaLog('info', 'achievement_recap_shared', { sessionId: 'sess-abc', achievementCount: count });
    }),
    newAchievements: [],
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

describe('SummaryFooter — Strava functional tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with Strava preview visible and displays initial promo caption', () => {
    const props = makeProps();
    const { getByTestId } = render(<SummaryFooter {...props} />);

    expect(getByTestId('summary-strava-preview-overlay')).toBeTruthy();
    expect(getByTestId('strava-promo-caption-input').props.value).toBe('Summary Default Promo');
  });

  it('allows editing the promo caption and toggling enabled state, and saving as default', async () => {
    const props = makeProps();
    const { getByTestId, getByText, queryByTestId } = render(<SummaryFooter {...props} />);

    // Change caption
    const input = getByTestId('strava-promo-caption-input');
    fireEvent.changeText(input, 'Cool New Workout Promo!');

    // Disable promo caption
    const disableBtn = getByTestId('strava-promo-disable-btn');
    fireEvent.press(disableBtn);

    // It should now show "+ Add promo caption" affordance
    expect(queryByTestId('strava-promo-caption-input')).toBeNull();
    const addAffordance = getByTestId('strava-promo-add-affordance');
    expect(addAffordance).toBeTruthy();

    // Re-enable
    fireEvent.press(addAffordance);
    expect(getByTestId('strava-promo-caption-input')).toBeTruthy();

    // Change text again and save
    fireEvent.changeText(getByTestId('strava-promo-caption-input'), 'Saved Caption');
    const saveBtn = getByText('Save as default');
    fireEvent.press(saveBtn);

    expect(saveShareSettings).toHaveBeenCalledWith({
      promo_caption: 'Saved Caption',
      promo_caption_enabled: 1,
    });
  });

  it('triggers capture and share when Share is clicked', async () => {
    jest.useFakeTimers();
    const props = makeProps();
    const { getByAccessibilityHint } = render(<SummaryFooter {...props} />);

    const shareBtn = getByAccessibilityHint('Capture and share the Strava workout card image');
    fireEvent.press(shareBtn);

    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    expect(props.handleCaptureStravaAndShare).toHaveBeenCalled();
    expect(captureRef).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file://test-captured-card.png', {
      mimeType: 'image/png',
    });
    jest.useRealTimers();
  });

  describe('View on Strava button gating and linking', () => {
    it('shows View on Strava button when stravaSynced is true and stravaActivityId is present', () => {
      const props = makeProps({
        stravaSynced: true,
        stravaActivityId: 'activity-12345',
        stravaPreviewVisible: false,
      });
      const { getByText } = render(<SummaryFooter {...props} />);
      const btn = getByText('View on Strava');
      expect(btn).toBeTruthy();
    });

    it('hides View on Strava button when stravaSynced is false', () => {
      const props = makeProps({
        stravaSynced: false,
        stravaActivityId: 'activity-12345',
        stravaPreviewVisible: false,
      });
      const { queryByText } = render(<SummaryFooter {...props} />);
      expect(queryByText('View on Strava')).toBeNull();
    });

    it('hides View on Strava button when stravaActivityId is missing', () => {
      const props = makeProps({
        stravaSynced: true,
        stravaActivityId: null,
        stravaPreviewVisible: false,
      });
      const { queryByText } = render(<SummaryFooter {...props} />);
      expect(queryByText('View on Strava')).toBeNull();
    });

    it('opens Strava link when View on Strava is pressed', () => {
      const openURLMock = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const props = makeProps({
        stravaSynced: true,
        stravaActivityId: 'activity-12345',
        stravaPreviewVisible: false,
      });
      const { getByText } = render(<SummaryFooter {...props} />);
      const btn = getByText('View on Strava');
      fireEvent.press(btn);

      expect(openURLMock).toHaveBeenCalledWith('https://www.strava.com/activities/activity-12345');
      openURLMock.mockRestore();
    });
  });

  describe('analytics events in summary footer', () => {
    it('fires view_on_strava_tapped when view on strava is pressed', () => {
      const { stravaLog } = require('../../lib/strava-telemetry');
      const openURLMock = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
      const props = makeProps({
        session: { id: 'sess-abc', completed_at: 1700000000, name: 'Test workout' },
        stravaSynced: true,
        stravaActivityId: 'activity-12345',
        stravaPreviewVisible: false,
      });
      const { getByText } = render(<SummaryFooter {...props} />);
      const btn = getByText('View on Strava');
      fireEvent.press(btn);

      expect(stravaLog).toHaveBeenCalledWith('info', 'view_on_strava_tapped', {
        sessionId: 'sess-abc',
        activityId: 'activity-12345',
      });
      openURLMock.mockRestore();
    });

    it('fires strava_share_image_cancelled on closing preview', () => {
      const { stravaLog } = require('../../lib/strava-telemetry');
      const props = makeProps({
        session: { id: 'sess-abc', completed_at: 1700000000, name: 'Test workout' },
        stravaPreviewVisible: true,
      });
      const { getByText } = render(<SummaryFooter {...props} />);
      const cancelBtn = getByText('Cancel');
      fireEvent.press(cancelBtn);

      expect(stravaLog).toHaveBeenCalledWith('info', 'strava_share_image_cancelled', {
        sessionId: 'sess-abc',
      });
    });

    it('fires strava_share_image_shared when captured and shared', async () => {
      jest.useFakeTimers();
      const { stravaLog } = require('../../lib/strava-telemetry');
      const props = makeProps({
        session: { id: 'sess-abc', completed_at: 1700000000, name: 'Test workout' },
        stravaPreviewVisible: true,
      });
      const { getByAccessibilityHint } = render(<SummaryFooter {...props} />);
      const shareBtn = getByAccessibilityHint('Capture and share the Strava workout card image');
      fireEvent.press(shareBtn);

      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      expect(stravaLog).toHaveBeenCalledWith('info', 'strava_share_image_shared', {
        sessionId: 'sess-abc',
      });
      jest.useRealTimers();
    });

    it('fires promo caption edits and disable/enable events', async () => {
      const { stravaLog } = require('../../lib/strava-telemetry');
      const props = makeProps({
        session: { id: 'sess-abc', completed_at: 1700000000, name: 'Test workout' },
        stravaPreviewVisible: true,
      });
      const { getByTestId, getByText } = render(<SummaryFooter {...props} />);

      const input = getByTestId('strava-promo-caption-input');
      fireEvent.changeText(input, 'summary cap');
      fireEvent(input, 'blur');
      expect(stravaLog).toHaveBeenCalledWith('info', 'promo_caption_edited', {
        sessionId: 'sess-abc',
        captionLength: 11,
      });

      await act(async () => {
        fireEvent.press(getByText('Save as default'));
      });
      expect(stravaLog).toHaveBeenCalledWith('info', 'promo_caption_saved_default', {
        captionLength: 11,
      });

      fireEvent.press(getByTestId('strava-promo-disable-btn'));
      expect(stravaLog).toHaveBeenCalledWith('info', 'promo_caption_disabled');
    });
  });
});