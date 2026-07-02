import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BeanIcon } from '../../lib/currencyIcons';

type Props = {
  amount?: number;
};

/** Compact host daily beans badge — top-left on live watch/broadcast screens. */
export default function HostDailyEarningsChip({ amount = 0 }: Props) {
  return (
    <View style={s.chip}>
      <Text style={s.label}>Today</Text>
      <BeanIcon size={9} />
      <Text style={s.value}>{amount.toLocaleString('en-IN')}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.22)',
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  value: {
    color: '#FF9500',
    fontSize: 10,
    fontWeight: '800',
  },
});