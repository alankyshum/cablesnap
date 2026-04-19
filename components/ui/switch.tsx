/* eslint-disable */
import { useColor } from '@/hooks/useColor';
import React from 'react';

import { Text } from '@/components/ui/text';
import { View } from '@/components/ui/view';
import {
  Switch as RNSwitch,
  SwitchProps as RNSwitchProps,
  TextStyle,
} from 'react-native';
import { fontSizes } from "@/constants/design-tokens";

interface SwitchProps extends RNSwitchProps {
  label?: string;
  error?: string;
  labelStyle?: TextStyle;
}

export function Switch({ label, error, labelStyle, ...props }: SwitchProps) {
  const mutedColor = useColor('muted');
  const greenColor = useColor('green');
  const primary = useColor('primary');
  const danger = useColor('red');

  return (
    <View style={{ marginBottom: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 32, // Ensure consistent height
        }}
      >
        {label && (
          <Text
            variant='caption'
            numberOfLines={2} // Allow wrapping for longer labels
            ellipsizeMode='tail'
            style={[
              {
                color: error ? danger : primary,
                flex: 1, // Take available space
                marginRight: 12, // Add spacing between label and switch
              },
              labelStyle,
            ]}
            pointerEvents='none'
          >
            {label}
          </Text>
        )}

        <RNSwitch
          trackColor={{ false: mutedColor, true: greenColor }}
          thumbColor={props.value ? '#ffffff' : mutedColor}
          {...props}
        />
      </View>

      {error && (
        <Text
          variant='caption'
          numberOfLines={2}
          ellipsizeMode='tail'
          style={[
            {
              fontSize: fontSizes.xs, // Slightly smaller for error text
              color: danger, // Always use danger color for errors
              marginTop: 4, // Add spacing above error text
            },
          ]}
          pointerEvents='none'
        >
          {error}
        </Text>
      )}
    </View>
  );
}
