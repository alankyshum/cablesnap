jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function MockIcon(props: { name: string; size?: number; color?: string; testID?: string }) {
    return <Text testID={props.testID || `icon-${props.name}`}>{props.name}</Text>;
  };
});

import React from 'react';
import { render } from '@testing-library/react-native';
import ShareCard from '../../components/ShareCard';
import type { ShareCardProps } from '../../components/ShareCard';

function renderCard(overrides: Partial<ShareCardProps> = {}) {
  const defaultProps: ShareCardProps = {
    name: 'Push Day',
    date: 'April 17, 2026',
    duration: '45:00',
    sets: 24,
    volume: '12,400',
    unit: 'kg',
    rating: 4,
    prs: [],
    exercises: [],
    ...overrides,
  };
  return render(
    <ShareCard {...defaultProps} />
  );
}

describe('ShareCard', () => {
  it('renders session name and date', () => {
    const { getByText } = renderCard();
    expect(getByText('Push Day')).toBeTruthy();
    expect(getByText('April 17, 2026')).toBeTruthy();
  });

  it('renders CableSnap branding', () => {
    const { getByText } = renderCard();
    expect(getByText('CableSnap')).toBeTruthy();
    expect(getByText('cablesnap.app')).toBeTruthy();
  });

  it('renders stats row with duration, sets, and volume', () => {
    const { getByText } = renderCard({ duration: '1:23:00', sets: 30, volume: '15,000', unit: 'lb' });
    expect(getByText('1:23:00')).toBeTruthy();
    expect(getByText('30')).toBeTruthy();
    expect(getByText('15,000')).toBeTruthy();
    expect(getByText('Volume (lb)')).toBeTruthy();
  });

  it('renders star icons when rating is provided', () => {
    const { getAllByTestId } = renderCard({ rating: 3 });
    const stars = getAllByTestId(/^icon-star/);
    expect(stars.length).toBe(5);
  });

  it('omits rating section when rating is null', () => {
    const { queryAllByTestId } = renderCard({ rating: null });
    const stars = queryAllByTestId(/^icon-star/);
    expect(stars.length).toBe(0);
  });

  it('renders PRs section when PRs are provided', () => {
    const { getByText } = renderCard({
      prs: [
        { name: 'Bench Press', value: '100 kg' },
        { name: 'Squat', value: '140 kg' },
      ],
    });
    expect(getByText('🏆 New PRs')).toBeTruthy();
    expect(getByText('Bench Press')).toBeTruthy();
    expect(getByText('100 kg')).toBeTruthy();
    expect(getByText('Squat')).toBeTruthy();
  });

  it('omits PR section when no PRs', () => {
    const { queryByText } = renderCard({ prs: [] });
    expect(queryByText('🏆 New PRs')).toBeNull();
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

  it('shows "and N more" when more than 6 exercises', () => {
    const exercises = Array.from({ length: 9 }, (_, i) => ({
      name: `Exercise ${i + 1}`,
      sets: 3,
      reps: '10',
    }));
    const { getByText, queryByText } = renderCard({ exercises });
    expect(getByText('Exercise 1')).toBeTruthy();
    expect(getByText('Exercise 6')).toBeTruthy();
    expect(queryByText('Exercise 7')).toBeNull();
    expect(getByText('and 3 more')).toBeTruthy();
  });

  it('renders with dark theme', () => {
    const { getByText } = renderCard();
    expect(getByText('CableSnap')).toBeTruthy();
  });

  it('renders compact card with minimal data', () => {
    const { getByText, queryByText } = renderCard({
      name: 'Quick Workout',
      sets: 1,
      volume: '50',
      rating: null,
      prs: [],
      exercises: [{ name: 'Push-up', sets: 1, reps: '20' }],
    });
    expect(getByText('Quick Workout')).toBeTruthy();
    expect(getByText('Push-up')).toBeTruthy();
    expect(queryByText('🏆 New PRs')).toBeNull();
  });
});
