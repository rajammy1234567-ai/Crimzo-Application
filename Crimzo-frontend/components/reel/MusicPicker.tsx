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
  Image,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { apiGet, resolveMediaUrl } from '../../lib/apiClient';
import type { ReelSound, SoundLanguage } from '../../lib/reelTypes';

type TabId = 'trending' | 'browse';

type Props = {
  visible: boolean;
  token?: string | null;
  selectedId?: string | null;
  onClose: () => void;
  onSelect: (sound: ReelSound) => void;
};

const FALLBACK_LANGUAGES: SoundLanguage[] = [
  { code: 'all', label: 'All', emoji: '🌐' },
  { code: 'hindi', label: 'Hindi', emoji: '🇮🇳' },
  { code: 'english', label: 'English', emoji: '🇺🇸' },
  { code: 'punjabi', label: 'Punjabi', emoji: '🎵' },
  { code: 'tamil', label: 'Tamil', emoji: '🎶' },
  { code: 'telugu', label: 'Telugu', emoji: '🎵' },
  { code: 'bengali', label: 'Bengali', emoji: '🎶' },
  { code: 'marathi', label: 'Marathi', emoji: '🎵' },
];

function formatDuration(ms: number) {
  if (!ms) return '--:--';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function languageLabel(code: string, languages: SoundLanguage[]) {
  return languages.find((l) => l.code === code)?.label || code;
}

export default function MusicPicker({ visible, token, selectedId, onClose, onSelect }: Props) {
  const [sounds, setSounds] = useState<ReelSound[]>([]);
  const [languages, setLanguages] = useState<SoundLanguage[]>(FALLBACK_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('trending');
  const [language, setLanguage] = useState('all');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewSoundRef = useRef<Audio.Sound | null>(null);
  const requestIdRef = useRef(0);

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

  const fetchSounds = useCallback(async (opts: {
    search: string;
    activeTab: TabId;
    activeLanguage: string;
    isRefresh?: boolean;
  }) => {
    if (!token) return;

    const reqId = ++requestIdRef.current;
    if (opts.isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      params.set('tab', opts.activeTab);
      params.set('language', opts.activeLanguage);
      params.set('limit', '50');
      if (opts.search.trim()) params.set('q', opts.search.trim());

      const data = await apiGet<{
        sounds: ReelSound[];
        languages?: SoundLanguage[];
      }>(`/api/sounds/browse?${params.toString()}`, token);

      if (reqId !== requestIdRef.current) return;

      setSounds(data.sounds || []);
      if (data.languages?.length) setLanguages(data.languages);
    } catch (e) {
      console.error('Fetch sounds error:', e);
      if (reqId === requestIdRef.current) setSounds([]);
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    if (!visible) {
      void stopPreview();
      setQuery('');
      setTab('trending');
      setLanguage('all');
      return;
    }
    void fetchSounds({ search: '', activeTab: 'trending', activeLanguage: 'all' });
  }, [visible, fetchSounds, stopPreview]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      void fetchSounds({ search: query, activeTab: tab, activeLanguage: language });
    }, query ? 280 : 0);
    return () => clearTimeout(timer);
  }, [query, tab, language, visible, fetchSounds]);

  const playPreview = async (sound: ReelSound) => {
    if (previewId === sound.id) {
      await stopPreview();
      return;
    }
    await stopPreview();
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      let previewUrl = resolveMediaUrl(sound.audio_url);
      if (sound.source === 'audius' && sound.external_id && token) {
        try {
          const resolved = await apiGet<{ audio_url?: string }>(
            `/api/sounds/resolve/audius/${sound.external_id}`,
            token,
          );
          if (resolved.audio_url) previewUrl = resolveMediaUrl(resolved.audio_url);
        } catch {
          // use cached url
        }
      }
      const { sound: player } = await Audio.Sound.createAsync(
        { uri: previewUrl },
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

  const onRefresh = () => {
    void fetchSounds({ search: query, activeTab: tab, activeLanguage: language, isRefresh: true });
  };

  const renderSound = ({ item }: { item: ReelSound }) => {
    const selected = selectedId === item.id;
    const playing = previewId === item.id;

    return (
      <TouchableOpacity
        style={[styles.soundRow, selected && styles.soundRowSelected]}
        onPress={() => void handleSelect(item)}
        activeOpacity={0.85}
      >
        {item.cover_url ? (
          <Image source={{ uri: resolveMediaUrl(item.cover_url) }} style={styles.coverArt} />
        ) : (
          <View style={styles.soundIcon}>
            <Ionicons name="musical-notes" size={20} color="#9333EA" />
          </View>
        )}

        <View style={styles.soundMeta}>
          <View style={styles.titleRow}>
            <Text style={styles.soundTitle} numberOfLines={1}>{item.title}</Text>
            {item.is_trending && (
              <View style={styles.trendingBadge}>
                <Text style={styles.trendingBadgeText}>Trending</Text>
              </View>
            )}
          </View>
          <Text style={styles.soundArtist} numberOfLines={1}>
            {item.artist} · {formatDuration(item.duration_ms)}
            {item.language && item.language !== 'all' ? ` · ${languageLabel(item.language, languages)}` : ''}
          </Text>
          {(item.reels_count || 0) > 0 && (
            <Text style={styles.reelsCount}>{item.reels_count} reels</Text>
          )}
        </View>

        <TouchableOpacity style={styles.previewBtn} onPress={() => void playPreview(item)}>
          <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#FFF" />
        </TouchableOpacity>
        {selected && <Ionicons name="checkmark-circle" size={22} color="#9333EA" />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Add Music</Text>
          <TouchableOpacity onPress={onRefresh} style={styles.iconBtn}>
            <Ionicons name="refresh" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.45)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, artists, languages..."
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.35)" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.tabRow}>
          {(['trending', 'browse'] as TabId[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.mainTab, tab === t && styles.mainTabActive]}
              onPress={() => setTab(t)}
            >
              <Text style={[styles.mainTabText, tab === t && styles.mainTabTextActive]}>
                {t === 'trending' ? '🔥 Trending' : '🎵 Browse'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <FlatList
          horizontal
          data={languages}
          keyExtractor={(item) => item.code}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.languageRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.langChip, language === item.code && styles.langChipActive]}
              onPress={() => setLanguage(item.code)}
            >
              <Text style={[styles.langChipText, language === item.code && styles.langChipTextActive]}>
                {item.emoji ? `${item.emoji} ` : ''}{item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        {loading && sounds.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#9333EA" />
            <Text style={styles.loadingHint}>Loading songs in real-time...</Text>
          </View>
        ) : (
          <FlatList
            data={sounds}
            keyExtractor={(item) => item.id}
            renderItem={renderSound}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#9333EA" />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {query ? 'No songs found. Try another search or language.' : 'No songs in this category yet.'}
              </Text>
            }
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
    marginBottom: 12,
  },
  iconBtn: { width: 40, alignItems: 'center' },
  title: { color: '#FFF', fontSize: 18, fontWeight: '700' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 15 },
  tabRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  mainTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  mainTabActive: { backgroundColor: 'rgba(147,51,234,0.25)', borderWidth: 1, borderColor: '#9333EA' },
  mainTabText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '700' },
  mainTabTextActive: { color: '#FFF' },
  languageRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  langChipActive: { backgroundColor: '#9333EA' },
  langChipText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
  langChipTextActive: { color: '#FFF' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingHint: { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyText: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
    paddingHorizontal: 24,
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  soundRowSelected: { backgroundColor: 'rgba(147,51,234,0.08)', borderRadius: 12 },
  coverArt: { width: 46, height: 46, borderRadius: 8, backgroundColor: '#1a1a1a' },
  soundIcon: {
    width: 46,
    height: 46,
    borderRadius: 8,
    backgroundColor: 'rgba(147,51,234,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soundMeta: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soundTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  trendingBadge: {
    backgroundColor: 'rgba(255,45,85,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendingBadgeText: { color: '#FF2D55', fontSize: 10, fontWeight: '700' },
  soundArtist: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  reelsCount: { color: 'rgba(147,51,234,0.9)', fontSize: 11, marginTop: 2, fontWeight: '600' },
  previewBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});