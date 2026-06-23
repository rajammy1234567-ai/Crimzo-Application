import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io, { Socket } from 'socket.io-client';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL, apiPost, ApiError } from '../../lib/apiClient';
import {
  startVideoCallBilling,
  tickVideoCallBilling,
  endVideoCallBilling,
  isBalanceExhaustedError,
  VIDEO_CALL_RATE_PER_MIN,
} from '../../lib/videoCallBilling';
import { CALL_RING_TIMEOUT_MS, callStatusLabel, type CallPhase } from '../../lib/videoCallUi';
import { toAgoraUid } from '../../lib/agoraUid';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  RtcSurfaceView,
  isAgoraNativeLinked,
  type IRtcEngine,
} from '../../components/agoraImports';

export default function VideoCallScreen() {
  const router = useRouter();
  const { user, token, updateUser } = useAuth();
  const params = useLocalSearchParams<{
    channel?: string;
    role?: string;
    peerId?: string;
    peerName?: string;
    ratePerMin?: string;
    beansPerMin?: string;
  }>();

  const channelName = params.channel || '';
  const peerName = params.peerName || 'User';
  const peerId = params.peerId || '';
  const role = params.role || 'caller';
  const ratePerMin = Number(params.ratePerMin) || VIDEO_CALL_RATE_PER_MIN;
  const beansPerMin = params.beansPerMin ? Number(params.beansPerMin) : undefined;

  const engineRef = useRef<IRtcEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const billingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const billingStartedRef = useRef(false);
  const elapsedSecRef = useRef(0);
  const callEndedRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [callPhase, setCallPhase] = useState<CallPhase>(role === 'caller' ? 'ringing' : 'connecting');
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localUid, setLocalUid] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [minutesCharged, setMinutesCharged] = useState(0);
  const [totalCharged, setTotalCharged] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const isCaller = role === 'caller';
  const connected = callPhase === 'connected';

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  const clearBillingTimer = useCallback(() => {
    if (billingTimerRef.current) {
      clearInterval(billingTimerRef.current);
      billingTimerRef.current = null;
    }
  }, []);

  const finalizeBilling = useCallback(async () => {
    if (!token || !isCaller || !sessionIdRef.current) return;
    try {
      await endVideoCallBilling(token, {
        channelName,
        sessionId: sessionIdRef.current,
      });
    } catch {
      // non-fatal on hang up
    }
    sessionIdRef.current = null;
  }, [token, isCaller, channelName]);

  const endCall = useCallback((reason?: 'balance_exhausted' | 'no_answer' | 'declined') => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;
    clearRingTimeout();
    clearBillingTimer();
    void finalizeBilling();
    if (socketRef.current && peerId && reason !== 'no_answer' && reason !== 'declined') {
      socketRef.current.emit('video_call_end', {
        otherUserId: peerId,
        channelName,
        reason: reason === 'balance_exhausted' ? 'balance_exhausted' : undefined,
      });
    }
    if (engineRef.current) {
      engineRef.current.leaveChannel();
      engineRef.current.release();
      engineRef.current = null;
    }
    socketRef.current?.disconnect();
    setCallPhase('ended');
    router.back();
  }, [peerId, channelName, router, clearRingTimeout, clearBillingTimer, finalizeBilling]);

  const startBillingLoop = useCallback(() => {
    if (!token || !isCaller || billingTimerRef.current) return;

    billingTimerRef.current = setInterval(async () => {
      if (!sessionIdRef.current || !token) return;
      try {
        const tick = await tickVideoCallBilling(token, {
          channelName,
          sessionId: sessionIdRef.current,
        });
        if (tick.wallet_balance != null) {
          setWalletBalance(tick.wallet_balance);
          updateUser({ wallet_balance: tick.wallet_balance });
        }
        if (tick.minutesCharged != null) setMinutesCharged(tick.minutesCharged);
        if (tick.totalCharged != null) setTotalCharged(tick.totalCharged);

        if (tick.canContinue === false) {
          clearBillingTimer();
          Alert.alert(
            'Balance Low',
            'Insufficient balance for the next minute. Ending the call.',
            [{ text: 'OK', onPress: () => endCall('balance_exhausted') }],
          );
        }
      } catch (e) {
        if (isBalanceExhaustedError(e)) {
          clearBillingTimer();
          Alert.alert(
            'Balance Over',
            'Wallet balance exhausted — ending the video call.',
            [{ text: 'OK', onPress: () => endCall('balance_exhausted') }],
          );
        }
      }
    }, 60000);
  }, [token, isCaller, channelName, clearBillingTimer, endCall, updateUser]);

  const initCallBilling = useCallback(async () => {
    if (!token || billingStartedRef.current) return;
    billingStartedRef.current = true;
    try {
      const session = await startVideoCallBilling(token, {
        channelName,
        peerId,
        role,
      });
      if (session.wallet_balance != null) {
        setWalletBalance(session.wallet_balance);
        updateUser({ wallet_balance: session.wallet_balance });
      }
      if (session.minutesCharged != null) setMinutesCharged(session.minutesCharged);
      if (session.totalCharged != null) setTotalCharged(session.totalCharged);
      if (session.sessionId) {
        sessionIdRef.current = session.sessionId;
        startBillingLoop();
      }
    } catch (e) {
      if (e instanceof ApiError && (e.data as { code?: string })?.code === 'INSUFFICIENT_BALANCE') {
        Alert.alert(
          'Recharge Required',
          e.message || `Video call costs ₹${ratePerMin}/min.`,
          [{ text: 'OK', onPress: () => endCall() }],
        );
        return;
      }
      Alert.alert('Billing Error', e instanceof ApiError ? e.message : 'Could not start call billing');
    }
  }, [token, channelName, peerId, role, startBillingLoop, updateUser, ratePerMin, endCall]);

  const initAgora = useCallback(async () => {
    if (!channelName || !token || !user?.id || engineRef.current) return;

    try {
      if (Platform.OS === 'android') {
        await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
      }

      const creds = await apiPost<{
        success?: boolean;
        token?: string;
        appId?: string;
        uid?: number;
        error?: string;
      }>('/api/agora/call-token', { channelName, role, peerId }, token);

      if (!creds.success || !creds.token || !creds.appId) {
        throw new Error(creds.error || 'Could not get call credentials');
      }

      const uid = creds.uid || toAgoraUid(user.id);
      setLocalUid(uid);

      if (!isAgoraNativeLinked) {
        setLoading(false);
        setCallPhase('connected');
        Alert.alert(
          'Dev Build Required',
          'Real video needs a custom dev build (react-native-agora). Signaling works — install dev build for camera.',
        );
        return;
      }

      const engine = createAgoraRtcEngine();
      engine.initialize({
        appId: creds.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });
      engine.enableVideo();
      engine.enableAudio();
      engine.startPreview();

      engine.registerEventHandler({
        onJoinChannelSuccess: () => {
          setCallPhase('connected');
          setLoading(false);
        },
        onUserJoined: (_conn: unknown, remoteUserUid: number) => {
          setRemoteUid(remoteUserUid);
          if (isCaller) void initCallBilling();
        },
        onUserOffline: () => {
          setRemoteUid(null);
          Alert.alert('Call Ended', `${peerName} left the call`, [
            { text: 'OK', onPress: () => endCall() },
          ]);
        },
        onError: (err: unknown) => console.error('[VideoCall] Agora error:', err),
      });

      engine.joinChannel(creds.token, channelName, uid, {
        publishMicrophoneTrack: true,
        publishCameraTrack: true,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });

      engineRef.current = engine;
    } catch (e: unknown) {
      const msg = e instanceof ApiError
        ? e.message
        : (e instanceof Error ? e.message : 'Call failed');
      const code = e instanceof ApiError ? (e.data as { code?: string })?.code : undefined;
      if (code === 'INSUFFICIENT_BALANCE') {
        Alert.alert(
          'Recharge Required',
          msg,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => endCall() },
            { text: 'Add Money', onPress: () => router.replace('/profile/wallet' as any) },
          ],
        );
        return;
      }
      Alert.alert('Call Failed', msg, [{ text: 'OK', onPress: () => endCall() }]);
    }
  }, [channelName, token, user?.id, peerName, role, peerId, isCaller, initCallBilling, endCall, router]);

  useEffect(() => {
    if (Platform.OS === 'web') {
      Alert.alert('Mobile Only', '1-on-1 video call requires the Android/iOS app with Agora dev build.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
      return;
    }

    if (!channelName || !token || !user?.id) {
      Alert.alert('Error', 'Invalid call session', [{ text: 'OK', onPress: () => router.back() }]);
      return;
    }

    const socket = io(API_URL, { transports: ['websocket'], auth: { token } });
    socket.on('connect', () => socket.emit('join_user', { userId: user.id }));
    socket.on('video_call_ended', () => endCall());
    socket.on('video_call_rejected', () => {
      clearRingTimeout();
      Alert.alert('Call Declined', 'The other person declined your call.', [
        { text: 'OK', onPress: () => endCall('declined') },
      ]);
    });
    socket.on('video_call_accepted', (data?: { channelName?: string }) => {
      if (data?.channelName && data.channelName !== channelName) return;
      clearRingTimeout();
      setCallPhase('connecting');
      void initAgora();
    });
    socketRef.current = socket;

    if (isCaller) {
      ringTimeoutRef.current = setTimeout(() => {
        Alert.alert('No Answer', `${peerName} did not answer.`, [
          { text: 'OK', onPress: () => endCall('no_answer') },
        ]);
      }, CALL_RING_TIMEOUT_MS);
    } else {
      void initAgora();
    }

    return () => {
      clearRingTimeout();
      clearBillingTimer();
      void finalizeBilling();
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
      socket.disconnect();
    };
  }, [
    channelName,
    token,
    user?.id,
    peerName,
    isCaller,
    endCall,
    router,
    initAgora,
    clearRingTimeout,
    clearBillingTimer,
    finalizeBilling,
  ]);

  useEffect(() => {
    if (!connected) return;
    const timer = setInterval(() => {
      elapsedSecRef.current += 1;
      setElapsedSec(elapsedSecRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [connected]);

  const formatElapsed = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleMic = () => {
    setMicOn((prev) => {
      engineRef.current?.muteLocalAudioStream(prev);
      return !prev;
    });
  };

  const toggleCam = () => {
    setCamOn((prev) => {
      engineRef.current?.muteLocalVideoStream(prev);
      return !prev;
    });
  };

  const switchCam = () => engineRef.current?.switchCamera();

  const statusText = connected
    ? `Live · ${formatElapsed(elapsedSec)}`
    : callStatusLabel(callPhase, peerName);

  const showRingingUI = callPhase === 'ringing' || (callPhase === 'connecting' && loading);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0a0a12', '#1a0a18', '#0a0a12']} style={StyleSheet.absoluteFill} />

      {showRingingUI ? (
        <View style={s.center}>
          <View style={s.ringPulse}>
            <Ionicons name="videocam" size={48} color="#4CD964" />
          </View>
          <Text style={s.peerName}>{peerName}</Text>
          <Text style={s.statusText}>{statusText}</Text>
          {isCaller && (
            <Text style={s.rateHint}>
              ₹{ratePerMin}/min{beansPerMin ? ` · they earn ${beansPerMin} beans/min` : ''}
            </Text>
          )}
          <ActivityIndicator size="large" color="#FF2D55" style={{ marginTop: 24 }} />
        </View>
      ) : (
        <>
          <View style={s.remote}>
            {remoteUid != null && isAgoraNativeLinked ? (
              <RtcSurfaceView
                style={s.remoteVideo}
                canvas={{ uid: remoteUid }}
              />
            ) : (
              <View style={s.remotePlaceholder}>
                <Ionicons name="person-circle" size={80} color="rgba(255,255,255,0.3)" />
                <Text style={s.peerName}>{peerName}</Text>
                <Text style={s.waiting}>
                  {connected ? 'Waiting for video...' : statusText}
                </Text>
              </View>
            )}
          </View>

          {isAgoraNativeLinked && camOn && (
            <View style={s.localPip}>
              <RtcSurfaceView style={s.localVideo} canvas={{ uid: localUid }} />
            </View>
          )}

          <View style={s.topBar}>
            <Text style={s.callTitle}>{peerName}</Text>
            <Text style={s.callSub}>{statusText}</Text>
            {isCaller && connected && (
              <View style={s.billingBadge}>
                <Text style={s.billingText}>
                  ₹{totalCharged || ratePerMin} charged · ₹{ratePerMin}/min
                </Text>
                {walletBalance != null && (
                  <Text style={s.balanceText}>Balance: ₹{walletBalance.toLocaleString('en-IN')}</Text>
                )}
                {minutesCharged > 0 && (
                  <Text style={s.balanceText}>{minutesCharged} min billed</Text>
                )}
              </View>
            )}
            {!isCaller && connected && (
              <Text style={s.freeCallText}>
                Incoming call{beansPerMin ? ` · earn ${beansPerMin} beans/min` : ' — no charge'}
              </Text>
            )}
          </View>
        </>
      )}

      <View style={s.controls}>
        {!showRingingUI && (
          <>
            <TouchableOpacity style={s.ctrlBtn} onPress={toggleMic}>
              <Ionicons name={micOn ? 'mic' : 'mic-off'} size={24} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={s.ctrlBtn} onPress={toggleCam}>
              <Ionicons name={camOn ? 'videocam' : 'videocam-off'} size={24} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={s.ctrlBtn} onPress={switchCam}>
              <Ionicons name="camera-reverse" size={24} color="#FFF" />
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={s.endBtn} onPress={() => endCall()}>
          <Ionicons name="call" size={28} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  ringPulse: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(76,217,100,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(76,217,100,0.35)',
  },
  statusText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
  rateHint: { color: 'rgba(255,215,0,0.8)', fontSize: 13, fontWeight: '600', marginTop: 4 },
  remote: { flex: 1, backgroundColor: '#111' },
  remoteVideo: { flex: 1 },
  remotePlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  peerName: { color: '#FFF', fontSize: 22, fontWeight: '800', marginTop: 8 },
  waiting: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  localPip: {
    position: 'absolute', top: 60, right: 16,
    width: 110, height: 150, borderRadius: 14, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
  },
  localVideo: { flex: 1 },
  topBar: { position: 'absolute', top: 50, left: 20 },
  callTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  callSub: { color: '#4CD964', fontSize: 13, fontWeight: '600', marginTop: 4 },
  billingBadge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  billingText: { color: '#FFD700', fontSize: 12, fontWeight: '700' },
  balanceText: { color: 'rgba(255,255,255,0.75)', fontSize: 11, marginTop: 2 },
  freeCallText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 6 },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 20, paddingVertical: 36, paddingBottom: 48,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  ctrlBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  endBtn: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#FF2D55',
    alignItems: 'center', justifyContent: 'center',
  },
});