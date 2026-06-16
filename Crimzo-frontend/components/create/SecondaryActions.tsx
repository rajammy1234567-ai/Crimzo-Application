import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
    onPKBattle: () => void;
    onUploadReel: () => void;
    fadeAnims: Animated.Value[];
    slideAnims: Animated.Value[];
}

const SecondaryActions: React.FC<Props> = ({ onPKBattle, onUploadReel, fadeAnims, slideAnims }) => (
    <View style={styles.secondaryRow}>
        {/* PK Battle */}
        <Animated.View style={[styles.secondaryCardWrap, { opacity: fadeAnims[0], transform: [{ translateY: slideAnims[0] }] }]}>
            <TouchableOpacity activeOpacity={0.85} onPress={onPKBattle} style={styles.secondaryCardTouch}>
                <View style={styles.secondaryCard}>
                    <LinearGradient
                        colors={['rgba(255,149,0,0.15)', 'rgba(255,149,0,0.05)']}
                        style={styles.secondaryGradBg}
                    />
                    <View style={styles.secondaryIconWrap}>
                        <LinearGradient
                            colors={['#FF9500', '#FFCC00']}
                            style={styles.secondaryIconCircle}
                        >
                            <Ionicons name="flash" size={22} color="#FFF" />
                        </LinearGradient>
                    </View>
                    <Text style={styles.secondaryTitle}>PK Battle</Text>
                    <Text style={styles.secondarySubtitle}>Challenge a broadcaster</Text>
                    <View style={styles.secondaryArrowRow}>
                        <Text style={styles.secondaryAction}>Start</Text>
                        <Ionicons name="arrow-forward" size={14} color="#FF9500" />
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>

        {/* Upload Reel */}
        <Animated.View style={[styles.secondaryCardWrap, { opacity: fadeAnims[1], transform: [{ translateY: slideAnims[1] }] }]}>
            <TouchableOpacity activeOpacity={0.85} onPress={onUploadReel} style={styles.secondaryCardTouch}>
                <View style={styles.secondaryCard}>
                    <LinearGradient
                        colors={['rgba(48,209,88,0.15)', 'rgba(48,209,88,0.05)']}
                        style={styles.secondaryGradBg}
                    />
                    <View style={styles.secondaryIconWrap}>
                        <LinearGradient
                            colors={['#30D158', '#34D399']}
                            style={styles.secondaryIconCircle}
                        >
                            <Ionicons name="film" size={22} color="#FFF" />
                        </LinearGradient>
                    </View>
                    <Text style={styles.secondaryTitle}>Upload Reel</Text>
                    <Text style={styles.secondarySubtitle}>Share a short video</Text>
                    <View style={styles.secondaryArrowRow}>
                        <Text style={[styles.secondaryAction, { color: '#30D158' }]}>Upload</Text>
                        <Ionicons name="arrow-forward" size={14} color="#30D158" />
                    </View>
                </View>
            </TouchableOpacity>
        </Animated.View>
    </View>
);

const styles = StyleSheet.create({
    secondaryRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
    secondaryCardWrap: { flex: 1 },
    secondaryCardTouch: { flex: 1 },
    secondaryCard: {
        backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20,
        padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
        overflow: 'hidden', minHeight: 170, justifyContent: 'space-between',
    },
    secondaryGradBg: { ...StyleSheet.absoluteFillObject, borderRadius: 20 },
    secondaryIconWrap: { marginBottom: 14 },
    secondaryIconCircle: {
        width: 46, height: 46, borderRadius: 23,
        alignItems: 'center', justifyContent: 'center',
        shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3,
        shadowRadius: 8, elevation: 6,
    },
    secondaryTitle: { color: '#FFF', fontSize: 17, fontWeight: '800', marginBottom: 4 },
    secondarySubtitle: {
        color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '400',
        lineHeight: 16, marginBottom: 12,
    },
    secondaryArrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    secondaryAction: { color: '#FF9500', fontSize: 13, fontWeight: '700' },
});

export default SecondaryActions;
