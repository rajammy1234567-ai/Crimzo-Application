import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    Modal,
    Dimensions,
    StatusBar,
    Animated,
    Easing,
    ActivityIndicator,
    PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { normalizeStoryUserId } from '../lib/storyUtils';

const { width: SW, height: SH } = Dimensions.get('window');
const STORY_DURATION = 5000; // 5 seconds per photo story

interface Story {
    id: number;
    media_url: string;
    media_type: 'photo' | 'video';
    caption: string;
    created_at: string;
    expires_at: string;
}

interface StoryGroup {
    user_id: string | number | { _id?: string; id?: string };
    username: string;
    avatar: string | null;
    stories: Story[];
}

interface Props {
    visible: boolean;
    storyGroups: StoryGroup[];
    initialGroupIndex: number;
    currentUserId: string;
    onClose: () => void;
    onDeleteStory?: (storyId: number) => void;
    onGroupChange?: (userId: string) => void;
}

function getTimeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}

function useCurrentTime() {
    const [, setTick] = React.useState(0);
    useEffect(() => {
        const iv = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(iv);
    }, []);
}

export default function StoryViewer({ visible, storyGroups, initialGroupIndex, currentUserId, onClose, onDeleteStory, onGroupChange }: Props) {
    const insets = useSafeAreaInsets();
    useCurrentTime(); // triggers re-render every 30s to update timeAgo
    const [groupIndex, setGroupIndex] = useState(initialGroupIndex);
    const [storyIndex, setStoryIndex] = useState(0);
    const [paused, setPaused] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);
    const progressAnim = useRef(new Animated.Value(0)).current;
    const progressAnimation = useRef<Animated.CompositeAnimation | null>(null);
    const videoRef = useRef<Video>(null);

    const currentGroup = storyGroups[groupIndex];
    const currentStory = currentGroup?.stories?.[storyIndex];
    const isOwn = normalizeStoryUserId(currentGroup?.user_id) === currentUserId;

    // Reset when opening or changing initial group
    useEffect(() => {
        if (visible) {
            setGroupIndex(initialGroupIndex);
            setStoryIndex(0);
            setPaused(false);
        }
    }, [visible, initialGroupIndex]);

    // Mark only the currently visible user's story ring as viewed
    useEffect(() => {
        if (!visible || !currentGroup || !onGroupChange) return;
        const ownerId = normalizeStoryUserId(currentGroup.user_id);
        if (ownerId) onGroupChange(ownerId);
    }, [visible, groupIndex, currentGroup?.user_id, onGroupChange]);

    // Animate progress bar
    useEffect(() => {
        if (!visible || !currentStory || paused) return;

        progressAnim.setValue(0);
        const duration = currentStory.media_type === 'video' ? 15000 : STORY_DURATION;

        const anim = Animated.timing(progressAnim, {
            toValue: 1,
            duration,
            easing: Easing.linear,
            useNativeDriver: false,
        });
        progressAnimation.current = anim;

        anim.start(({ finished }) => {
            if (finished) {
                goNext();
            }
        });

        return () => {
            anim.stop();
        };
    }, [visible, groupIndex, storyIndex, paused, imageLoading]);

    const goNext = useCallback(() => {
        if (!currentGroup) return;
        if (storyIndex < currentGroup.stories.length - 1) {
            setStoryIndex(storyIndex + 1);
            setImageLoading(true);
        } else if (groupIndex < storyGroups.length - 1) {
            setGroupIndex(groupIndex + 1);
            setStoryIndex(0);
            setImageLoading(true);
        } else {
            onClose();
        }
    }, [storyIndex, groupIndex, currentGroup, storyGroups.length, onClose]);

    const goPrev = useCallback(() => {
        if (storyIndex > 0) {
            setStoryIndex(storyIndex - 1);
            setImageLoading(true);
        } else if (groupIndex > 0) {
            setGroupIndex(groupIndex - 1);
            const prevGroup = storyGroups[groupIndex - 1];
            setStoryIndex(prevGroup.stories.length - 1);
            setImageLoading(true);
        }
    }, [storyIndex, groupIndex, storyGroups]);

    const handlePress = useCallback((evt: any) => {
        const x = evt.nativeEvent.locationX;
        if (x < SW * 0.35) {
            goPrev();
        } else {
            goNext();
        }
    }, [goPrev, goNext]);

    // Swipe down to close
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dy) > 20 && Math.abs(gs.dy) > Math.abs(gs.dx),
            onPanResponderRelease: (_, gs) => {
                if (gs.dy > 80) {
                    onClose();
                }
            },
        })
    ).current;

    const handleDelete = useCallback(() => {
        if (currentStory && onDeleteStory) {
            onDeleteStory(currentStory.id);
            // Move to next story or close
            if (currentGroup.stories.length <= 1) {
                onClose();
            } else {
                goNext();
            }
        }
    }, [currentStory, onDeleteStory, currentGroup, goNext, onClose]);

    if (!visible || !currentGroup || !currentStory) return null;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <View style={styles.container} {...panResponder.panHandlers}>
                {/* ── Media Background ── */}
                <TouchableOpacity
                    activeOpacity={1}
                    onPress={handlePress}
                    onLongPress={() => setPaused(true)}
                    onPressOut={() => setPaused(false)}
                    style={StyleSheet.absoluteFill}
                >
                    {currentStory.media_type === 'video' ? (
                        <Video
                            ref={videoRef}
                            source={{ uri: currentStory.media_url }}
                            style={styles.media}
                            resizeMode={ResizeMode.CONTAIN}
                            shouldPlay={!paused}
                            isLooping={false}
                            onPlaybackStatusUpdate={(status: any) => {
                                if (status.didJustFinish) goNext();
                            }}
                            onLoad={() => setImageLoading(false)}
                        />
                    ) : (
                        <Image
                            source={{ uri: currentStory.media_url }}
                            style={styles.media}
                            resizeMode="contain"
                            onLoadEnd={() => setImageLoading(false)}
                        />
                    )}
                </TouchableOpacity>

                {imageLoading && (
                    <View style={styles.loaderOverlay}>
                        <ActivityIndicator size="large" color="#FF2D55" />
                    </View>
                )}

                {/* ── Progress Bars ── */}
                <View style={[styles.progressRow, { top: insets.top + 8 }]}>
                    {currentGroup.stories.map((_, i) => (
                        <View key={i} style={styles.progressTrack}>
                            <Animated.View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: i < storyIndex
                                            ? '100%'
                                            : i === storyIndex
                                                ? progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                                                : '0%',
                                    },
                                ]}
                            />
                        </View>
                    ))}
                </View>

                {/* ── Header ── */}
                <View style={[styles.header, { top: insets.top + 20 }]}>
                    <View style={styles.userRow}>
                        <View style={styles.avatar}>
                            {currentGroup.avatar ? (
                                <Image source={{ uri: currentGroup.avatar }} style={styles.avatarImg} />
                            ) : (
                                <Text style={styles.avatarText}>{(currentGroup.username || 'U').charAt(0).toUpperCase()}</Text>
                            )}
                        </View>
                        <View>
                            <Text style={styles.username}>{currentGroup.username}</Text>
                            <Text style={styles.timeAgo}>{getTimeAgo(currentStory.created_at)}</Text>
                        </View>
                    </View>
                    <View style={styles.headerRight}>
                        {isOwn && (
                            <TouchableOpacity onPress={handleDelete} style={styles.headerBtn}>
                                <Ionicons name="trash-outline" size={22} color="#FFF" />
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
                            <Ionicons name="close" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── Caption ── */}
                {currentStory.caption ? (
                    <View style={[styles.captionWrap, { bottom: insets.bottom + 24 }]}>
                        <Text style={styles.caption}>{currentStory.caption}</Text>
                    </View>
                ) : null}

                {/* Pause indicator */}
                {paused && (
                    <View style={styles.pausedOverlay}>
                        <Ionicons name="pause" size={48} color="rgba(255,255,255,0.5)" />
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    media: {
        flex: 1,
        width: SW,
        height: SH,
    },
    loaderOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },

    // Progress
    progressRow: {
        position: 'absolute',
        left: 8,
        right: 8,
        flexDirection: 'row',
        gap: 4,
        zIndex: 30,
    },
    progressTrack: {
        flex: 1,
        height: 2.5,
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#FFF',
        borderRadius: 2,
    },

    // Header
    header: {
        position: 'absolute',
        left: 12,
        right: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        zIndex: 30,
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FF2D55',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.3)',
        overflow: 'hidden',
    },
    avatarImg: {
        width: 36,
        height: 36,
        borderRadius: 18,
    },
    avatarText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '800',
    },
    username: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
    },
    timeAgo: {
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        fontWeight: '500',
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    headerBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.4)',
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Caption
    captionWrap: {
        position: 'absolute',
        left: 16,
        right: 16,
        zIndex: 30,
    },
    caption: {
        color: '#FFF',
        fontSize: 15,
        fontWeight: '500',
        textShadowColor: 'rgba(0,0,0,0.7)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 4,
        lineHeight: 20,
    },

    // Pause
    pausedOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
