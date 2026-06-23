import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { normalizeStoryUserId } from '../../lib/storyUtils';

interface StoryGroup {
    user_id: string | number | { _id?: string; id?: string };
    username: string;
    avatar: string | null;
    stories: any[];
}

interface Props {
    storyGroups: StoryGroup[];
    currentUserId: string;
    currentUserAvatar: string | null;
    hasOwnStory: boolean;
    onAddStory: () => void;
    onOpenStoryViewer: (index: number) => void;
    viewedUserIds?: Set<string>;
}

const StoriesRow: React.FC<Props> = ({
    storyGroups, currentUserId, currentUserAvatar,
    hasOwnStory, onAddStory, onOpenStoryViewer, viewedUserIds,
}) => {
    const isViewed = (userId: unknown) => {
        const key = normalizeStoryUserId(userId);
        return key ? (viewedUserIds?.has(key) ?? false) : false;
    };

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={s.row}
        >
            {/* Your Story */}
            <TouchableOpacity
                style={s.item}
                onPress={hasOwnStory ? () => onOpenStoryViewer(0) : onAddStory}
                onLongPress={onAddStory}
                activeOpacity={0.7}
            >
                <View>
                    {hasOwnStory ? (
                        <LinearGradient
                            colors={isViewed(currentUserId) ? ['#444', '#555'] : ['#DE0046', '#F7A34B']}
                            style={s.ringStory}
                        >
                            <View style={s.avatarInner}>
                                {currentUserAvatar ? (
                                    <Image source={{ uri: currentUserAvatar }} style={s.avatar} />
                                ) : (
                                    <View style={[s.avatar, s.avatarPH]}>
                                        <Ionicons name="person" size={20} color="#666" />
                                    </View>
                                )}
                            </View>
                        </LinearGradient>
                    ) : (
                        <View style={s.ringAdd}>
                            <View style={s.avatarInner}>
                                {currentUserAvatar ? (
                                    <Image source={{ uri: currentUserAvatar }} style={s.avatar} />
                                ) : (
                                    <View style={[s.avatar, s.avatarPH]}>
                                        <Ionicons name="person" size={20} color="#666" />
                                    </View>
                                )}
                            </View>
                        </View>
                    )}
                    {/* + badge */}
                    {!hasOwnStory && (
                        <View style={s.addBadge}>
                            <Ionicons name="add" size={14} color="#FFF" />
                        </View>
                    )}
                </View>
                <Text style={s.name} numberOfLines={1}>Your story</Text>
            </TouchableOpacity>

            {/* Other stories */}
            {storyGroups.map((group, index) => {
                const groupUserId = normalizeStoryUserId(group.user_id);
                if (!groupUserId || groupUserId === currentUserId) return null;
                const seen = isViewed(groupUserId);
                return (
                    <TouchableOpacity
                        key={groupUserId}
                        style={s.item}
                        onPress={() => onOpenStoryViewer(index)}
                        activeOpacity={0.7}
                    >
                        {seen ? (
                            <View style={s.ringSeen}>
                                <View style={s.avatarInner}>
                                    {group.avatar ? (
                                        <Image source={{ uri: group.avatar }} style={s.avatar} />
                                    ) : (
                                        <View style={[s.avatar, s.avatarPH]}>
                                            <Ionicons name="person" size={20} color="#999" />
                                        </View>
                                    )}
                                </View>
                            </View>
                        ) : (
                            <LinearGradient
                                colors={['#DE0046', '#F7A34B']}
                                style={s.ringStory}
                            >
                                <View style={s.avatarInner}>
                                    {group.avatar ? (
                                        <Image source={{ uri: group.avatar }} style={s.avatar} />
                                    ) : (
                                        <View style={[s.avatar, s.avatarPH]}>
                                            <Ionicons name="person" size={20} color="#999" />
                                        </View>
                                    )}
                                </View>
                            </LinearGradient>
                        )}
                        <Text style={[s.name, seen && s.nameSeen]} numberOfLines={1}>{group.username}</Text>
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
};

const STORY_SIZE = 64;
const AVATAR_SIZE = 56;

const s = StyleSheet.create({
    row: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
    item: { alignItems: 'center', width: 70, position: 'relative' },
    ringAdd: {
        width: STORY_SIZE, height: STORY_SIZE, borderRadius: STORY_SIZE / 2,
        borderWidth: 1.5, borderColor: '#333',
        alignItems: 'center', justifyContent: 'center',
    },
    ringStory: {
        width: STORY_SIZE, height: STORY_SIZE, borderRadius: STORY_SIZE / 2,
        alignItems: 'center', justifyContent: 'center', padding: 2,
    },
    ringSeen: {
        width: STORY_SIZE, height: STORY_SIZE, borderRadius: STORY_SIZE / 2,
        borderWidth: 1.5, borderColor: '#444',
        alignItems: 'center', justifyContent: 'center',
    },
    avatarInner: {
        width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, overflow: 'hidden',
        backgroundColor: '#000', alignItems: 'center', justifyContent: 'center',
        borderWidth: 2, borderColor: '#000',
    },
    avatar: { width: AVATAR_SIZE - 4, height: AVATAR_SIZE - 4, borderRadius: (AVATAR_SIZE - 4) / 2 },
    avatarPH: { backgroundColor: '#1C1C1E', alignItems: 'center', justifyContent: 'center' },
    addBadge: {
        position: 'absolute', bottom: 0, right: 0,
        width: 22, height: 22, borderRadius: 11,
        backgroundColor: '#FF2D55', alignItems: 'center', justifyContent: 'center',
        borderWidth: 2.5, borderColor: '#06060F', zIndex: 5,
    },
    name: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '600', marginTop: 7, textAlign: 'center', width: 70 },
    nameSeen: { color: 'rgba(255,255,255,0.4)' },
});

export default StoriesRow;
