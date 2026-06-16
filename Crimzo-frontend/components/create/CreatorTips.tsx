import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TIPS = [
    { text: 'Go live during peak hours for more viewers', color: '#FF6B8A' },
    { text: 'Stories with faces get 38% more engagement', color: '#A78BFA' },
    { text: 'Post reels consistently to grow your audience', color: '#34D399' },
];

const CreatorTips: React.FC = () => (
    <View style={styles.tipsSection}>
        <View style={styles.tipsHeader}>
            <Ionicons name="bulb-outline" size={16} color="rgba(255,215,0,0.6)" />
            <Text style={styles.tipsTitle}>Creator Tips</Text>
        </View>
        <View style={styles.tipsList}>
            {TIPS.map((tip, index) => (
                <View key={index} style={styles.tipItem}>
                    <View style={[styles.tipDot, { backgroundColor: tip.color }]} />
                    <Text style={styles.tipText}>{tip.text}</Text>
                </View>
            ))}
        </View>
    </View>
);

const styles = StyleSheet.create({
    tipsSection: {
        backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 18,
        padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    },
    tipsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
    tipsTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
    tipsList: { gap: 10 },
    tipItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    tipDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
    tipText: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '400', lineHeight: 18, flex: 1 },
});

export default CreatorTips;
