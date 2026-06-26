import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PulsingAvatar from './PulsingAvatar';

type HostBusyOverlayProps = {
  username?: string;
  avatar?: string | null;
  message?: string;
};

export default function HostBusyOverlay({
  username = 'Host',
  avatar,
  message = 'Busy with someone',
}: HostBusyOverlayProps) {
  return (
    <View style={styles.overlay}>
      <LinearGradient colors={['#1a0a1e', '#12121a', '#0a0a14']} style={StyleSheet.absoluteFill} />
      <View style={styles.content}>
        <PulsingAvatar name={username} avatar={avatar} size={132} pulse ringCount={3} />
        <Text style={styles.username}>{username}</Text>
        <View style={styles.badge}>
          <Ionicons name="lock-closed" size={14} color="#FF8FAB" />
          <Text style={styles.badgeText}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 3,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  username: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 22,
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,45,85,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,45,85,0.35)',
  },
  badgeText: {
    color: '#FF8FAB',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});