import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet, Modal, TouchableOpacity } from 'react-native';

interface Props {
  visible: boolean;
  progress?: number;   // 0-100
  done?: boolean;
  message?: string;
  onDismiss?: () => void;
}

const UploadOverlay: React.FC<Props> = ({
  visible,
  progress = 0,
  done = false,
  message = 'Uploading...',
  onDismiss,
}) => {
  const barWidth = useRef(new Animated.Value(0)).current;
  const checkScale = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  useEffect(() => {
    if (done) {
      Animated.spring(checkScale, {
        toValue: 1,
        friction: 4,
        tension: 80,
        useNativeDriver: true,
      }).start();
    } else {
      checkScale.setValue(0);
    }
  }, [done]);

  useEffect(() => {
    if (visible && !done) {
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      spinAnim.setValue(0);
    }
  }, [visible, done]);

  // Safety: never leave a full-screen blocker stuck forever
  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => {
      onDismiss?.();
    }, 10 * 60 * 1000);
    return () => clearTimeout(timeout);
  }, [visible, onDismiss]);

  const spin = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const barPercent = barWidth.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (done) onDismiss?.();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.box}>
          {done ? (
            <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
              <Text style={styles.checkMark}>✓</Text>
            </Animated.View>
          ) : (
            <Animated.View style={[styles.spinRing, { transform: [{ rotate: spin }] }]} />
          )}

          <Text style={styles.title}>{done ? 'Upload Complete!' : message}</Text>

          {!done && (
            <>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressFill, { width: barPercent }]} />
              </View>
              <Text style={styles.progressText}>{Math.min(100, Math.round(progress))}%</Text>
            </>
          )}

          {done && onDismiss && (
            <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss} activeOpacity={0.8}>
              <Text style={styles.dismissText}>Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    backgroundColor: '#1A1A24',
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    minWidth: 220,
  },
  spinRing: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: 'transparent',
    borderTopColor: '#FF2D55',
    borderRightColor: '#FF2D55',
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 26,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressTrack: {
    width: 160,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#FF2D55',
  },
  progressText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '600',
  },
  dismissBtn: {
    marginTop: 4,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dismissText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default UploadOverlay;