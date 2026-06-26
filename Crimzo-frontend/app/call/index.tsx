import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  StatusBar,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import io, { Socket } from 'socket.io-client';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/appAlert';
import { API_URL, apiPost, ApiError } from '../../lib/apiClient';
import {
  startVideoCallBilling,
  tickVideoCallBilling,
  endVideoCallBilling,
  isBalanceExhaustedError,
  VIDEO_CALL_RATE_PER_MIN,
} from '../../lib/videoCallBilling';
import {
  CALL_RING_TIMEOUT_MS,
  callPhaseHint,
  callStatusLabel,
  exitCallToHome,
  type CallPhase,
  type EndCallReason,
} from '../../lib/videoCallUi';
import { toAgoraUid } from '../../lib/agoraUid';
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ConnectionStateType,
  RtcSurfaceView,
  isAgoraNativeLinked,
  type IRtcEngine,
} from '../../components/agoraImports';
import {
  ensureRtcPermissions,
  configurePublisherAudio,
  configureCallAudioEngine,
  configureRemoteSubscriber,
  prepareVoiceCallAudio,
  shouldConfigureRemoteAudio,
} from '../../lib/agoraRtcHelpers';
import { publish, subscribe } from '../../lib/realtimeSync';
import StickerPanel from '../../components/StickerPanel';
import GiftSplashOverlay from '../../components/GiftSplashOverlay';

function PeerAvatar({
  name,
  avatar,
  size = 140,
  pulse = false,
}: {
  name: string;
  avatar?: string;
  size?: number;
  pulse?: boolean;
}) {
  const ringAnim = useRef(new Animated.Value(0)).current;
  const initial = (name || 'U').charAt(0).toUpperCase();

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ringAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(ringAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, ringAnim]);

  const ringScale = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {pulse && (
        <Animated.View
          style={[
            s.avatarRing,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />
      )}
      <View style={[s.avatarCircle, { width: size, height: size, borderRadius: size / 2 }]}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={{ width: size, height: size, borderRadius: size / 2 }} />
        ) : (
          <Text style={[s.avatarInitial, { fontSize: size * 0.34 }]}>{initial}</Text>
        )}
      </View>
    </View>
  );
}

export default function VideoCallScreen() {
  const router = useRouter();
  const { user, token, updateUser } = useAuth();
  const params = useLocalSearchParams<{
    channel?: string;
    role?: string;
    peerId?: string;
    peerName?: string;
    peerAvatar?: string;
    ratePerMin?: string;
    beansPerMin?: string;
    accepted?: string;
    fromLive?: string;
  }>();

  const channelName = params.channel || '';
  const peerName = params.peerName || 'User';
  const peerAvatar = params.peerAvatar || '';
  const peerId = params.peerId || '';
  const role = params.role || 'caller';
  const isCaller = role === 'caller';
  const preAccepted = params.accepted === '1';
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
  const offlineGraceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localJoinedRef = useRef(false);
  const remoteUidRef = useRef<number | null>(null);
  const endCallRef = useRef<(reason?: EndCallReason) => void>(() => {});
  const initAgoraRef = useRef<() => Promise<void>>(async () => {});
  const finalizeBillingRef = useRef<() => Promise<void>>(async () => {});
  const peerNameRef = useRef(peerName);
  const isCallerRef = useRef(isCaller);

  const [loading, setLoading] = useState(true);
  const [callPhase, setCallPhase] = useState<CallPhase>(
    isCaller && !preAccepted ? 'ringing' : 'connecting',
  );
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [remoteCamOn, setRemoteCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [localUid, setLocalUid] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [minutesCharged, setMinutesCharged] = useState(0);
  const [totalCharged, setTotalCharged] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showGifts, setShowGifts] = useState(false);
  const [giftBanner, setGiftBanner] = useState<string | null>(null);

  const connected = callPhase === 'connected';
  const showPreCallUI = callPhase === 'ringing' || callPhase === 'connecting';
  const showRemoteVideo = connected && remoteUid != null && remoteCamOn && isAgoraNativeLinked;

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

  const endCall = useCallback((reason?: EndCallReason) => {
    if (callEndedRef.current) return;
    callEndedRef.current = true;
    clearRingTimeout();
    clearBillingTimer();
    void finalizeBilling();

    const shouldNotifyPeer = Boolean(
      peerId && reason !== 'no_answer' && reason !== 'declined' && reason !== 'remote_ended',
    );
    if (socketRef.current && shouldNotifyPeer) {
      socketRef.current.emit('video_call_end', {
        otherUserId: peerId,
        channelName,
        reason: reason === 'balance_exhausted' ? 'balance_exhausted' : undefined,
      });
    }

    if (params.fromLive === '1') {
      publish('live_call_screen_ended', { role });
    }
    publish('video_call_force_end', { channelName, reason, local: reason !== 'remote_ended' });

    if (engineRef.current) {
      const eng = engineRef.current;
      engineRef.current = null;
      eng.leaveChannel();
      setTimeout(() => {
        try { eng.release(); } catch {}
      }, 300);
    }
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setCallPhase('ended');
    exitCallToHome(router);
  }, [peerId, channelName, router, clearRingTimeout, clearBillingTimer, finalizeBilling, params.fromLive, role]);

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
          appAlert(
            'Balance Low',
            'Insufficient balance for the next minute. Ending the call.',
            [{ text: 'OK', onPress: () => endCall('balance_exhausted') }],
          );
        }
      } catch (e) {
        if (isBalanceExhaustedError(e)) {
          clearBillingTimer();
          appAlert(
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
        appAlert(
          'Recharge Required',
          e.message || `Video call costs ₹${ratePerMin}/min.`,
          [{ text: 'OK', onPress: () => endCall() }],
        );
        return;
      }
      appAlert('Billing Error', e instanceof ApiError ? e.message : 'Could not start call billing');
    }
  }, [token, channelName, peerId, role, startBillingLoop, updateUser, ratePerMin, endCall]);

  const tryActivateCall = useCallback((engine: IRtcEngine, remoteUserUid?: number) => {
    configureCallAudioEngine(engine, { speakerphone: speakerOn });

    if (remoteUserUid) {
      remoteUidRef.current = remoteUserUid;
      setRemoteUid(remoteUserUid);
      configureRemoteSubscriber(engine, remoteUserUid);
    }

    if (localJoinedRef.current && remoteUidRef.current) {
      setCallPhase('connected');
      setLoading(false);
      return;
    }

    if (localJoinedRef.current) {
      setCallPhase('connecting');
      setLoading(false);
    }
  }, [speakerOn]);

  const initAgora = useCallback(async () => {
    if (!channelName || !token || !user?.id || engineRef.current) return;

    try {
      await prepareVoiceCallAudio();
      const perms = await ensureRtcPermissions();
      if (!perms.mic) {
        appAlert(
          'Microphone Required',
          'Allow microphone access so the other person can hear you on this call.',
          [{ text: 'OK', onPress: () => endCall() }],
        );
        return;
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
        appAlert(
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
      configureCallAudioEngine(engine, { speakerphone: speakerOn });
      engine.startPreview();

      engine.registerEventHandler({
        onJoinChannelSuccess: () => {
          localJoinedRef.current = true;
          tryActivateCall(engine, remoteUidRef.current ?? undefined);
        },
        onConnectionStateChanged: (_conn: unknown, state: number) => {
          if (state === ConnectionStateType.ConnectionStateConnected) {
            localJoinedRef.current = true;
            tryActivateCall(engine, remoteUidRef.current ?? undefined);
          }
        },
        onUserJoined: (_conn: unknown, remoteUserUid: number) => {
          if (offlineGraceRef.current) {
            clearTimeout(offlineGraceRef.current);
            offlineGraceRef.current = null;
          }
          setRemoteCamOn(true);
          tryActivateCall(engine, remoteUserUid);
          if (isCallerRef.current) void initCallBilling();
        },
        onFirstRemoteAudioDecoded: (_conn: unknown, uid: number) => {
          configureRemoteSubscriber(engine, uid);
        },
        onFirstRemoteAudioFrame: (_conn: unknown, uid: number) => {
          configureRemoteSubscriber(engine, uid);
        },
        onRemoteAudioStateChanged: (_conn: unknown, uid: number, state: number) => {
          if (shouldConfigureRemoteAudio(state)) configureRemoteSubscriber(engine, uid);
        },
        onUserMuteAudio: (_conn: unknown, uid: number, muted: boolean) => {
          if (!muted && uid === remoteUidRef.current) configureRemoteSubscriber(engine, uid);
        },
        onUserMuteVideo: (_conn: unknown, uid: number, muted: boolean) => {
          if (uid === remoteUidRef.current) setRemoteCamOn(!muted);
        },
        onUserOffline: () => {
          if (offlineGraceRef.current) clearTimeout(offlineGraceRef.current);
          offlineGraceRef.current = setTimeout(() => {
            if (callEndedRef.current) return;
            endCallRef.current('remote_ended');
          }, 1500);
        },
        onError: (err: unknown) => console.error('[VideoCall] Agora error:', err),
      });

      engine.joinChannel(creds.token, channelName, uid, {
        publishMicrophoneTrack: true,
        publishCameraTrack: true,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      });
      configureCallAudioEngine(engine, { speakerphone: speakerOn });

      engineRef.current = engine;
    } catch (e: unknown) {
      const msg = e instanceof ApiError
        ? e.message
        : (e instanceof Error ? e.message : 'Call failed');
      const code = e instanceof ApiError ? (e.data as { code?: string })?.code : undefined;
      if (code === 'INSUFFICIENT_BALANCE') {
        appAlert(
          'Recharge Required',
          msg,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => endCall() },
            { text: 'Add Money', onPress: () => router.replace('/profile/wallet' as any) },
          ],
        );
        return;
      }
      appAlert('Call Failed', msg, [{ text: 'OK', onPress: () => endCall() }]);
    }
  }, [channelName, token, user?.id, role, peerId, initCallBilling, endCall, router, tryActivateCall, speakerOn]);

  endCallRef.current = endCall;
  finalizeBillingRef.current = finalizeBilling;
  initAgoraRef.current = initAgora;
  peerNameRef.current = peerName;
  isCallerRef.current = isCaller;

  useEffect(() => {
    if (Platform.OS === 'web') {
      appAlert('Mobile Only', '1-on-1 video call requires the Android/iOS app with Agora dev build.', [
        { text: 'OK', onPress: () => exitCallToHome(router) },
      ]);
      return;
    }

    if (!channelName || !token || !user?.id) {
      appAlert('Error', 'Invalid call session', [{ text: 'OK', onPress: () => exitCallToHome(router) }]);
      return;
    }

    const socket = io(API_URL, { transports: ['websocket'], auth: { token } });
    socket.on('connect', () => socket.emit('join_user', { userId: user.id }));
    socket.on('video_call_ended', (data?: { channelName?: string }) => {
      if (data?.channelName && data.channelName !== channelName) return;
      if (!callEndedRef.current) endCallRef.current('remote_ended');
    });
    socket.on('video_call_rejected', () => {
      clearRingTimeout();
      if (!callEndedRef.current) endCallRef.current('declined');
    });
    socket.on('call_gift_received', (data?: {
      userId?: string;
      username?: string;
      stickerName?: string;
      channelName?: string;
    }) => {
      if (data?.channelName && data.channelName !== channelName) return;
      if (String(data?.userId) === String(user?.id)) return;
      const label = data?.username && data?.stickerName
        ? `${data.username} sent ${data.stickerName}`
        : 'Gift received!';
      setGiftBanner(label);
      setTimeout(() => setGiftBanner(null), 3200);
    });
    socket.on('video_call_accepted', (data?: { channelName?: string }) => {
      if (data?.channelName && data.channelName !== channelName) return;
      clearRingTimeout();
      setCallPhase('connecting');
      void initAgoraRef.current();
    });
    socketRef.current = socket;

    if (isCaller && !preAccepted) {
      ringTimeoutRef.current = setTimeout(() => {
        appAlert('No Answer', `${peerNameRef.current} did not answer.`, [
          { text: 'OK', onPress: () => endCallRef.current('no_answer') },
        ]);
      }, CALL_RING_TIMEOUT_MS);
    } else {
      setCallPhase('connecting');
      void initAgoraRef.current();
    }

    return () => {
      if (offlineGraceRef.current) {
        clearTimeout(offlineGraceRef.current);
        offlineGraceRef.current = null;
      }
      clearRingTimeout();
      clearBillingTimer();
      if (!callEndedRef.current) {
        void finalizeBillingRef.current();
      }
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
      socket.disconnect();
    };
  }, [channelName, token, user?.id, isCaller, preAccepted, clearRingTimeout, clearBillingTimer, router]);

  useEffect(() => {
    const handleAccepted = (...args: unknown[]) => {
      const data = args[0] as { channelName?: string } | undefined;
      if (data?.channelName && data.channelName !== channelName) return;
      clearRingTimeout();
      setCallPhase('connecting');
      void initAgoraRef.current();
    };
    const handleForceEnd = (...args: unknown[]) => {
      const data = args[0] as { channelName?: string; local?: boolean } | undefined;
      if (data?.channelName && data.channelName !== channelName) return;
      if (data?.local) return;
      if (!callEndedRef.current) endCallRef.current('remote_ended');
    };
    const unsubAccepted = subscribe('video_call_accepted', handleAccepted);
    const unsubForceEnd = subscribe('video_call_force_end', handleForceEnd);
    const unsubReject = subscribe('video_call_rejected', () => {
      clearRingTimeout();
      if (!callEndedRef.current) endCallRef.current('declined');
    });
    return () => {
      unsubAccepted();
      unsubForceEnd();
      unsubReject();
    };
  }, [channelName, clearRingTimeout]);

  useEffect(() => {
    if (!connected) return;
    elapsedSecRef.current = 0;
    setElapsedSec(0);
    const timer = setInterval(() => {
      elapsedSecRef.current += 1;
      setElapsedSec(elapsedSecRef.current);
    }, 1000);
    return () => clearInterval(timer);
  }, [connected]);

  useEffect(() => {
    if (!connected || !engineRef.current || !remoteUidRef.current) return;
    const engine = engineRef.current;
    const remoteUid = remoteUidRef.current;
    configureCallAudioEngine(engine, { speakerphone: speakerOn });
    configureRemoteSubscriber(engine, remoteUid);
    const keepAlive = setInterval(() => {
      if (!engineRef.current || !remoteUidRef.current) return;
      configureCallAudioEngine(engineRef.current, { speakerphone: speakerOn });
      configureRemoteSubscriber(engineRef.current, remoteUidRef.current);
    }, 4000);
    return () => clearInterval(keepAlive);
  }, [connected, speakerOn]);

  const toggleMic = () => {
    setMicOn((prev) => {
      const nextOn = !prev;
      if (nextOn) {
        configureCallAudioEngine(engineRef.current, { speakerphone: speakerOn });
      } else {
        engineRef.current?.muteLocalAudioStream(true);
      }
      return nextOn;
    });
  };

  const toggleCam = () => {
    setCamOn((prev) => {
      engineRef.current?.muteLocalVideoStream(prev);
      return !prev;
    });
  };

  const toggleSpeaker = () => {
    setSpeakerOn((prev) => {
      const nextOn = !prev;
      const eng = engineRef.current as IRtcEngine & {
        setEnableSpeakerphone?: (enabled: boolean) => void;
        setDefaultAudioRouteToSpeakerphone?: (defaultToSpeaker: boolean) => void;
      };
      try {
        eng?.setEnableSpeakerphone?.(nextOn);
        eng?.setDefaultAudioRouteToSpeakerphone?.(nextOn);
      } catch {
        // optional SDK APIs
      }
      return nextOn;
    });
  };

  const switchCam = () => engineRef.current?.switchCamera();

  const statusText = callStatusLabel(callPhase, peerName, elapsedSec);
  const phaseHint = callPhaseHint(callPhase, isCaller);

  const renderControl = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    active = true,
    danger = false,
  ) => (
    <TouchableOpacity style={s.ctrlWrap} onPress={onPress} activeOpacity={0.8}>
      <View style={[s.ctrlBtn, !active && s.ctrlBtnOff, danger && s.ctrlBtnDanger]}>
        <Ionicons name={icon} size={danger ? 30 : 24} color="#FFF" />
      </View>
      <Text style={s.ctrlLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0B141A', '#111B21', '#0B141A']} style={StyleSheet.absoluteFill} />

      {showRemoteVideo ? (
        <RtcSurfaceView style={s.remoteVideo} canvas={{ uid: remoteUid! }} />
      ) : (
        <View style={s.hero}>
          <PeerAvatar
            name={peerName}
            avatar={peerAvatar || undefined}
            size={connected ? 120 : 150}
            pulse={showPreCallUI || connected}
          />
        </View>
      )}

      {connected && isAgoraNativeLinked && camOn && (
        <View style={s.localPip}>
          <RtcSurfaceView style={s.localVideo} canvas={{ uid: localUid }} />
        </View>
      )}

      <LinearGradient
        colors={['rgba(11,20,26,0.15)', 'rgba(11,20,26,0.75)', 'rgba(11,20,26,0.95)']}
        style={s.overlay}
      />

      <View style={s.infoBlock}>
        <Text style={s.peerName}>{peerName}</Text>
        <Text style={[s.statusText, connected && s.statusLive]}>{statusText}</Text>
        {phaseHint && <Text style={s.phaseHint}>{phaseHint}</Text>}
        {showPreCallUI && isCaller && (
          <Text style={s.rateHint}>
            ₹{ratePerMin}/min{beansPerMin ? ` · they earn ${beansPerMin} beans/min` : ''}
          </Text>
        )}
        {connected && isCaller && (
          <Text style={s.billingLine}>
            ₹{totalCharged || ratePerMin} charged · ₹{ratePerMin}/min
            {walletBalance != null ? ` · bal ₹${walletBalance.toLocaleString('en-IN')}` : ''}
          </Text>
        )}
        {connected && !isCaller && beansPerMin != null && (
          <Text style={s.billingLine}>Earning {beansPerMin} beans/min</Text>
        )}
      </View>

      {giftBanner && (
        <View style={s.giftBanner}>
          <Text style={s.giftBannerText}>{giftBanner}</Text>
        </View>
      )}

      <View style={s.controls}>
        {showPreCallUI ? (
          renderControl('call', 'Cancel', () => endCall(), true, true)
        ) : (
          <>
            {renderControl(
              speakerOn ? 'volume-high' : 'volume-mute',
              'Speaker',
              toggleSpeaker,
              speakerOn,
            )}
            {renderControl(micOn ? 'mic' : 'mic-off', 'Mute', toggleMic, micOn)}
            {renderControl('call', 'End', () => endCall(), true, true)}
            {renderControl(camOn ? 'videocam' : 'videocam-off', 'Video', toggleCam, camOn)}
            {renderControl('gift', 'Gift', () => setShowGifts(true))}
          </>
        )}
      </View>

      {connected && (
        <TouchableOpacity style={s.flipCamBtn} onPress={switchCam}>
          <Ionicons name="camera-reverse" size={22} color="#FFF" />
        </TouchableOpacity>
      )}

      {token && peerId && (
        <StickerPanel
          visible={showGifts}
          onClose={() => setShowGifts(false)}
          token={token}
          receiverId={peerId}
          receiverUsername={peerName}
          channelName={channelName}
        />
      )}
      <GiftSplashOverlay />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B141A' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  remoteVideo: { ...StyleSheet.absoluteFillObject },
  overlay: { ...StyleSheet.absoluteFillObject },
  avatarRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(37,211,102,0.55)',
  },
  avatarCircle: {
    overflow: 'hidden',
    backgroundColor: '#1F2C34',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  avatarInitial: { color: '#25D366', fontWeight: '800' },
  localPip: {
    position: 'absolute',
    top: 56,
    right: 16,
    width: 108,
    height: 148,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 20,
  },
  localVideo: { flex: 1 },
  infoBlock: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 24,
    zIndex: 10,
  },
  peerName: { color: '#FFF', fontSize: 28, fontWeight: '700', letterSpacing: 0.2 },
  statusText: { color: 'rgba(255,255,255,0.72)', fontSize: 18, fontWeight: '500', marginTop: 8 },
  statusLive: { color: '#25D366', fontSize: 20, fontWeight: '600' },
  phaseHint: { color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 6 },
  rateHint: { color: 'rgba(255,215,0,0.85)', fontSize: 13, fontWeight: '600', marginTop: 10 },
  billingLine: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 8 },
  giftBanner: {
    position: 'absolute',
    top: 200,
    alignSelf: 'center',
    zIndex: 30,
    backgroundColor: 'rgba(255,215,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.45)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  giftBannerText: { color: '#FFD700', fontSize: 14, fontWeight: '800' },
  controls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 48,
    paddingTop: 24,
    zIndex: 15,
  },
  ctrlWrap: { alignItems: 'center', gap: 8, minWidth: 62 },
  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctrlBtnOff: { backgroundColor: 'rgba(255,255,255,0.28)' },
  ctrlBtnDanger: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#E53935',
  },
  ctrlLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600' },
  flipCamBtn: {
    position: 'absolute',
    top: 56,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});