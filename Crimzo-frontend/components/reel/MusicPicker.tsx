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
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, resolveMediaUrl } from '../../lib/apiClient';
import { playReelMusic, stopReelMusic } from '../../lib/reelMusicPlayer';
import { reelStudioColors } from './reelStudioTheme';
import type { ReelSound, SoundLanguage } from '../../lib/reelTypes';

type TabId = 'trending' | 'browse';

type Props = {
  visible: boolean;
  token?: string | null;
  selectedId?: string | null;
  musicFirstMode?: boolean;
  onClose: () => void;
  onSelect: (sound: ReelSound | null) => void;
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

async function resolvePreviewUrl(sound: ReelSound, token?: string | null) {
  let previewUrl = resolveMediaUrl(sound.audio_url);
  if (sound.source === 'audius' && sound.external_id && token) {
    try {
      const resolved = await apiGet<{ audio_url?: string }>(
        `/api/sounds/resolve/audius/${sound.external_id}`,
        token,
      );
      if (resolved.audio_url) previewUrl = resolveMediaUrl(resolved.audio_url);
    } catch {
      // fallback
    }
  }
  return previewUrl;
}

export default function MusicPicker({
  visible,
  token,
  selectedId,
  musicFirstMode,
  onClose,
  onSelect,
}: Props) {
  const insets = useSafeAreaInsets();
  const [sounds, setSounds] = useState<ReelSound[]>([]);
  const [languages, setLanguages] = useState<SoundLanguage[]>(FALLBACK_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('trending');
  const [language, setLanguage] = useState('all');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const stopPreview = useCallback(async () => {
    await stopReelMusic();
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
    void stopPreview();
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
      const previewUrl = await resolvePreviewUrl(sound, token);
      setPreviewId(sound.id);
      await playReelMusic({
        url: previewUrl,
        loop: false,
        volume: 0.95,
        onFinish: () => setPreviewId(null),
      });
    } catch (e) {
      console.error('Preview sound error:', e);
      setPreviewId(null);
    }
  };

  const handleSelect = async (sound: ReelSound | null) => {
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
      <Pressable
        style={[styles.soundCard, selected && styles.soundCardSelected, playing && styles.soundCardPlaying]}
        onPress={() => void handleSelect(item)}
      >
        <View style={styles.soundCardLeft}>
          {item.cover_url ? (
            <Image source={{ uri: resolveMediaUrl(item.cover_url) }} style={styles.coverArt} />
          ) : (
            <LinearGradient colors={['#FF2D55', '#9333EA']} style={styles.coverFallback}>
              <Ionicons name="musical-notes" size={20} color="#FFF" />
            </LinearGradient>
          )}
          {playing && (
            <View style={styles.playingDot}>
              <Ionicons name="volume-high" size={12} color="#FFF" />
            </View>
          )}
        </View>

        <View style={styles.soundMeta}>
          <View style={styles.titleRow}>
            <Text style={styles.soundTitle} numberOfLines={1}>{item.title}</Text>
            {item.is_trending && (
              <View style={styles.trendingBadge}>
                <Text style={styles.trendingBadgeText}>Hot</Text>
              </View>
            )}
          </View>
          <Text style={styles.soundArtist} numberOfLines={1}>
            {item.artist}
          </Text>
          <Text style={styles.soundMetaLine} numberOfLines={1}>
            {formatDuration(item.duration_ms)}
            {item.language && item.language !== 'all' ? ` · ${languageLabel(item.language, languages)}` : ''}
            {(item.reels_count || 0) > 0 ? ` · ${item.reels_count} reels` : ''}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.previewBtn, playing && styles.previewBtnActive]}
          onPress={(e) => {
            e.stopPropagation?.();
            void playPreview(item);
          }}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={16} color="#FFF" />
        </TouchableOpacity>

        {selected ? (
          <View style={styles.selectedBadge}>
            <Ionicons name="checkmark" size={14} color="#FFF" />
          </View>
        ) : (
          <View style={styles.useBadge}>
            <Text style={styles.useBadgeText}>
              {musicFirstMode ? 'Record' : 'Use'}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>

        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              {musicFirstMode ? 'Step 1 · Choose Music' : 'Choose Music'}
            </Text>
            {musicFirstMode && (
              <Text style={styles.headerSub}>Then record your reel to this song</Text>
            )}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={[styles.quickCard, !selectedId && styles.quickCardActive]}
            onPress={() => void handleSelect(null)}
            activeOpacity={0.85}
          >
            <View style={[styles.quickIcon, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Ionicons name="volume-mute" size={20} color="#FFF" />
            </View>
            <View style={styles.quickTextWrap}>
              <Text style={styles.quickTitle}>No Music</Text>
              <Text style={styles.quickSub}>Only original video sound</Text>
            </View>
            {!selectedId && <Ionicons name="checkmark-circle" size={22} color={reelStudioColors.primary} />}
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color={reelStudioColors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search songs, artists..."
            placeholderTextColor={reelStudioColors.textSubtle}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={reelStudioColors.textSubtle} />
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
                {t === 'trending' ? 'Trending' : 'Browse'}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={18} color="#FFF" />
          </TouchableOpacity>
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
            <ActivityIndicator size="large" color={reelStudioColors.primary} />
            <Text style={styles.loadingHint}>Finding songs...</Text>
          </View>
        ) : (
          <FlatList
            data={sounds}
            keyExtractor={(item) => item.id}
            renderItem={renderSound}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={reelStudioColors.primary} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {query ? 'No songs found. Try another search.' : 'No songs here yet.'}
              </Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    maxHeight: '88%',
    minHeight: '72%',
    backgroundColor: '#12121A',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: reelStudioColors.border,
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  headerSub: { color: reelStudioColors.textMuted, fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActions: { paddingHorizontal: 16, marginBottom: 12 },
  quickCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: reelStudioColors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  quickCardActive: {
    borderColor: reelStudioColors.primary,
    backgroundColor: reelStudioColors.primarySoft,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickTextWrap: { flex: 1 },
  quickTitle: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  quickSub: { color: reelStudioColors.textMuted, fontSize: 12, marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: reelStudioColors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 15 },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  mainTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
  },
  mainTabActive: {
    backgroundColor: reelStudioColors.primarySoft,
    borderWidth: 1,
    borderColor: reelStudioColors.primary,
  },
  mainTabText: { color: reelStudioColors.textMuted, fontSize: 13, fontWeight: '700' },
  mainTabTextActive: { color: '#FFF' },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  langChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: reelStudioColors.surface,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  langChipActive: { backgroundColor: reelStudioColors.primary, borderColor: reelStudioColors.primary },
  langChipText: { color: reelStudioColors.textMuted, fontSize: 13, fontWeight: '600' },
  langChipTextActive: { color: '#FFF' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 120 },
  loadingHint: { color: reelStudioColors.textMuted, fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 20, gap: 8 },
  emptyText: {
    color: reelStudioColors.textMuted,
    textAlign: 'center',
    marginTop: 32,
    fontSize: 14,
    paddingHorizontal: 24,
  },
  soundCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: reelStudioColors.surface,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  soundCardSelected: {
    borderColor: reelStudioColors.primary,
    backgroundColor: reelStudioColors.primarySoft,
  },
  soundCardPlaying: {
    borderColor: 'rgba(255,45,85,0.55)',
  },
  soundCardLeft: { position: 'relative' },
  coverArt: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#1a1a1a' },
  coverFallback: {
    width: 52,
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingDot: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: reelStudioColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#12121A',
  },
  soundMeta: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  soundTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  trendingBadge: {
    backgroundColor: 'rgba(255,45,85,0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendingBadgeText: { color: reelStudioColors.primary, fontSize: 10, fontWeight: '700' },
  soundArtist: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 2, fontWeight: '500' },
  soundMetaLine: { color: reelStudioColors.textMuted, fontSize: 11, marginTop: 3 },
  previewBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnActive: { backgroundColor: reelStudioColors.primary },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: reelStudioColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  useBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  useBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
});