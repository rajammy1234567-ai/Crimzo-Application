import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
    onUploadPhoto: () => void;
    onUploadVideo: () => void;
    fadeAnim: Animated.Value;
    slideAnim: Animated.Value;
}

const StoryCard: React.FC<Props> = ({ onUploadPhoto, onUploadVideo, fadeAnim, slideAnim }) => (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <TouchableOpacity activeOpacity={0.85} onPress={onUploadPhoto}>
            <LinearGradient
                colors={['#7B2FFF', '#9B59FF', '#C084FC']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.storyCard}
            >
                <View style={styles.storyDecorCircle} />

                <View style={styles.storyContent}>
                    <View style={styles.storyLeft}>
                        <View style={styles.storyIconCircle}>
                            <Ionicons name="add-circle" size={26} color="#FFF" />
                        </View>
                        <View style={styles.storyTextWrap}>
                            <View style={styles.storyLabelRow}>
                                <View style={styles.storyBadge}>
                                    <Ionicons name="time-outline" size={10} color="#E9D5FF" />
                                    <Text style={styles.storyBadgeText}>24 HRS</Text>
                                </View>
                            </View>
                            <Text style={styles.storyTitle}>Upload Story</Text>
                            <Text style={styles.storySubtitle}>Share moments that disappear in 24 hours</Text>
                        </View>
                    </View>
                    <View style={styles.storyArrow}>
                        <Ionicons name="arrow-forward" size={18} color="rgba(255,255,255,0.7)" />
                    </View>
                </View>

                {/* Story type options */}
                <View style={styles.storyTypes}>
                    <TouchableOpacity style={styles.storyTypeBtn} activeOpacity={0.7} onPress={onUploadPhoto}>
                        <View style={styles.storyTypeIcon}>
                            <Ionicons name="image" size={16} color="#E9D5FF" />
                        </View>
                        <Text style={styles.storyTypeText}>Photo</Text>
                    </TouchableOpacity>
                    <View style={styles.storyTypeDivider} />
                    <TouchableOpacity style={styles.storyTypeBtn} activeOpacity={0.7} onPress={onUploadVideo}>
                        <View style={styles.storyTypeIcon}>
                            <Ionicons name="videocam-outline" size={16} color="#E9D5FF" />
                        </View>
                        <Text style={styles.storyTypeText}>Video</Text>
                    </TouchableOpacity>
                    <View style={styles.storyTypeDivider} />
                    <TouchableOpacity style={styles.storyTypeBtn} activeOpacity={0.7} onPress={onUploadPhoto}>
                        <View style={styles.storyTypeIcon}>
                            <Ionicons name="text" size={16} color="#E9D5FF" />
                        </View>
                        <Text style={styles.storyTypeText}>Text</Text>
                    </TouchableOpacity>
                </View>
            </LinearGradient>
        </TouchableOpacity>
    </Animated.View>
);

const styles = StyleSheet.create({
    storyCard: { borderRadius: 22, padding: 18, marginBottom: 14, overflow: 'hidden' },
    storyDecorCircle: {
        position: 'absolute', top: -25, right: -25,
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: 'rgba(255,255,255,0.06)',
    },
    storyContent: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
    storyLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    storyIconCircle: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.18)',
        alignItems: 'center', justifyContent: 'center',
        marginRight: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
    },
    storyTextWrap: { flex: 1 },
    storyLabelRow: { flexDirection: 'row', marginBottom: 3 },
    storyBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
        paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, gap: 3,
    },
    storyBadgeText: { color: '#E9D5FF', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
    storyTitle: { color: '#FFF', fontSize: 19, fontWeight: '800', marginBottom: 2 },
    storySubtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '400', lineHeight: 16 },
    storyArrow: {
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.12)',
        alignItems: 'center', justifyContent: 'center',
    },
    storyTypes: {
        flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.2)',
        borderRadius: 14, padding: 4,
    },
    storyTypeBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center',
        justifyContent: 'center', paddingVertical: 10, gap: 6, borderRadius: 10,
    },
    storyTypeDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 6 },
    storyTypeIcon: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center',
    },
    storyTypeText: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700' },
});

export default StoryCard;
