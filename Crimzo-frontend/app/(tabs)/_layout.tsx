import React, { useEffect } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { colors } from '../../lib/theme';

function TabBarBackground() {
  return (
    <View style={styles.tabBarBg}>
      <LinearGradient
        colors={['rgba(255,45,85,0.35)', 'rgba(255,45,85,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.tabBarAccent}
      />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { token, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !token) {
      router.replace('/(auth)/login');
    }
  }, [loading, token, router]);

  const BOTTOM_OFFSET = insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        lazy: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBackground: () => <TabBarBackground />,
        tabBarStyle: {
          height: 58 + BOTTOM_OFFSET,
          paddingBottom: BOTTOM_OFFSET,
          paddingTop: 6,
          backgroundColor: 'rgba(8,8,16,0.96)',
          borderTopWidth: 0,
          elevation: 24,
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -6 },
          position: 'absolute',
        },
        tabBarShowLabel: false,
        tabBarItemStyle: { height: 52 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name={focused ? 'home' : 'home-outline'} size={23} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name={focused ? 'play-circle' : 'play-circle-outline'} size={23} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          tabBarIcon: () => (
            <View style={styles.createWrap}>
              <LinearGradient
                colors={['#FF2D55', '#FF6B35']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.createBtn}
              >
                <Ionicons name="add" size={30} color="#FFF" />
              </LinearGradient>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="gifts"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name={focused ? 'gift' : 'gift-outline'} size={23} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Ionicons name={focused ? 'person' : 'person-outline'} size={23} color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBarBg: {
    flex: 1,
    backgroundColor: 'rgba(8,8,16,0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
  },
  tabBarAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  iconWrapActive: {
    backgroundColor: 'rgba(255,45,85,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.25)',
  },
  createWrap: {
    marginBottom: Platform.OS === 'android' ? 2 : 4,
  },
  createBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
  },
});