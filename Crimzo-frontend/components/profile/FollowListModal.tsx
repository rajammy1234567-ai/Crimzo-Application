import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveMediaUrl } from '../../lib/apiClient';

export type FollowUser = {
  id: string;
  username: string;
  avatar?: string | null;
  bio?: string;
  is_online?: boolean;
  is_following?: boolean;
  is_requested?: boolean;
};

type Props = {
  visible: boolean;
  type: 'followers' | 'following' | 'friends';
  data: FollowUser[];
  loading: boolean;
  currentUserId?: string | number | null;
  onClose: () => void;
  onToggleFollow: (userId: string, index: number) => void;
  onOpenProfile: (userId: string) => void;
};

export default function FollowListModal({
  visible,
  type,
  data,
  loading,
  currentUserId,
  onClose,
  onToggleFollow,
  onOpenProfile,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          <View style={s.header}>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={s.headerTitle}>
              {type === 'followers' ? 'Followers' : type === 'friends' ? 'Friends' : 'Following'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator size="large" color="#FF2D55" />
            </View>
          ) : data.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="people-outline" size={60} color="#333" />
              <Text style={s.emptyText}>
                No {type === 'followers' ? 'followers' : type === 'friends' ? 'friends' : 'following'} yet
              </Text>
            </View>
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={{ paddingBottom: 40 }}
              renderItem={({ item, index }) => {
                const isSelf = String(item.id) === String(currentUserId);
                return (
                  <TouchableOpacity
                    style={s.userRow}
                    activeOpacity={0.75}
                    onPress={() => onOpenProfile(String(item.id))}
                  >
                    <View style={s.userLeft}>
                      {item.avatar ? (
                        <Image
                          source={{ uri: resolveMediaUrl(item.avatar) }}
                          style={s.userAvatar}
                        />
                      ) : (
                        <View style={[s.userAvatar, s.avatarPH]}>
                          <Ionicons name="person" size={20} color="#999" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={s.nameRow}>
                          <Text style={s.userName}>{item.username}</Text>
                          {item.is_online && <View style={s.onlineDot} />}
                        </View>
                        {item.bio ? (
                          <Text style={s.userBio} numberOfLines={1}>{item.bio}</Text>
                        ) : null}
                      </View>
                    </View>
                    {!isSelf && type !== 'friends' && (
                      <TouchableOpacity
                        style={[
                          s.followBtn,
                          (item.is_following || item.is_requested) && s.followingBtn,
                        ]}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onToggleFollow(String(item.id), index);
                        }}
                      >
                        <Text style={[s.followBtnText, (item.is_following || item.is_requested) && s.followingText]}>
                          {item.is_following
                            ? 'Following'
                            : item.is_requested
                              ? 'Requested'
                              : type === 'followers'
                                ? 'Follow back'
                                : 'Follow'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#111',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    minHeight: '55%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyText: { color: '#666', fontSize: 15 },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  userLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  userAvatar: { width: 48, height: 48, borderRadius: 24 },
  avatarPH: {
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#30D158' },
  userBio: { color: '#888', fontSize: 13, marginTop: 2 },
  followBtn: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    marginLeft: 8,
  },
  followingBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  followBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  followingText: { color: '#CCC' },
});