import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../lib/theme';

const CrimzoNavLogo: React.FC = () => (
  <View style={s.wrap}>
    <LinearGradient colors={['rgba(255,45,85,0.25)', 'rgba(255,45,85,0.08)']} style={s.iconRing}>
      <Image
        source={require('../../assets/images/CRIMZO_ICON.png')}
        style={s.icon}
        resizeMode="contain"
      />
    </LinearGradient>
    <View style={s.textCol}>
      <Text style={s.brand}>CRIMZO</Text>
      <Text style={s.tagline}>VIDEO CHAT</Text>
    </View>
  </View>
);

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconRing: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.35)',
  },
  icon: {
    width: 30,
    height: 30,
  },
  textCol: {
    justifyContent: 'center',
    paddingTop: 1,
  },
  brand: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2.8,
    color: colors.primary,
    lineHeight: 24,
    includeFontPadding: false,
  },
  tagline: {
    marginTop: 2,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: 'rgba(255,120,140,0.85)',
    lineHeight: 11,
    includeFontPadding: false,
  },
});

export default CrimzoNavLogo;