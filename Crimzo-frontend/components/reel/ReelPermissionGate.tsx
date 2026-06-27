import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { reelStudioColors } from './reelStudioTheme';

type Props = {
  variant: 'web' | 'permission' | 'loading';
  onGrantPermissions?: () => void;
  onOpenGallery?: () => void;
  onClose?: () => void;
};

export default function ReelPermissionGate({
  variant,
  onGrantPermissions,
  onOpenGallery,
  onClose,
}: Props) {
  if (variant === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={reelStudioColors.primary} />
        <Text style={styles.loadingText}>Preparing camera...</Text>
      </View>
    );
  }

  const isWeb = variant === 'web';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#12121E', '#06060F', '#000']}
        style={StyleSheet.absoluteFill}
      />

      {onClose && (
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={22} color="#FFF" />
        </TouchableOpacity>
      )}

      <View style={styles.iconCircle}>
        <Ionicons
          name={isWeb ? 'phone-portrait-outline' : 'camera-outline'}
          size={32}
          color={reelStudioColors.primary}
        />
      </View>

      <Text style={styles.title}>
        {isWeb ? 'Use mobile app' : 'Camera access'}
      </Text>
      <Text style={styles.subtitle}>
        {isWeb
          ? 'Record on phone · upload here'
          : 'Allow camera & mic for reels'}
      </Text>

      <View style={styles.actionRow}>
        {!isWeb && onGrantPermissions && (
          <TouchableOpacity style={styles.iconAction} onPress={onGrantPermissions} activeOpacity={0.8}>
            <Ionicons name="shield-checkmark" size={22} color="#FFF" />
          </TouchableOpacity>
        )}

        {onOpenGallery && (
          <TouchableOpacity style={styles.iconAction} onPress={onOpenGallery} activeOpacity={0.8}>
            <Ionicons name="images" size={22} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#06060F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  closeBtn: {
    position: 'absolute',
    top: 52,
    left: 16,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: reelStudioColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle: {
    color: reelStudioColors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 24,
  },
  iconAction: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: reelStudioColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: reelStudioColors.textMuted, marginTop: 12, fontSize: 13 },
});