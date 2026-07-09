jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function MockIcon(props: { name: string; size?: number; color?: string; testID?: string }) {
    return <Text testID={props.testID || `icon-${props.name}`}>{props.name}</Text>;
  };
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import StravaShareCard from '../../components/share/StravaShareCard';
import type { StravaShareCardProps } from '../../components/share/StravaShareCard';

function renderCard(overrides: Partial<StravaShareCardProps> = {}) {
  const defaultProps: StravaShareCardProps = {
    name: 'Push Day',
    date: 'April 17, 2026',
    duration: '45:00',
    sets: 24,
    volume: '12,400',
    unit: 'kg',
    prs: [],
    exercises: [],
    promoCaption: 'Tracked with CableSnap',
    promoEnabled: true,
    ...overrides,
  };
  return render(<StravaShareCard {...defaultProps} />);
}

describe('StravaShareCard', () => {
  it('renders session name and date', () => {
    const { getByText } = renderCard();
    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('April 17, 2026')).toBeTruthy();
  });

  it('renders CableSnap branding', () => {
    const { getByText } = renderCard();
    expect(getByText('CableSnap')).toBeTruthy();
    expect(getByText('https://github.com/alankyshum/cablesnap')).toBeTruthy();
  });

  it('renders stats row with duration, sets, and volume', () => {
    const { getByText } = renderCard({ duration: '1:23:00', sets: 30, volume: '15,000', unit: 'lb' });
    expect(getByText('1:23:00')).toBeTruthy();
    expect(getByText('30')).toBeTruthy();
    expect(getByText('15,000')).toBeTruthy();
    expect(getByText('Volume (lb)')).toBeTruthy();
  });

  it('renders PRs section when PRs are provided', () => {
    const { getByText } = renderCard({
      prs: [
        { name: 'Bench Press', value: '100 kg' },
        { name: 'Squat', value: '140 kg' },
      ],
    });
    expect(getByText('New PRs')).toBeTruthy();
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByText('100 kg')).toBeTruthy();
    expect(getByText('Squat')).toBeTruthy();
  });

  it('omits PR section when no PRs', () => {
    const { queryByText } = renderCard({ prs: [] });
    expect(queryByText('New PRs')).toBeNull();
  });

  it('renders exercises list', () => {
    const { getByText } = renderCard({
      exercises: [
        { name: 'Bench Press', sets: 4, reps: '10', weight: '80 kg' },
        { name: 'Cable Fly', sets: 3, reps: '15' },
      ],
    });
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByText('4×10 @ 80 kg')).toBeTruthy();
    expect(getByText('Cable Fly')).toBeTruthy();
    expect(getByText('3×15')).toBeTruthy();
  });

  it('shows "and N more" when more than 5 exercises', () => {
    const exercises = Array.from({ length: 7 }, (_, i) => ({
      name: `Exercise ${i + 1}`,
      sets: 3,
      reps: '10',
    }));
    const { getByText, queryByText } = renderCard({ exercises });
    expect(getByText('Exercise 1')).toBeTruthy();
    expect(getByText('Exercise 5')).toBeTruthy();
    expect(queryByText('Exercise 6')).toBeNull();
    expect(getByText('and 2 more')).toBeTruthy();
  });

  it('shows promo caption when enabled', () => {
    const { getByText } = renderCard({ promoCaption: 'My custom caption', promoEnabled: true });
    expect(getByText('My custom caption')).toBeTruthy();
    expect(getByText('https://github.com/alankyshum/cablesnap')).toBeTruthy();
  });

  it('hides promo caption when disabled', () => {
    const { queryByText } = renderCard({ promoCaption: 'My custom caption', promoEnabled: false });
    expect(queryByText('My custom caption')).toBeNull();
    expect(queryByText('https://github.com/alankyshum/cablesnap')).toBeNull();
  });

  describe('interactive promo modes', () => {
    it('renders Add promo caption affordance when interactive and disabled', () => {
      const onToggleEnabled = jest.fn();
      const { getByTestId, queryByTestId, getByText } = renderCard({
        promoEnabled: false,
        interactive: true,
        onToggleEnabled,
      });

      expect(getByTestId('strava-promo-add-affordance')).toBeTruthy();
      expect(queryByTestId('strava-promo-caption-input')).toBeNull();
      expect(getByText('+ Add promo caption')).toBeTruthy();

      fireEvent.press(getByTestId('strava-promo-add-affordance'));
      expect(onToggleEnabled).toHaveBeenCalledWith(true);
    });

    it('renders TextInput and disable button when interactive and enabled', () => {
      const onCaptionChange = jest.fn();
      const onToggleEnabled = jest.fn();
      const { getByTestId, queryByTestId } = renderCard({
        promoCaption: 'Interactive Caption',
        promoEnabled: true,
        interactive: true,
        onCaptionChange,
        onToggleEnabled,
      });

      expect(queryByTestId('strava-promo-add-affordance')).toBeNull();
      const input = getByTestId('strava-promo-caption-input');
      expect(input).toBeTruthy();
      expect(input.props.value).toBe('Interactive Caption');

      fireEvent.changeText(input, 'New Text');
      expect(onCaptionChange).toHaveBeenCalledWith('New Text');

      const disableBtn = getByTestId('strava-promo-disable-btn');
      expect(disableBtn).toBeTruthy();
      fireEvent.press(disableBtn);
      expect(onToggleEnabled).toHaveBeenCalledWith(false);
    });
  });
});
