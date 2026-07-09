import React, { createRef } from 'react';
import { Platform } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import type { BottomSheetModal } from '@gorhom/bottom-sheet';
import ShareSheet from '../../components/ShareSheet';

let mockBottomSheetProps: Record<string, unknown> | null = null;

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
    (props: { children: React.ReactNode; index: number; snapPoints: string[] }, ref: React.Ref<unknown>) => {
      mockBottomSheetProps = props as unknown as Record<string, unknown>;
      React.useImperativeHandle(ref, () => ({
        snapToIndex: jest.fn(),
        close: jest.fn(),
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      // Always render children in test so we can query them
      return <View testID="bottom-sheet">{props.children}</View>;
    }
  );
  BottomSheet.displayName = 'BottomSheet';

  const BottomSheetModal = React.forwardRef(
    (props: { children: React.ReactNode; snapPoints: string[]; onDismiss?: () => void }, ref: React.Ref<unknown>) => {
      mockBottomSheetProps = props as unknown as Record<string, unknown>;
      React.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return <View testID="bottom-sheet">{props.children}</View>;
    }
  );
  BottomSheetModal.displayName = 'BottomSheetModal';

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetModal,
    BottomSheetBackdrop: () => null,
  };
});

jest.mock('../../lib/strava-telemetry', () => ({
  stravaLog: jest.fn(),
  captureStravaError: jest.fn(),
  stravaBreakcrumb: jest.fn(),
}));

function renderSheet(overrides: Partial<React.ComponentProps<typeof ShareSheet>> = {}) {
  const ref = createRef<BottomSheetModal | null>();
  const defaultProps = {
    sheetRef: ref,
    onShareText: jest.fn(),
    onShareImage: jest.fn(),
    onShareStravaImage: jest.fn(),
    stravaDisabled: false,
    stravaConnected: true,
    onConnectStrava: jest.fn(),
    onDismiss: jest.fn(),
    imageDisabled: false,
    onSyncToStrava: jest.fn(),
    syncToStravaLabel: 'Sync to Strava',
    ...overrides,
  };
  const result = render(
    <ShareSheet {...defaultProps} />
  );
  return { ...result, sheetRef: ref, props: defaultProps };
}

describe('ShareSheet', () => {
  const originalOS = Platform.OS;

  afterEach(() => {
    Platform.OS = originalOS;
    mockBottomSheetProps = null;
    jest.clearAllMocks();
  });

  it('renders snapPoints of 350', () => {
    renderSheet();
    expect(mockBottomSheetProps).not.toBeNull();
    expect((mockBottomSheetProps as { snapPoints: number[] }).snapPoints).toEqual([350]);
  });

  it('renders share options text when on native platform', () => {
    Platform.OS = 'ios';
    const { getByText } = renderSheet({ stravaConnected: true });
    expect(getByText('Share Workout')).toBeTruthy();
    expect(getByText('Share as Text')).toBeTruthy();
    expect(getByText('Share as Image')).toBeTruthy();
    expect(getByText('Share Strava Image')).toBeTruthy();
  });

  it('hides native image options when on web platform', () => {
    Platform.OS = 'web';
    const { getByText, queryByText } = renderSheet();
    expect(getByText('Share Workout')).toBeTruthy();
    expect(getByText('Share as Text')).toBeTruthy();
    expect(queryByText('Share as Image')).toBeNull();
    expect(queryByText('Share Strava Image')).toBeNull();
    expect(queryByText('Connect Strava')).toBeNull();
  });

  it('triggers onShareText when Share as Text is pressed', () => {
    const onShareText = jest.fn();
    const { getByText } = renderSheet({ onShareText });
    fireEvent.press(getByText('Share as Text'));
    expect(onShareText).toHaveBeenCalledTimes(1);
  });

  it('triggers onShareImage when Share as Image is pressed on native', () => {
    Platform.OS = 'ios';
    const onShareImage = jest.fn();
    const { getByText } = renderSheet({ onShareImage });
    fireEvent.press(getByText('Share as Image'));
    expect(onShareImage).toHaveBeenCalledTimes(1);
  });

  it('shows Connect Strava CTA when disconnected, and triggers onConnectStrava when pressed', () => {
    const { stravaLog } = require('../../lib/strava-telemetry');
    Platform.OS = 'ios';
    const onConnectStrava = jest.fn();
    const onShareStravaImage = jest.fn();
    const { getByText, queryByText } = renderSheet({
      stravaConnected: false,
      onConnectStrava,
      onShareStravaImage,
    });
    
    expect(getByText('Connect Strava')).toBeTruthy();
    expect(queryByText('Share Strava Image')).toBeNull();

    fireEvent.press(getByText('Connect Strava'));
    expect(onConnectStrava).toHaveBeenCalledTimes(1);
    expect(onShareStravaImage).not.toHaveBeenCalled();
    expect(stravaLog).toHaveBeenCalledWith('info', 'connect_strava_cta_tapped');
  });

  it('shows Share Strava Image when connected, and triggers onShareStravaImage when pressed', () => {
    Platform.OS = 'ios';
    const onConnectStrava = jest.fn();
    const onShareStravaImage = jest.fn();
    const { getByText, queryByText } = renderSheet({
      stravaConnected: true,
      onConnectStrava,
      onShareStravaImage,
    });

    expect(getByText('Share Strava Image')).toBeTruthy();
    expect(queryByText('Connect Strava')).toBeNull();

    fireEvent.press(getByText('Share Strava Image'));
    expect(onShareStravaImage).toHaveBeenCalledTimes(1);
    expect(onConnectStrava).not.toHaveBeenCalled();
  });

  it('disables options appropriately based on imageDisabled and stravaDisabled', () => {
    Platform.OS = 'ios';
    const { getByLabelText } = renderSheet({ imageDisabled: true, stravaDisabled: true });
    
    expect(getByLabelText('Share as Image').props.accessibilityState?.disabled).toBe(true);
    expect(getByLabelText('Share Strava Image').props.accessibilityState?.disabled).toBe(true);
  });

  describe('Sync to Strava Option', () => {
    it('renders Sync to Strava when connected on native', () => {
      Platform.OS = 'ios';
      const onSyncToStrava = jest.fn();
      const { getByText } = renderSheet({ stravaConnected: true, onSyncToStrava, syncToStravaLabel: 'Sync to Strava' });
      expect(getByText('Sync to Strava')).toBeTruthy();
    });

    it('triggers onSyncToStrava when pressed', () => {
      Platform.OS = 'ios';
      const onSyncToStrava = jest.fn();
      const { getByText } = renderSheet({ stravaConnected: true, onSyncToStrava, syncToStravaLabel: 'Sync to Strava' });
      fireEvent.press(getByText('Sync to Strava'));
      expect(onSyncToStrava).toHaveBeenCalledTimes(1);
    });

    it('hides Sync to Strava when disconnected', () => {
      Platform.OS = 'ios';
      const { queryByText } = renderSheet({ stravaConnected: false });
      expect(queryByText('Sync to Strava')).toBeNull();
    });

    it('hides Sync to Strava on web even if connected', () => {
      Platform.OS = 'web';
      const { queryByText } = renderSheet({ stravaConnected: true });
      expect(queryByText('Sync to Strava')).toBeNull();
    });
  });

  describe('Achievement Recap Option', () => {
    it('renders snapPoints of 480 when hasAchievements is true', () => {
      renderSheet({ hasAchievements: true });
      expect(mockBottomSheetProps).not.toBeNull();
      expect((mockBottomSheetProps as { snapPoints: number[] }).snapPoints).toEqual([480]);
    });

    it('renders Share Achievement Recap when hasAchievements is true on native', () => {
      Platform.OS = 'ios';
      const { getByText } = renderSheet({ hasAchievements: true });
      expect(getByText('Share Achievement Recap')).toBeTruthy();
    });

    it('hides Share Achievement Recap when hasAchievements is false', () => {
      Platform.OS = 'ios';
      const { queryByText } = renderSheet({ hasAchievements: false });
      expect(queryByText('Share Achievement Recap')).toBeNull();
    });

    it('hides Share Achievement Recap on web even if hasAchievements is true', () => {
      Platform.OS = 'web';
      const { queryByText } = renderSheet({ hasAchievements: true });
      expect(queryByText('Share Achievement Recap')).toBeNull();
    });

    it('triggers onShareAchievementImage when pressed', () => {
      Platform.OS = 'ios';
      const onShareAchievementImage = jest.fn();
      const { getByText } = renderSheet({ hasAchievements: true, onShareAchievementImage });
      fireEvent.press(getByText('Share Achievement Recap'));
      expect(onShareAchievementImage).toHaveBeenCalledTimes(1);
    });
  });
});
