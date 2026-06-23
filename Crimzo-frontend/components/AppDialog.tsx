import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppAlertButton, AppAlertPayload, AppAlertVariant } from '../lib/appAlert';
import { colors, gradients, radii } from '../lib/theme';

const { width: SW } = Dimensions.get('window');

type Props = {
  visible: boolean;
  payload: AppAlertPayload | null;
  onClose: (button?: AppAlertButton) => void;
};

const VARIANT_META: Record<
  AppAlertVariant,
  { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; gradient: readonly [string, string] }
> = {
  info: {
    icon: 'information-circle',
    color: '#60A5FA',
    bg: 'rgba(96,165,250,0.15)',
    gradient: ['#3B82F6', '#2563EB'],
  },
  success: {
    icon: 'checkmark-circle',
    color: '#4ADE80',
    bg: 'rgba(74,222,128,0.15)',
    gradient: ['#34D399', '#10B981'],
  },
  warning: {
    icon: 'warning',
    color: '#FBBF24',
    bg: 'rgba(251,191,36,0.15)',
    gradient: ['#FBBF24', '#F59E0B'],
  },
  error: {
    icon: 'close-circle',
    color: '#F87171',
    bg: 'rgba(248,113,113,0.15)',
    gradient: ['#F87171', '#EF4444'],
  },
  confirm: {
    icon: 'help-circle',
    color: '#FF6B8A',
    bg: 'rgba(255,45,85,0.15)',
    gradient: gradients.primary,
  },
};

export default function AppDialog({ visible, payload, onClose }: Props) {
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0.92);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, damping: 18, stiffness: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [visible, payload?.title]);

  if (!payload) return null;

  const variant = payload.variant ?? 'info';
  const meta = VARIANT_META[variant];
  const buttons = payload.buttons?.length ? payload.buttons : [{ text: 'OK' }];
  const cancelable = payload.options?.cancelable !== false;
  const stacked = buttons.length > 2;
  const nonCancel = buttons.filter((b) => b.style !== 'cancel');
  const primaryIndex = buttons.findIndex(
    (b) => b.style === 'destructive' || b === nonCancel[nonCancel.length - 1],
  );

  const dismiss = (btn?: AppAlertButton) => {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.95, duration: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
    ]).start(() => onClose(btn));
  };

  const handleBackdrop = () => {
    if (!cancelable) return;
    const cancelBtn = buttons.find((b) => b.style === 'cancel');
    payload.options?.onDismiss?.();
    dismiss(cancelBtn);
  };

  const handlePress = (btn: AppAlertButton) => {
    dismiss(btn);
    btn.onPress?.();
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={handleBackdrop}>
      <Animated.View style={[s.overlay, { opacity }]}>
        <Pressable style={s.backdrop} onPress={handleBackdrop} />
        <Animated.View style={[s.cardWrap, { transform: [{ scale }] }]}>
          <View style={s.card}>
            <LinearGradient colors={[...meta.gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.accentBar} />

            <View style={[s.iconRing, { backgroundColor: meta.bg, borderColor: `${meta.color}44` }]}>
              <Ionicons name={meta.icon} size={28} color={meta.color} />
            </View>

            <Text style={s.title}>{payload.title}</Text>
            {payload.message ? <Text style={s.message}>{payload.message}</Text> : null}

            <View style={[s.btnArea, stacked && s.btnAreaStack]}>
              {buttons.map((btn, idx) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                const isPrimary = !isCancel && (buttons.length === 1 || idx === primaryIndex);

                if (isPrimary) {
                  return (
                    <TouchableOpacity
                      key={`${btn.text}-${idx}`}
                      style={[s.btnFlex, stacked && s.btnFull]}
                      onPress={() => handlePress(btn)}
                      activeOpacity={0.88}
                    >
                      <LinearGradient
                        colors={isDestructive ? ['#F87171', '#EF4444'] : [...gradients.primary]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={s.btnPrimary}
                      >
                        <Text style={s.btnPrimaryText}>{btn.text}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                }

                return (
                  <TouchableOpacity
                    key={`${btn.text}-${idx}`}
                    style={[
                      s.btnSecondary,
                      stacked && s.btnFull,
                      isDestructive && s.btnDestructive,
                    ]}
                    onPress={() => handlePress(btn)}
                    activeOpacity={0.85}
                  >
                    <Text style={[s.btnSecondaryText, isDestructive && s.btnDestructiveText]}>{btn.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    paddingHorizontal: 24,
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  cardWrap: { width: '100%', maxWidth: Math.min(SW - 48, 360) },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 18,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
  },
  accentBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 14,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  message: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  btnArea: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    justifyContent: 'center',
  },
  btnAreaStack: { flexDirection: 'column' },
  btnFlex: { flex: 1 },
  btnFull: { width: '100%', flex: undefined },
  btnPrimary: {
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  btnSecondary: {
    flex: 1,
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  btnSecondaryText: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  btnDestructive: {
    borderColor: 'rgba(248,113,113,0.35)',
    backgroundColor: 'rgba(248,113,113,0.1)',
  },
  btnDestructiveText: { color: '#F87171' },
});