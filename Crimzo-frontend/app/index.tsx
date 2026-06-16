import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, damping: 18, stiffness: 120, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (!loading) {
      const timeout = setTimeout(() => {
        if (user) {
          router.replace('/(tabs)/home');
        } else {
          router.replace('/(auth)/login');
        }
      }, 400);
      return () => clearTimeout(timeout);
    }
  }, [user, loading]);

  return (
    <LinearGradient colors={['#06060F', '#0f0f1e', '#06060F']} style={styles.container}>
      <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        {/* Glow ring */}
        <Animated.View style={[styles.glowRing, { opacity: glowAnim, transform: [{ scale: glowAnim.interpolate({ inputRange: [0.3, 1], outputRange: [0.95, 1.05] }) }] }]} />

        {/* Logo */}
        <Image
          source={require('../assets/images/crimzo_logo1.png')}
          style={styles.logo}
          resizeMode="contain"
        />

        <Text style={styles.tagline}>ENTER THE STAGE</Text>

        {/* Loading indicator */}
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="small" color="rgba(255,45,85,0.6)" />
        </View>
      </Animated.View>

      {/* Bottom pink bar */}
      <View style={styles.bottomBar}>
        <LinearGradient
          colors={['#FF2D55', '#FF6B35']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.bottomBarLine}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { alignItems: 'center', justifyContent: 'center' },

  glowRing: {
    position: 'absolute',
    width: 200, height: 200, borderRadius: 100,
    borderWidth: 1.5, borderColor: 'rgba(255,45,85,0.2)',
    backgroundColor: 'rgba(255,45,85,0.05)',
  },

  logo: {
    width: 220, height: 90,
    marginBottom: 16,
  },

  tagline: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 5,
    fontWeight: '600',
  },

  loaderWrap: {
    marginTop: 48,
    height: 24,
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    overflow: 'hidden',
  },
  bottomBarLine: { flex: 1 },
});
