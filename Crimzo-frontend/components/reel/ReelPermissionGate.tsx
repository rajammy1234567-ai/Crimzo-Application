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
          <Ionicons name="close" size={26} color="#FFF" />
        </TouchableOpacity>
      )}

      <View style={styles.iconCircle}>
        <Ionicons
          name={isWeb ? 'phone-portrait-outline' : 'camera-outline'}
          size={42}
          color={reelStudioColors.primary}
        />
      </View>

      <Text style={styles.title}>
        {isWeb ? 'Record on your phone' : 'Camera access required'}
      </Text>
      <Text style={styles.subtitle}>
        {isWeb
          ? 'Reel recording works best on the Crimzo mobile app. You can still upload a video from gallery here.'
          : 'Allow camera and microphone to record professional 9:16 reels with music.'}
      </Text>

      <View style={styles.steps}>
        {['Pick or record video', 'Add trending music', 'Write caption & share'].map((step, i) => (
          <View key={step} style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))}
      </View>

      {!isWeb && onGrantPermissions && (
        <TouchableOpacity style={styles.primaryBtn} onPress={onGrantPermissions} activeOpacity={0.85}>
          <Ionicons name="shield-checkmark-outline" size={18} color="#FFF" />
          <Text style={styles.primaryBtnText}>Enable Camera & Mic</Text>
        </TouchableOpacity>
      )}

      {onOpenGallery && (
        <TouchableOpacity style={styles.secondaryBtn} onPress={onOpenGallery} activeOpacity={0.85}>
          <Ionicons name="images-outline" size={18} color="#FFF" />
          <Text style={styles.secondaryBtnText}>Upload from Gallery</Text>
        </TouchableOpacity>
      )}
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
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: reelStudioColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: { color: '#FFF', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: reelStudioColors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 21,
  },
  steps: { marginTop: 28, width: '100%', gap: 12 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  stepText: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '500' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 28,
    backgroundColor: reelStudioColors.primary,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: reelStudioColors.surface,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
  },
  secondaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '600' },
  loadingText: { color: reelStudioColors.textMuted, marginTop: 14, fontSize: 14 },
});