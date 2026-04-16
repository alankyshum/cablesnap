jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return function MockIcon(props: { name: string; size?: number; color?: string; testID?: string }) {
    return <Text testID={props.testID || `icon-${props.name}`}>{props.name}</Text>;
  };
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import RatingWidget from '../../components/RatingWidget';

function renderWidget(props: { value: number | null; onChange?: (v: number | null) => void; readOnly?: boolean; size?: 'small' | 'medium' | 'large' }) {
  return render(
    <PaperProvider>
      <RatingWidget {...props} />
    </PaperProvider>
  );
}

describe('RatingWidget', () => {
  it('shows rating label for medium size', () => {
    const { getByText } = renderWidget({ value: 4 });
    expect(getByText('Good')).toBeTruthy();
  });

  it('shows "Not rated" when value is null', () => {
    const { getByText } = renderWidget({ value: null });
    expect(getByText('Not rated')).toBeTruthy();
  });

  it('shows correct labels for each rating', () => {
    const labels = [
      [1, 'Terrible'],
      [2, 'Poor'],
      [3, 'Okay'],
      [4, 'Good'],
      [5, 'Amazing'],
    ] as const;
    for (const [val, label] of labels) {
      const { getByText, unmount } = renderWidget({ value: val });
      expect(getByText(label)).toBeTruthy();
      unmount();
    }
  });

  it('does not show label in small size', () => {
    const { queryByText } = renderWidget({ value: 4, size: 'small' });
    expect(queryByText('Good')).toBeNull();
  });

  it('does not show label in readOnly mode', () => {
    const { queryByText } = renderWidget({ value: 4, readOnly: true });
    expect(queryByText('Good')).toBeNull();
  });

  it('has correct accessibilityLabel when rated', () => {
    const { getByLabelText } = renderWidget({ value: 3 });
    expect(getByLabelText('Rating: 3 out of 5, Okay')).toBeTruthy();
  });

  it('has "Not rated" accessibilityLabel when null', () => {
    const { getByLabelText } = renderWidget({ value: null });
    expect(getByLabelText('Not rated')).toBeTruthy();
  });

  it('increments rating via accessibility action', () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderWidget({ value: null, onChange });
    const widget = getByLabelText('Not rated');
    fireEvent(widget, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('does not increment past 5', () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderWidget({ value: 5, onChange });
    const widget = getByLabelText('Rating: 5 out of 5, Amazing');
    fireEvent(widget, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('decrements rating via accessibility action', () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderWidget({ value: 3, onChange });
    const widget = getByLabelText('Rating: 3 out of 5, Okay');
    fireEvent(widget, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('clears rating when decrementing from 1', () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderWidget({ value: 1, onChange });
    const widget = getByLabelText('Rating: 1 out of 5, Terrible');
    fireEvent(widget, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('does not call onChange in readOnly mode', () => {
    const onChange = jest.fn();
    const { getByLabelText } = renderWidget({ value: 3, onChange, readOnly: true });
    const widget = getByLabelText('Rating: 3 out of 5, Okay');
    fireEvent(widget, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});
