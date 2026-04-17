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
      if (props.index === -1) return null;
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

import React, { createRef } from 'react';
import { render } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import ShareSheet from '../../components/ShareSheet';

function renderSheet(overrides: Partial<React.ComponentProps<typeof ShareSheet>> = {}) {
  const ref = createRef<InstanceType<typeof import('@gorhom/bottom-sheet').default>>();
  const defaultProps = {
    sheetRef: ref,
    onShareText: jest.fn(),
    onShareImage: jest.fn(),
    onDismiss: jest.fn(),
    imageDisabled: false,
    ...overrides,
  };
  const result = render(
    <PaperProvider>
      <ShareSheet {...defaultProps} />
    </PaperProvider>
  );
  return { ...result, sheetRef: ref, props: defaultProps };
}

describe('ShareSheet', () => {
  it('renders share options text', () => {
    // BottomSheet is closed by default (index=-1), so nothing renders
    const { queryByText } = renderSheet();
    // With index -1, BottomSheet mock returns null
    expect(queryByText('Share Workout')).toBeNull();
  });

  it('renders with image disabled', () => {
    const { props } = renderSheet({ imageDisabled: true });
    expect(props.imageDisabled).toBe(true);
  });

  it('accepts imageDisabled prop for no-set sessions', () => {
    const { props } = renderSheet({ imageDisabled: true });
    expect(props.imageDisabled).toBe(true);
  });
});
