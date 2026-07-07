jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function MockIcon(props: { name: string; size?: number; color?: string; testID?: string }) {
    return <Text testID={props.testID || `icon-${props.name}`}>{props.name}</Text>;
  };
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AchievementRecapCard, { AchievementRecapCardProps } from '../../components/share/AchievementRecapCard';
import type { AchievementDef } from '../../lib/achievements';

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
  {
    id: 'ton-club',
    name: 'Ton Club',
    description: 'Lifted 1000kg in a single session',
    category: 'volume',
    icon: '💪',
    iconName: 'weight',
    evaluate: mockEvaluate,
  },
];

function renderCard(overrides: Partial<AchievementRecapCardProps> = {}) {
  const defaultProps: AchievementRecapCardProps = {
    achievements: mockAchievements,
    sessionName: 'Epic Workout',
    date: 'April 17, 2026',
    promoCaption: 'Tracked with CableSnap',
    promoEnabled: true,
    ...overrides,
  };
  return render(<AchievementRecapCard {...defaultProps} />);
}

describe('AchievementRecapCard', () => {
  it('renders achievements, names, and descriptions', () => {
    const { getByText } = renderCard();
    expect(getByText('PR Breaker')).toBeTruthy();
    expect(getByText('Hit your first PR')).toBeTruthy();
    expect(getByText('Ton Club')).toBeTruthy();
    expect(getByText('Lifted 1000kg in a single session')).toBeTruthy();
    expect(getByText('2 Achievements Unlocked!')).toBeTruthy();
    expect(getByText('April 17, 2026')).toBeTruthy();
  });

  it('renders CableSnap branding', () => {
    const { getByText } = renderCard();
    expect(getByText('CableSnap')).toBeTruthy();
    expect(getByText('cablesnap.app')).toBeTruthy();
  });

  it('limits displayed achievements to 4 and shows "+N more" overflow', () => {
    const manyAchievements: AchievementDef[] = Array.from({ length: 6 }, (_, i) => ({
      id: `ach-${i}`,
      name: `Achievement ${i + 1}`,
      description: `Description ${i + 1}`,
      category: 'consistency',
      icon: '🏆',
      iconName: 'trophy',
      evaluate: mockEvaluate,
    }));

    const { getByText, queryByText } = renderCard({ achievements: manyAchievements });
    expect(getByText('6 Achievements Unlocked!')).toBeTruthy();
    expect(getByText('Achievement 1')).toBeTruthy();
    expect(getByText('Achievement 4')).toBeTruthy();
    expect(queryByText('Achievement 5')).toBeNull();
    expect(getByText('+2 more')).toBeTruthy();
  });

  it('shows promo caption when enabled', () => {
    const { getByText } = renderCard({ promoCaption: 'My custom caption', promoEnabled: true });
    expect(getByText('My custom caption')).toBeTruthy();
    expect(getByText('cablesnap.app')).toBeTruthy();
  });

  it('hides promo caption when disabled', () => {
    const { queryByText } = renderCard({ promoCaption: 'My custom caption', promoEnabled: false });
    expect(queryByText('My custom caption')).toBeNull();
    expect(queryByText('cablesnap.app')).toBeNull();
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
