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
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, resolveMediaUrl } from '../../lib/apiClient';
import { appAlert } from '../../lib/appAlert';
import { playReelMusic, stopReelMusic } from '../../lib/reelMusicPlayer';
import { importSoundFromGalleryVideo } from '../../lib/reelSoundImport';
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

const RESOLVABLE_SOURCES = new Set(['audius', 'epidemic', 'soundstripe']);

async function resolvePreviewUrl(sound: ReelSound, token?: string | null) {
  let previewUrl = resolveMediaUrl(sound.audio_url);

  if (sound.external_id && RESOLVABLE_SOURCES.has(sound.source) && token) {
    try {
      const resolved = await apiGet<{ audio_url?: string }>(
        `/api/sounds/resolve/${sound.source}/${sound.external_id}`,
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
  const [importing, setImporting] = useState(false);
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

  const importFromLibrary = async () => {
    if (!token || importing) return;

    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        appAlert('Permission Required', 'Please allow gallery access to import sound from a video.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      await stopPreview();
      setImporting(true);

      const sound = await importSoundFromGalleryVideo(
        {
          uri: asset.uri,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          duration: asset.duration,
        },
        token,
        asset.fileName ? asset.fileName.replace(/\.[^.]+$/, '') : 'Imported Sound',
      );

      onSelect(sound);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not extract sound from this video.';
      appAlert('Import Failed', msg);
    } finally {
      setImporting(false);
    }
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
            {item.is_licensed && (
              <View style={styles.licensedBadge}>
                <Text style={styles.licensedBadgeText}>Licensed</Text>
              </View>
            )}
            {item.is_trending && !item.is_licensed && (
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
            <Ionicons name="checkmark" size={13} color="#FFF" />
          </View>
        ) : (
          <Ionicons name="add-circle-outline" size={20} color="rgba(255,255,255,0.35)" />
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
          <Text style={styles.title}>Music</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={[styles.quickChip, !selectedId && styles.quickChipActive]}
            onPress={() => void handleSelect(null)}
            activeOpacity={0.8}
            accessibilityLabel="No music"
          >
            <Ionicons name="volume-mute" size={16} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.quickChip, styles.quickChipImport, importing && styles.quickChipBusy]}
            onPress={() => void importFromLibrary()}
            activeOpacity={0.8}
            disabled={importing || !token}
            accessibilityLabel="Import from library"
          >
            {importing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Ionicons name="folder-open-outline" size={16} color="#FFF" />
            )}
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
              accessibilityLabel={t === 'trending' ? 'Trending' : 'Browse'}
            >
              <Ionicons
                name={t === 'trending' ? 'flame' : 'grid'}
                size={15}
                color={tab === t ? '#FFF' : reelStudioColors.textMuted}
              />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={15} color="#FFF" />
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
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  quickChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: reelStudioColors.surface,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickChipActive: {
    borderColor: reelStudioColors.primary,
    backgroundColor: reelStudioColors.primarySoft,
  },
  quickChipImport: {
    borderColor: 'rgba(99,102,241,0.4)',
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  quickChipBusy: { opacity: 0.6 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: reelStudioColors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 14 },
  tabRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 6,
    alignItems: 'center',
  },
  mainTab: {
    width: 34,
    height: 30,
    borderRadius: 15,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTabActive: {
    backgroundColor: reelStudioColors.primary,
  },
  refreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: reelStudioColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  languageRow: { paddingHorizontal: 16, gap: 6, paddingBottom: 8 },
  langChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: reelStudioColors.surface,
    borderWidth: 1,
    borderColor: reelStudioColors.border,
  },
  langChipActive: { backgroundColor: reelStudioColors.primary, borderColor: reelStudioColors.primary },
  langChipText: { color: reelStudioColors.textMuted, fontSize: 12, fontWeight: '600' },
  langChipTextActive: { color: '#FFF' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 120 },
  loadingHint: { color: reelStudioColors.textMuted, fontSize: 13 },
  listContent: { paddingHorizontal: 16, paddingBottom: 16, gap: 6 },
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
    gap: 8,
    backgroundColor: reelStudioColors.surface,
    borderRadius: 12,
    padding: 8,
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
  coverArt: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#1a1a1a' },
  coverFallback: {
    width: 44,
    height: 44,
    borderRadius: 8,
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
  soundTitle: { color: '#FFF', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  licensedBadge: {
    backgroundColor: 'rgba(99,102,241,0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  licensedBadgeText: { color: '#A5B4FC', fontSize: 10, fontWeight: '700' },
  trendingBadge: {
    backgroundColor: 'rgba(255,45,85,0.22)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trendingBadgeText: { color: reelStudioColors.primary, fontSize: 10, fontWeight: '700' },
  soundArtist: { color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 1, fontWeight: '500' },
  soundMetaLine: { color: reelStudioColors.textMuted, fontSize: 10, marginTop: 2 },
  previewBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnActive: { backgroundColor: reelStudioColors.primary },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: reelStudioColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});