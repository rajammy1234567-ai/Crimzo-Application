import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { apiGet, resolveMediaUrl } from '../../lib/apiClient';
import type { ReelSound } from '../../lib/reelTypes';

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'trending', label: 'Trending' },
  { id: 'pop', label: 'Pop' },
  { id: 'hiphop', label: 'Hip Hop' },
  { id: 'chill', label: 'Chill' },
  { id: 'dance', label: 'Dance' },
];

type Props = {
  visible: boolean;
  token?: string | null;
  selectedId?: string | null;
  onClose: () => void;
  onSelect: (sound: ReelSound) => void;
};

function formatDuration(ms: number) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export default function MusicPicker({ visible, token, selectedId, onClose, onSelect }: Props) {
  const [sounds, setSounds] = useState<ReelSound[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);

  const stopPreview = useCallback(async () => {
    if (previewSoundRef.current) {
      try {
        await previewSoundRef.current.stopAsync();
        await previewSoundRef.current.unloadAsync();
      } catch {
        // ignore
      }
      previewSoundRef.current = null;
    }
    setPreviewId(null);
  }, []);

  const fetchSounds = useCallback(async (search: string, cat: string) => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (cat !== 'all') params.set('category', cat);
      params.set('limit', '40');
      const data = await apiGet<{ sounds: ReelSound[] }>(`/api/sounds?${params.toString()}`, token);
      setSounds(data.sounds || []);
    } catch (e) {
      console.error('Fetch sounds error:', e);
      setSounds([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!visible) {
      void stopPreview();
      setQuery('');
      setCategory('all');
      return;
    }
    void fetchSounds('', 'all');
  }, [visible, fetchSounds, stopPreview]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      void fetchSounds(query, category);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, category, visible, fetchSounds]);

  const playPreview = async (sound: ReelSound) => {
    if (previewId === sound.id) {
      await stopPreview();
      return;
    }
    await stopPreview();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: player } = await Audio.Sound.createAsync(
        { uri: resolveMediaUrl(sound.audio_url) },
        { shouldPlay: true, isLooping: false, volume: 0.9 },
      );
      previewSoundRef.current = player;
      setPreviewId(sound.id);
      player.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          void stopPreview();
        }
      });
    } catch (e) {
      console.error('Preview sound error:', e);
    }
  };

  const handleSelect = async (sound: ReelSound) => {
    await stopPreview();
    onSelect(sound);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Add Music</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.45)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs or artists"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <FlatList
          horizontal
          data={CATEGORIES}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.categoryChip, category === item.id && styles.categoryChipActive]}
              onPress={() => setCategory(item.id)}
            >
              <Text style={[styles.categoryText, category === item.id && styles.categoryTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#9333EA" />
          </View>
        ) : (
          <FlatList
            data={sounds}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No songs found. Try another search.</Text>
            }
            renderItem={({ item }) => {
              const selected = selectedId === item.id;
              const playing = previewId === item.id;
              return (
                <TouchableOpacity
                  style={[styles.soundRow, selected && styles.soundRowSelected]}
                  onPress={() => void handleSelect(item)}
                  activeOpacity={0.85}
                >
                  <View style={styles.soundIcon}>
                    <Ionicons name="musical-notes" size={20} color="#9333EA" />
                  </View>
                  <View style={styles.soundMeta}>
                    <Text style={styles.soundTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.soundArtist} numberOfLines={1}>
                      {item.artist} · {formatDuration(item.duration_ms)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.previewBtn}
                    onPress={() => void playPreview(item)}
                  >
                    <Ionicons
                      name={playing ? 'pause' : 'play'}
                      size={18}
                      color="#FFF"
                    />
                  </TouchableOpacity>
                  {selected && <Ionicons name="checkmark-circle" size={22} color="#9333EA" />}
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F', paddingTop: 52 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  iconBtn: { width: 40, alignItems: 'center' },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 15 },
  categoryRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  categoryChipActive: { backgroundColor: '#9333EA' },
  categoryText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
  categoryTextActive: { color: '#FFF' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  soundRowSelected: { backgroundColor: 'rgba(147,51,234,0.08)', borderRadius: 12 },
  soundIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(147,51,234,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundMeta: { flex: 1 },
  soundTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  soundArtist: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  previewBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});