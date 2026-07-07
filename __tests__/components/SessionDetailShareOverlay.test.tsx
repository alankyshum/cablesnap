import React, { createRef } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { SessionDetailShareOverlay } from '../../components/session/detail/SessionDetailShareOverlay';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { saveShareSettings } from '../../lib/db';
import type BottomSheet from '@gorhom/bottom-sheet';
import type { ThemeColors } from '../../hooks/useThemeColors';

// Setup mocks
jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('file://test-captured-card.png'),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-file-system', () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/components/ui/bna-toast', () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

jest.mock('../../lib/db', () => ({
  saveShareSettings: jest.fn().mockResolvedValue(undefined),
}));

const mockSyncSessionToStrava = jest.fn().mockResolvedValue({ status: "synced" });
jest.mock('../../lib/strava', () => ({
  syncSessionToStrava: (...args: unknown[]) => mockSyncSessionToStrava(...args),
  isStravaConnected: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/strava', () => ({
  syncSessionToStrava: (...args: unknown[]) => mockSyncSessionToStrava(...args),
  isStravaConnected: jest.fn().mockResolvedValue(true),
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

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  const BottomSheet = React.forwardRef(
    (props: { children: React.ReactNode; index: number }, ref: React.Ref<unknown>) => {
      React.useImperativeHandle(ref, () => ({
        snapToIndex: jest.fn(),
        close: jest.fn(),
      }));
      return <View testID="bottom-sheet">{props.children}</View>;
    }
  );
  BottomSheet.displayName = 'BottomSheet';
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
  };
});

describe('SessionDetailShareOverlay', () => {
  const defaultColors = {
    primary: '#000000',
    primaryContainer: '#ffffff',
    onPrimaryContainer: '#000000',
    surface: '#ffffff',
    surfaceVariant: '#cccccc',
    onSurface: '#000000',
    onSurfaceVariant: '#333333',
    outline: '#666666',
    outlineVariant: '#999999',
    background: '#ffffff',
    onBackground: '#000000',
    error: '#ff0000',
  } as unknown as ThemeColors;

  const defaultProps = {
    shareSheetRef: createRef<BottomSheet | null>(),
    onShareText: jest.fn(),
    imageDisabled: false,
    stravaConnected: true,
    onConnectStrava: jest.fn(),
    sessionName: 'Test Workout',
    shareCardDate: 'April 17, 2026',
    duration: '45:00',
    completedSets: 12,
    volumeDisplay: '5,000',
    unit: 'kg' as const,
    rating: 4,
    shareCardPrs: [],
    shareCardExercises: [],
    promoCaption: 'My Custom Promo',
    promoEnabled: true,
    colors: defaultColors,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly and toggles preview visibility via share sheet callback', () => {
    const { getByText } = render(
      <SessionDetailShareOverlay {...defaultProps} />
    );

    // Initial state: modal should be present but check if preview is not visible
    // Wait, let's trigger the callback manually or simulate clicking "Share Strava Image"
    fireEvent.press(getByText('Share Strava Image'));

    // Modal is now visible, rendering StravaShareCard
    expect(getByText('Test Workout')).toBeTruthy();
  });

  it('handles inline editing of caption and saves it as default', async () => {
    const { getByText, getByTestId } = render(
      <SessionDetailShareOverlay {...defaultProps} />
    );

    // Open the preview modal
    fireEvent.press(getByText('Share Strava Image'));

    // Verify caption text input is present and has initial value
    const input = getByTestId('strava-promo-caption-input');
    expect(input.props.value).toBe('My Custom Promo');

    // Edit caption
    fireEvent.changeText(input, 'Super Awesome Workout!');

    // Press save as default
    const saveBtn = getByText('Save as default');
    fireEvent.press(saveBtn);

    expect(saveShareSettings).toHaveBeenCalledWith({
      promo_caption: 'Super Awesome Workout!',
      promo_caption_enabled: 1,
    });
  });

  it('triggers syncSessionToStrava when already synced and saving caption as default', async () => {
    const props = {
      ...defaultProps,
      sessionId: 'sess-abc',
      stravaSynced: true,
      stravaActivityId: 'act-123',
    };
    const { getByText } = render(
      <SessionDetailShareOverlay {...props} />
    );

    // Open the preview modal
    fireEvent.press(getByText('Share Strava Image'));

    // Press save as default
    const saveBtn = getByText('Save as default');
    await act(async () => {
      fireEvent.press(saveBtn);
    });

    expect(saveShareSettings).toHaveBeenCalledWith({
      promo_caption: 'My Custom Promo',
      promo_caption_enabled: 1,
    });
    expect(mockSyncSessionToStrava).toHaveBeenCalledWith('sess-abc');
  });

  it('handles disabling and enabling the promo caption ephemerally', () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <SessionDetailShareOverlay {...defaultProps} />
    );

    // Open preview
    fireEvent.press(getByText('Share Strava Image'));

    // It starts as enabled, so disable button is visible
    const disableBtn = getByTestId('strava-promo-disable-btn');
    fireEvent.press(disableBtn);

    // Input should be gone, and "+ Add promo caption" affordance should be visible
    expect(queryByTestId('strava-promo-caption-input')).toBeNull();
    const addAffordance = getByTestId('strava-promo-add-affordance');
    expect(addAffordance).toBeTruthy();

    // Re-enable
    fireEvent.press(addAffordance);
    expect(getByTestId('strava-promo-caption-input')).toBeTruthy();
  });

  it('captures the view and shares it, using isCapturing state to render static view temporarily', async () => {
    jest.useFakeTimers();
    const { getByText } = render(
      <SessionDetailShareOverlay {...defaultProps} />
    );

    // Open preview
    fireEvent.press(getByText('Share Strava Image'));

    // Press Share
    const shareBtn = getByText('Share');
    fireEvent.press(shareBtn);

    // We should advance the timers to execute the setTimeout
    await act(async () => {
      jest.advanceTimersByTime(50);
    });

    expect(captureRef).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file://test-captured-card.png', {
      mimeType: 'image/png',
    });

    jest.useRealTimers();
  });

  describe("analytics events", () => {
    it("fires strava_share_image_tapped and strava_share_image_cancelled", () => {
      const { stravaLog } = require("../../lib/strava-telemetry");
      const { getByText } = render(<SessionDetailShareOverlay {...defaultProps} sessionId="sess-123" />);

      fireEvent.press(getByText("Share Strava Image"));
      expect(stravaLog).toHaveBeenCalledWith("info", "strava_share_image_tapped", {
        sessionId: "sess-123",
        hasPrs: false,
        exerciseCount: 0,
      });

      fireEvent.press(getByText("Cancel"));
      expect(stravaLog).toHaveBeenCalledWith("info", "strava_share_image_cancelled", {
        sessionId: "sess-123",
      });
    });

    it("fires strava_share_image_shared when shared successfully", async () => {
      jest.useFakeTimers();
      const { stravaLog } = require("../../lib/strava-telemetry");
      const { getByText } = render(<SessionDetailShareOverlay {...defaultProps} sessionId="sess-123" />);

      fireEvent.press(getByText("Share Strava Image"));
      fireEvent.press(getByText("Share"));

      await act(async () => {
        jest.advanceTimersByTime(50);
      });

      expect(stravaLog).toHaveBeenCalledWith("info", "strava_share_image_shared", {
        sessionId: "sess-123",
      });
      jest.useRealTimers();
    });

    it("fires promo_caption_edited, promo_caption_saved_default, and promo_caption_disabled", async () => {
      const { stravaLog } = require("../../lib/strava-telemetry");
      const { getByText, getByTestId } = render(<SessionDetailShareOverlay {...defaultProps} sessionId="sess-123" />);

      fireEvent.press(getByText("Share Strava Image"));

      const input = getByTestId("strava-promo-caption-input");
      fireEvent.changeText(input, "edited cap");
      fireEvent(input, "blur");
      expect(stravaLog).toHaveBeenCalledWith("info", "promo_caption_edited", {
        sessionId: "sess-123",
        captionLength: 10,
      });

      await act(async () => {
        fireEvent.press(getByText("Save as default"));
      });
      expect(stravaLog).toHaveBeenCalledWith("info", "promo_caption_saved_default", {
        captionLength: 10,
      });

      fireEvent.press(getByTestId("strava-promo-disable-btn"));
      expect(stravaLog).toHaveBeenCalledWith("info", "promo_caption_disabled");
    });
  });
});