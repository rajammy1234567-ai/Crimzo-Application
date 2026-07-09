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
  Animated,
  Pressable,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiGet, resolveMediaUrl, ApiError } from '../../lib/apiClient';
import { appAlert } from '../../lib/appAlert';
import { playReelMusic, stopReelMusic } from '../../lib/reelMusicPlayer';
import { importSoundFromGalleryVideo } from '../../lib/reelSoundImport';
import type { ReelSound, SoundLanguage } from '../../lib/reelTypes';
import AudioTrimmer from './AudioTrimmer';

const { height: SCREEN_H } = Dimensions.get('window');

type TabId = 'trending' | 'browse';

type Props = {
  visible: boolean;
  token?: string | null;
  selectedId?: string | null;
  musicFirstMode?: boolean;
  onClose: () => void;
  onSelect: (sound: ReelSound | null, startMs?: number) => void;
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

// Animated waveform for now-playing
function WaveformBars({ playing }: { playing: boolean }) {
  const bars = useRef(
    Array.from({ length: 5 }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (!playing) {
      bars.forEach((b) => Animated.timing(b, { toValue: 0.3, duration: 200, useNativeDriver: false }).start());
      return;
    }
    const anims = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, { toValue: 1, duration: 250 + i * 60, useNativeDriver: false }),
          Animated.timing(b, { toValue: 0.3, duration: 250 + i * 60, useNativeDriver: false }),
        ])
      )
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [playing]);

  return (
    <View style={wf.container}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={[wf.bar, { height: b.interpolate({ inputRange: [0, 1], outputRange: [4, 16] }) }]}
        />
      ))}
    </View>
  );
}

const wf = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 20 },
  bar: { width: 3, borderRadius: 2, backgroundColor: '#FF2D55' },
});

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
    } catch { /* fallback */ }
  }
  return previewUrl;
}

export default function MusicPicker({ visible, token, selectedId, musicFirstMode, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;

  const [sounds, setSounds] = useState<ReelSound[]>([]);
  const [languages, setLanguages] = useState<SoundLanguage[]>(FALLBACK_LANGUAGES);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<TabId>('trending');
  const [language, setLanguage] = useState('all');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [trimMs, setTrimMs] = useState(0);
  const [importing, setImporting] = useState(false);
  const requestIdRef = useRef(0);

  // Slide in/out animation
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 4,
        speed: 14,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const stopPreview = useCallback(async () => {
    await stopReelMusic();
    setPreviewId(null);
  }, []);

  const fetchSounds = useCallback(async (opts: {
    search: string;
    activeTab: TabId;
    activeLanguage: string;
  }) => {
    if (!token) return;
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('tab', opts.activeTab);
      params.set('language', opts.activeLanguage);
      params.set('limit', '50');
      if (opts.search.trim()) params.set('q', opts.search.trim());
      const data = await apiGet<{ sounds: ReelSound[]; languages?: SoundLanguage[] }>(
        `/api/sounds/browse?${params.toString()}`, token,
      );
      if (reqId !== requestIdRef.current) return;
      setSounds(data.sounds || []);
      if (data.languages?.length) setLanguages(data.languages);
    } catch {
      if (reqId === requestIdRef.current) setSounds([]);
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!visible) { void stopPreview(); setQuery(''); setTab('trending'); setLanguage('all'); return; }
    void stopPreview();
    void fetchSounds({ search: '', activeTab: 'trending', activeLanguage: 'all' });
  }, [visible, fetchSounds, stopPreview]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      void fetchSounds({ search: query, activeTab: tab, activeLanguage: language });
    }, query ? 300 : 0);
    return () => clearTimeout(timer);
  }, [query, tab, language, visible, fetchSounds]);

  const playPreview = async (sound: ReelSound, startMs = 0) => {
    if (previewId === sound.id && startMs === 0) { await stopPreview(); return; }
    await stopPreview();
    try {
      const url = await resolvePreviewUrl(sound, token);
      setPreviewId(sound.id);
      await playReelMusic({ url, loop: false, volume: 0.95, positionMillis: startMs, onFinish: () => setPreviewId(null) });
    } catch { setPreviewId(null); }
  };

  const handleSelect = async (sound: ReelSound | null) => {
    await stopPreview();
    onSelect(sound, trimMs);
    onClose();
  };

  const importFromLibrary = async () => {
    if (!token || importing) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        appAlert('Permission Required', 'Please allow gallery access to import sound from a video.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      await stopPreview();
      setImporting(true);
      const sound = await importSoundFromGalleryVideo(
        { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType, duration: asset.duration },
        token,
        asset.fileName ? asset.fileName.replace(/\.[^.]+$/, '') : 'Imported Sound',
      );
      onSelect(sound);
      onClose();
    } catch (e: unknown) {
      let msg = 'Could not extract sound from this video.';
      if (e instanceof ApiError) {
        msg = e.message;
        const hint = (e.data as { hint?: string } | undefined)?.hint;
        if (hint) msg = `${msg}\n\n${hint}`;
      } else if (e instanceof Error && e.message) { msg = e.message; }
      appAlert('Import Failed', msg);
    } finally { setImporting(false); }
  };

  const renderSound = ({ item, index }: { item: ReelSound; index: number }) => {
    const isSelected = selectedId === item.id;
    const isPlaying = previewId === item.id;

    return (
      <View style={{ marginHorizontal: 4 }}>
        <Pressable
          style={[s.track, isSelected && s.trackSelected, isPlaying && s.trackPlaying]}
          onPress={() => void handleSelect(item)}
          android_ripple={{ color: 'rgba(255,45,85,0.12)' }}
        >
        {/* Cover art */}
        <View style={s.coverWrap}>
          {item.cover_url ? (
            <Image source={{ uri: resolveMediaUrl(item.cover_url) }} style={s.cover} />
          ) : (
            <LinearGradient
              colors={isSelected ? ['#FF2D55', '#9333EA'] : ['#1C1C2E', '#2A2A3E']}
              style={s.cover}
            >
              <Ionicons name="musical-notes" size={18} color={isSelected ? '#FFF' : '#666'} />
            </LinearGradient>
          )}
          {isPlaying && (
            <View style={s.playingOverlay}>
              <WaveformBars playing={isPlaying} />
            </View>
          )}
        </View>

        {/* Info */}
        <View style={s.trackInfo}>
          <View style={s.titleRow}>
            <Text style={[s.trackTitle, isSelected && s.trackTitleSelected]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.is_trending && !item.is_licensed && (
              <View style={s.hotBadge}>
                <Text style={s.hotBadgeText}>🔥</Text>
              </View>
            )}
            {item.is_licensed && (
              <View style={s.licensedBadge}>
                <Ionicons name="shield-checkmark" size={9} color="#A5B4FC" />
                <Text style={s.licensedText}>Licensed</Text>
              </View>
            )}
          </View>
          <Text style={s.trackArtist} numberOfLines={1}>{item.artist}</Text>
          <View style={s.trackMeta}>
            <Text style={s.metaText}>{formatDuration(item.duration_ms)}</Text>
            {(item.reels_count ?? 0) > 0 && (
              <>
                <View style={s.metaDot} />
                <Text style={s.metaText}>{(item.reels_count ?? 0).toLocaleString()} reels</Text>
              </>
            )}
          </View>
        </View>

        {/* Actions */}
        <View style={s.trackActions}>
          <TouchableOpacity
            style={[s.previewBtn, isPlaying && s.previewBtnActive]}
            onPress={(e) => { e.stopPropagation?.(); void playPreview(item); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={15} color="#FFF" />
          </TouchableOpacity>

          {isSelected ? (
            <View style={s.checkBadge}>
              <Ionicons name="checkmark" size={14} color="#FFF" />
            </View>
          ) : (
            <TouchableOpacity
              style={s.addBtn}
              onPress={() => void handleSelect(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={18} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
      {isPlaying && (
        <AudioTrimmer 
          durationMs={item.duration_ms || 30000} 
          onScrubStart={() => { void stopReelMusic(); }} 
          onScrubEnd={(ms) => { setTrimMs(ms); void playPreview(item, ms); }} 
        />
      )}
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      {/* Backdrop */}
      <Pressable style={s.backdrop} onPress={onClose} />

      <Animated.View style={[s.sheet, { transform: [{ translateY: slideAnim }], paddingBottom: Math.max(insets.bottom, 20) }]}>
        {/* Handle */}
        <View style={s.handleWrap}>
          <View style={s.handle} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Ionicons name="chevron-down" size={20} color="#FFF" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Add Music</Text>
          <TouchableOpacity
            style={[s.importBtn, importing && s.importBtnBusy]}
            onPress={() => void importFromLibrary()}
            disabled={importing || !token}
          >
            {importing
              ? <ActivityIndicator size="small" color="#FFF" />
              : <><Ionicons name="folder-open-outline" size={14} color="#FFF" /><Text style={s.importBtnText}>Import</Text></>
            }
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={s.searchBar}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
          <TextInput
            style={s.searchInput}
            placeholder="Search songs, artists..."
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          )}
        </View>

        {/* Tabs */}
        <View style={s.tabRow}>
          {(['trending', 'browse'] as TabId[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
            >
              <Ionicons
                name={t === 'trending' ? 'flame' : 'musical-notes'}
                size={13}
                color={tab === t ? '#FFF' : 'rgba(255,255,255,0.4)'}
                style={{ marginRight: 4 }}
              />
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'trending' ? 'Trending' : 'All Music'}
              </Text>
            </TouchableOpacity>
          ))}

          {/* No music chip */}
          <TouchableOpacity
            style={[s.noMusicChip, !selectedId && s.noMusicChipActive]}
            onPress={() => void handleSelect(null)}
          >
            <Ionicons name="volume-mute" size={13} color={!selectedId ? '#FFF' : 'rgba(255,255,255,0.4)'} />
          </TouchableOpacity>
        </View>

        {/* Language filters */}
        <FlatList
          horizontal
          data={languages}
          keyExtractor={(item) => item.code}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.langRow}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[s.langChip, language === item.code && s.langChipActive]}
              onPress={() => setLanguage(item.code)}
            >
              <Text style={[s.langChipText, language === item.code && s.langChipTextActive]}>
                {item.emoji ? `${item.emoji} ` : ''}{item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* Sounds list */}
        {loading && sounds.length === 0 ? (
          <View style={s.loadingBox}>
            <ActivityIndicator size="large" color="#FF2D55" />
            <Text style={s.loadingText}>Finding songs...</Text>
          </View>
        ) : (
          <FlatList
            data={sounds}
            keyExtractor={(item) => item.id}
            renderItem={renderSound}
            contentContainerStyle={s.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={s.separator} />}
            ListEmptyComponent={
              <View style={s.emptyBox}>
                <Ionicons name="musical-notes-outline" size={44} color="rgba(255,255,255,0.12)" />
                <Text style={s.emptyText}>
                  {query ? 'No songs found. Try another search.' : 'No songs here yet.'}
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#0E0E16',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SCREEN_H * 0.88,
    minHeight: SCREEN_H * 0.65,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  handleWrap: { alignItems: 'center', paddingTop: 10, paddingBottom: 2 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(99,102,241,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  importBtnBusy: { opacity: 0.5 },
  importBtnText: { color: '#FFF', fontSize: 12, fontWeight: '600' },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  searchInput: { flex: 1, color: '#FFF', fontSize: 14 },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 10,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  tabActive: {
    backgroundColor: '#FF2D55',
    borderColor: '#FF2D55',
  },
  tabText: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#FFF' },
  noMusicChip: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noMusicChipActive: {
    backgroundColor: 'rgba(255,45,85,0.2)',
    borderColor: '#FF2D55',
  },

  // Language
  langRow: { paddingHorizontal: 16, gap: 6, paddingBottom: 10 },
  langChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  langChipActive: {
    backgroundColor: 'rgba(255,45,85,0.18)',
    borderColor: '#FF2D55',
  },
  langChipText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '600' },
  langChipTextActive: { color: '#FF2D55' },

  // Loading / Empty
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, minHeight: 180 },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { color: 'rgba(255,255,255,0.35)', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },

  listContent: { paddingHorizontal: 12, paddingBottom: 20 },
  separator: { height: 1, backgroundColor: 'rgba(255,255,255,0.04)', marginHorizontal: 16 },

  // Track card
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  trackSelected: {
    backgroundColor: 'rgba(255,45,85,0.1)',
  },
  trackPlaying: {
    backgroundColor: 'rgba(255,45,85,0.07)',
  },

  // Cover art
  coverWrap: { position: 'relative' },
  cover: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#1C1C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Track info
  trackInfo: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'nowrap' },
  trackTitle: { color: '#FFF', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  trackTitleSelected: { color: '#FF2D55' },
  trackArtist: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  trackMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 4 },
  metaText: { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  metaDot: { width: 2.5, height: 2.5, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.2)' },

  hotBadge: {
    backgroundColor: 'rgba(255,100,0,0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
  },
  hotBadgeText: { fontSize: 9 },
  licensedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(99,102,241,0.15)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  licensedText: { color: '#A5B4FC', fontSize: 9, fontWeight: '700' },

  // Actions
  trackActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnActive: { backgroundColor: '#FF2D55' },
  checkBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});