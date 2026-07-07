import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { appAlert } from '../../lib/appAlert';
import { apiGet, apiPost, ApiError } from '../../lib/apiClient';
import { prepareAgoraCallHandoff } from '../../lib/agoraCallHandoff';
import type { IRtcEngine } from '../agoraImports';
import { getPkBattleDisplayStatus } from '../../lib/pkBattleCard';

const PK_DURATIONS = [
  { label: '3 min', value: 180 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
];

type WaitingBattle = {
  battle_id?: string;
  battleId?: string;
  host1?: { id?: string; username?: string };
  host1_username?: string;
  duration?: number;
  status?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  token?: string | null;
  sessionId?: string | null;
  liveEngine?: IRtcEngine | null;
  onEngineReleased?: () => void;
  onLiveEnded?: () => void;
};

export default function LivePkLauncher({
  visible,
  onClose,
  token,
  sessionId,
  liveEngine,
  onEngineReleased,
  onLiveEnded,
}: Props) {
  const router = useRouter();
  const [loadingBattles, setLoadingBattles] = useState(false);
  const [waitingBattles, setWaitingBattles] = useState<WaitingBattle[]>([]);
  const [busy, setBusy] = useState(false);

  const [matchingBattleId, setMatchingBattleId] = useState<string | null>(null);

  const fetchWaitingBattles = useCallback(async () => {
    if (!token) return;
    setLoadingBattles(true);
    try {
      const res = await apiGet<{ battles?: WaitingBattle[] }>('/api/pk/active', token);
      const open = (res.battles || []).filter(
        (b) => getPkBattleDisplayStatus(b) === 'waiting',
      );
      setWaitingBattles(open);
    } catch {
      setWaitingBattles([]);
    } finally {
      setLoadingBattles(false);
    }
  }, [token]);

  useEffect(() => {
    if (visible) {
      void fetchWaitingBattles();
    }
  }, [visible, fetchWaitingBattles]);



  const handoffFromLive = useCallback(async () => {
    const eng = liveEngine ?? null;
    onEngineReleased?.();
    await prepareAgoraCallHandoff(eng, `pk_from_live_${sessionId || 'x'}`);
    if (sessionId && token) {
      try {
        await apiPost(`/api/live/end/${sessionId}`, {}, token);
      } catch {
        // stream may already be ended
      }
    }
    onLiveEnded?.();
  }, [liveEngine, onEngineReleased, onLiveEnded, sessionId, token]);

  const navigateToPk = useCallback(
    (path: string) => {
      onClose();
      router.replace(path as never);
    },
    [onClose, router],
  );

  // Polling for match
  useEffect(() => {
    if (!matchingBattleId || !token) return;
    const interval = setInterval(async () => {
      try {
        const res = await apiGet<{ battles?: WaitingBattle[] }>('/api/pk/active', token);
        const myBattle = res.battles?.find(b => b.battle_id === matchingBattleId || b.battleId === matchingBattleId);
        
        if (myBattle && myBattle.status === 'active') {
          // Match found!
          clearInterval(interval);
          setBusy(true);
          setMatchingBattleId(null);
          try {
            await handoffFromLive();
            navigateToPk(`/pk/battle?mode=host&battleId=${matchingBattleId}`);
          } catch(e) {}
        }
      } catch (e) {
        // ignore
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [matchingBattleId, token, handoffFromLive, navigateToPk]);

  const confirmAndLaunch = useCallback(
    (launch: () => Promise<void>) => {
      appAlert(
        'PK Battle',
        'Your live stream will end when you enter PK battle.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Continue',
            onPress: () => {
              void (async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await handoffFromLive();
                  await launch();
                } catch (e) {
                  const msg =
                    e instanceof ApiError
                      ? e.message
                      : e instanceof Error
                        ? e.message
                        : 'Could not start PK battle';
                  appAlert('PK Error', msg);
                } finally {
                  setBusy(false);
                }
              })();
            },
          },
        ],
      );
    },
    [busy, handoffFromLive],
  );

  const handleCreatePk = async (duration: number) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await apiPost<{ battleId: string }>('/api/pk/create', { duration }, token);
      setMatchingBattleId(res.battleId);
    } catch (e: any) {
      appAlert('PK Error', e?.message || 'Could not start PK battle');
    } finally {
      setBusy(false);
    }
  };

  const handleJoinPk = (battle: WaitingBattle) => {
    const battleId = battle.battle_id || battle.battleId;
    if (!battleId) return;
    confirmAndLaunch(async () => {
      navigateToPk(`/pk/battle?mode=join&battleId=${encodeURIComponent(battleId)}`);
    });
  };

  const cancelMatching = async () => {
    if (!matchingBattleId || !token) return;
    setBusy(true);
    try {
      await apiPost(`/api/pk/end/${matchingBattleId}`, {}, token);
    } catch (e) {} finally {
      setMatchingBattleId(null);
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (matchingBattleId) {
      void cancelMatching();
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={handleClose}>
        <View style={s.sheet} onStartShouldSetResponder={() => true}>
          <View style={s.handle} />
          <View style={s.titleRow}>
            <LinearGradient colors={['#FF9500', '#FF2D55']} style={s.pkIcon}>
              <Ionicons name="flash" size={18} color="#FFF" />
            </LinearGradient>
            <Text style={s.title}>PK Battle</Text>
          </View>
          <Text style={s.sub}>
            Challenge another streamer. Gifts during PK add to your score.
          </Text>

          {matchingBattleId ? (
            <View style={{ alignItems: 'center', paddingVertical: 30 }}>
              <ActivityIndicator color="#FF2D55" size="large" />
              <Text style={{ color: '#FFF', fontSize: 16, marginTop: 16, fontWeight: 'bold' }}>Matching for opponent...</Text>
              <Text style={{ color: 'rgba(255,255,255,0.6)', marginTop: 8, textAlign: 'center' }}>
                Your live stream is still active.
              </Text>
              <TouchableOpacity onPress={cancelMatching} disabled={busy} style={{ marginTop: 24, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: 'rgba(255,45,85,0.2)', borderRadius: 20 }}>
                <Text style={{ color: '#FF4466', fontWeight: 'bold' }}>Cancel Matching</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={s.sectionLabel}>Start new battle</Text>
              <View style={s.durationRow}>
                {PK_DURATIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={s.durationBtn}
                    disabled={busy}
                    onPress={() => handleCreatePk(opt.value)}
                    activeOpacity={0.85}
                  >
                    <LinearGradient
                      colors={['#FF9500', '#FF2D55']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.durationGrad}
                    >
                      <Text style={s.durationText}>{opt.label}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.sectionLabel}>Join waiting battle</Text>
              {loadingBattles ? (
                <ActivityIndicator color="#FF2D55" style={{ marginVertical: 16 }} />
              ) : waitingBattles.length === 0 ? (
                <Text style={s.empty}>No open battles right now — start one!</Text>
              ) : (
                <ScrollView style={s.list} nestedScrollEnabled>
                  {waitingBattles.map((battle) => {
                    const id = battle.battle_id || battle.battleId || '';
                    return (
                      <TouchableOpacity
                        key={id}
                        style={s.battleRow}
                        disabled={busy}
                        onPress={() => handleJoinPk(battle)}
                        activeOpacity={0.8}
                      >
                        <View style={s.battleInfo}>
                          <Text style={s.battleHost}>
                            {battle.host1_username || battle.host1?.username || 'Host'}
                          </Text>
                          <Text style={s.battleMeta}>
                            {Math.floor((battle.duration || 300) / 60)} min · Waiting
                          </Text>
                        </View>
                        <View style={s.joinPill}>
                          <Text style={s.joinText}>Join</Text>
                          <Ionicons name="chevron-forward" size={14} color="#FF9500" />
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}

          {busy && !matchingBattleId && (
            <View style={s.busyRow}>
              <ActivityIndicator color="#FF2D55" size="small" />
              <Text style={s.busyText}>Please wait...</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#14141C',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 28,
    maxHeight: '78%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  pkIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 18, marginBottom: 18 },
  sectionLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  durationRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  durationBtn: { flex: 1 },
  durationGrad: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  durationText: { color: '#FFF', fontSize: 14, fontWeight: '800' },
  empty: { color: 'rgba(255,255,255,0.4)', fontSize: 13, marginBottom: 8 },
  list: { maxHeight: 180 },
  battleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,149,0,0.2)',
  },
  battleInfo: { flex: 1 },
  battleHost: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  battleMeta: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 2 },
  joinPill: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  joinText: { color: '#FF9500', fontSize: 13, fontWeight: '800' },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  busyText: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
});