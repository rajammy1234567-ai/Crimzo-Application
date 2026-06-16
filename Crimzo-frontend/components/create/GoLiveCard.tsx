import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LivePulse from './LivePulse';

interface Props {
    onPress: () => void;
    fadeAnim: Animated.Value;
    slideAnim: Animated.Value;
}

const GoLiveCard: React.FC<Props> = ({ onPress, fadeAnim, slideAnim }) => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
            <LinearGradient
                colors={['#FF2D55', '#FF6B8A', '#FF2D55']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroCard}
            >
                <View style={styles.heroDecorCircle1} />
                <View style={styles.heroDecorCircle2} />

                <View style={styles.heroContent}>
                    <View style={styles.heroIconWrap}>
                        <LivePulse />
                        <View style={styles.heroIconCircle}>
                            <Ionicons name="videocam" size={28} color="#FFF" />
                        </View>
                    </View>
                    <View style={styles.heroTextWrap}>
                        <View style={styles.heroLabelRow}>
                            <View style={styles.heroBadge}>
                                <View style={styles.heroBadgeDot} />
                                <Text style={styles.heroBadgeText}>LIVE</Text>
                            </View>
                        </View>
                        <Text style={styles.heroTitle}>Go Live</Text>
                        <Text style={styles.heroSubtitle}>Start broadcasting to your audience in real-time</Text>
                    </View>
                    <View style={styles.heroArrow}>
                        <Ionicons name="arrow-forward" size={20} color="rgba(255,255,255,0.8)" />
                    </View>
                </View>
            </LinearGradient>
        </TouchableOpacity>
    </Animated.View>
);

const styles = StyleSheet.create({
    heroCard: {
        borderRadius: 24,
        padding: 22,
        marginBottom: 14,
        overflow: 'hidden',
        minHeight: 130,
        justifyContent: 'center',
    },
    heroDecorCircle1: {
        position: 'absolute', top: -30, right: -30,
        width: 120, height: 120, borderRadius: 60,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    heroDecorCircle2: {
        position: 'absolute', bottom: -20, left: -20,
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    heroContent: { flexDirection: 'row', alignItems: 'center' },
    heroIconWrap: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
    heroIconCircle: {
        width: 56, height: 56, borderRadius: 28,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    },
    heroTextWrap: { flex: 1 },
    heroLabelRow: { flexDirection: 'row', marginBottom: 4 },
    heroBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 4,
    },
    heroBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
    heroBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
    heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '800', marginBottom: 4 },
    heroSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '400', lineHeight: 18 },
    heroArrow: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: 'rgba(255,255,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
    },
});

export default GoLiveCard;
