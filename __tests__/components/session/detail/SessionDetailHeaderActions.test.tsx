jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function MockIcon(props: { name: string; size?: number; color?: string }) {
    return <Text testID={`icon-${props.name}`}>{props.name}</Text>;
  };
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SessionDetailHeaderActions } from '@/components/session/detail/SessionDetailHeaderActions';

const defaultColors = {
  primary: '#6200ee', onSurface: '#1c1c1e', onSurfaceVariant: '#666',
  onSurfaceDisabled: '#aaa', surface: '#fff', surfaceVariant: '#f5f5f5',
  background: '#fff', onBackground: '#000', error: '#b00020', outline: '#ccc',
  secondary: '#03dac6', tertiary: '#018786', inversePrimary: '#bb86fc',
  inverseSurface: '#121212', inverseOnSurface: '#f5f5f5',
  scrim: 'rgba(0,0,0,0.3)', shadow: 'rgba(0,0,0,0.1)',
  surfaceContainerLow: '#f0f0f0', surfaceContainerHigh: '#e0e0e0',
  onSecondary: '#000', onTertiary: '#fff', onError: '#fff',
  secondaryContainer: '#ddd', onSecondaryContainer: '#333',
} as unknown as Parameters<typeof SessionDetailHeaderActions>[0]["colors"];

const baseProps = {
  editing: false, dirty: false, saving: false, showEditButton: true,
  completedSetCount: 5, onCancel: jest.fn(), onSave: jest.fn(),
  onEnterEdit: jest.fn(), onOpenTemplate: jest.fn(), onShare: jest.fn(),
  colors: defaultColors,
};

describe('SessionDetailHeaderActions — share button (BLD-891)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders share button with correct icon, a11y, fires onShare, and co-renders with edit/template buttons', () => {
    const { getByLabelText, getByTestId } = render(<SessionDetailHeaderActions {...baseProps} />);
    const btn = getByLabelText('Share workout');
    expect(btn.props.accessibilityHint).toBe('Share this workout session as text or image');
    expect(getByTestId('icon-share-variant-outline')).toBeTruthy();
    expect(getByLabelText('Edit workout')).toBeTruthy();
    expect(getByLabelText('Save as template')).toBeTruthy();
    fireEvent.press(btn);
    expect(baseProps.onShare).toHaveBeenCalledTimes(1);
  });

  it('hides share button in editing mode and when showEditButton is false', () => {
    const { queryByLabelText, rerender } = render(
      <SessionDetailHeaderActions {...baseProps} editing={true} dirty={false} />
    );
    expect(queryByLabelText('Share workout')).toBeNull();
    rerender(<SessionDetailHeaderActions {...baseProps} showEditButton={false} />);
    expect(queryByLabelText('Share workout')).toBeNull();
    expect(queryByLabelText('Edit workout')).toBeNull();
  });
});

describe('SessionDetailHeaderActions — View on Strava button', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows View on Strava only when synced and activityId is present, is hidden when pending/failed/no-log', () => {
    // 1. When synced + activityId: should be visible
    const { queryByLabelText, rerender } = render(
      <SessionDetailHeaderActions
        {...baseProps}
        stravaSynced={true}
        stravaActivityId="123456"
      />
    );
    expect(queryByLabelText('View on Strava')).toBeTruthy();

    // 2. Hidden when not synced (even if activityId is present)
    rerender(
      <SessionDetailHeaderActions
        {...baseProps}
        stravaSynced={false}
        stravaActivityId="123456"
      />
    );
    expect(queryByLabelText('View on Strava')).toBeNull();

    // 3. Hidden when no activityId (even if synced)
    rerender(
      <SessionDetailHeaderActions
        {...baseProps}
        stravaSynced={true}
        stravaActivityId={null}
      />
    );
    expect(queryByLabelText('View on Strava')).toBeNull();

    // 4. Hidden when pending/failed (e.g., unsynced/no-log)
    rerender(
      <SessionDetailHeaderActions
        {...baseProps}
        stravaSynced={false}
        stravaActivityId={null}
      />
    );
    expect(queryByLabelText('View on Strava')).toBeNull();
  });

  it('pressing View on Strava opens https://www.strava.com/activities/${activityId}', () => {
    const openURLMock = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getByLabelText } = render(
      <SessionDetailHeaderActions
        {...baseProps}
        stravaSynced={true}
        stravaActivityId="123456"
      />
    );

    const btn = getByLabelText('View on Strava');
    fireEvent.press(btn);

    expect(openURLMock).toHaveBeenCalledWith('https://www.strava.com/activities/123456');
    openURLMock.mockRestore();
  });
});
