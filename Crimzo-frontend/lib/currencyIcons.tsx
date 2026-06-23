import React from 'react';
import { View, Text, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** Blue diamond — use everywhere for diamonds (not yellow/gold) */
export const DIAMOND_COLOR = '#00BFFF';

/** Orange cup — use everywhere for beans */
export const BEAN_COLOR = '#FF9500';

type CurrencyIconProps = {
  size?: number;
  color?: string;
  style?: ViewStyle;
};

export function DiamondIcon({ size = 16, color = DIAMOND_COLOR, style }: CurrencyIconProps) {
  return (
    <View style={style}>
      <Ionicons name="diamond" size={size} color={color} />
    </View>
  );
}

export function BeanIcon({ size = 16, color = BEAN_COLOR, style }: CurrencyIconProps) {
  return (
    <View style={style}>
      <Ionicons name="cafe" size={size} color={color} />
    </View>
  );
}

type AmountProps = {
  amount: number | string;
  size?: number;
  textStyle?: TextStyle;
  gap?: number;
};

export function BeanAmount({ amount, size = 14, textStyle, gap = 3 }: AmountProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <BeanIcon size={size} />
      <Text style={textStyle}>{amount}</Text>
    </View>
  );
}

export function DiamondAmount({ amount, size = 14, textStyle, gap = 3 }: AmountProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap }}>
      <DiamondIcon size={size} />
      <Text style={textStyle}>{amount}</Text>
    </View>
  );
}