import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const COMPACT_ASPECT = 368 / 78;

const CrimzoNavLogo: React.FC = () => (
  <View style={s.wrap}>
    <LinearGradient
      colors={['rgba(255,45,85,0.2)', 'rgba(255,45,85,0.06)']}
      style={s.iconRing}
    >
      <Image
        source={require('../../assets/images/CRIMZO_ICON.png')}
        style={s.icon}
        resizeMode="contain"
        accessibilityLabel="Crimzo"
      />
    </LinearGradient>

    <View style={s.textCol}>
      <Image
        source={require('../../assets/images/crimzo_logo_compact.png')}
        style={s.wordmark}
        resizeMode="contain"
      />
      <Text style={s.tagline}>VIDEO CHAT · MEET PEOPLE</Text>
    </View>
  </View>
);

const s = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flexShrink: 1,
    minWidth: 0,
  },
  iconRing: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.3)',
  },
  icon: {
    width: 28,
    height: 28,
  },
  textCol: {
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingTop: 1,
  },
  wordmark: {
    height: 22,
    width: 22 * COMPACT_ASPECT,
    maxWidth: 120,
  },
  tagline: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: 'rgba(255,255,255,0.55)',
    includeFontPadding: false,
  },
});

export default CrimzoNavLogo;