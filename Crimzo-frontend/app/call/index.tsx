import React, { useCallback, useEffect, useRef, useState } from "react";
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import io, { Socket } from "socket.io-client";
import { useAuth } from "../../contexts/AuthContext";
import { appAlert } from "../../lib/appAlert";
import { API_URL, apiPost, ApiError } from "../../lib/apiClient";
import {
  startVideoCallBilling,
  tickVideoCallBilling,
  endVideoCallBilling,
  isBalanceExhaustedError,
  VIDEO_CALL_RATE_PER_MIN,
} from "../../lib/videoCallBilling";
import {
  CALL_RING_TIMEOUT_MS,
  callPhaseHint,
  callStatusLabel,
  exitCallAfterLive,
  exitCallToHome,
  type CallPhase,
  type EndCallReason,
} from "../../lib/videoCallUi";
import { toAgoraUid } from "../../lib/agoraUid";
import {
  createAgoraRtcEngine,
  ChannelProfileType,
  ClientRoleType,
  ConnectionStateType,
  RtcSurfaceView,
  isAgoraNativeLinked,
  type IRtcEngine,
} from "../../components/agoraImports";
import {
  ensureRtcPermissions,
  buildCallJoinOptions,
  configurePublisherAudio,
  configureRemoteSubscriber,
  finalizeCallAudioAfterJoin,
  markRemotePeer,
  prepareVoiceCallAudio,
  resetExpoAudioAfterLive,
  shouldConfigureRemoteAudio,
} from "../../lib/agoraRtcHelpers";
import { logAgoraCall } from "../../lib/agoraCallDiagnostics";
import { publish, subscribe } from "../../lib/realtimeSync";
import {
  hardResetAgoraRtc,
  releaseAgoraEngine,
  trackAgoraEngine,
  waitForAgoraReleaseIdle,
} from "../../lib/agoraEngineRelease";
import {
  clearCallHandoff,
  isCallHandoffInProgress,
} from "../../lib/agoraCallHandoff";
import StickerPanel from "../../components/StickerPanel";
import GiftSplashOverlay from "../../components/GiftSplashOverlay";

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
  const initial = (name || "U").charAt(0).toUpperCase();

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

  const ringScale = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.45],
  });
  const ringOpacity = ringAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0],
  });

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
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
      <View
        style={[
          s.avatarCircle,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
      >
        {avatar ? (
          <Image
            source={{ uri: avatar }}
            style={{ width: size, height: size, borderRadius: size / 2 }}
          />
        ) : (
          <Text style={[s.avatarInitial, { fontSize: size * 0.34 }]}>
            {initial}
          </Text>
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
    callMode?: string;
    sessionId?: string;
  }>();

  const channelName = params.channel || "";
  const peerName = params.peerName || "User";
  const peerAvatar = params.peerAvatar || "";
  const peerId = params.peerId || "";
  const role = params.role || "caller";
  const isCaller = role === "caller";
  const preAccepted = params.accepted === "1";
  const isVideoMode = params.callMode !== "voice";
  const ratePerMin = Number(params.ratePerMin) || VIDEO_CALL_RATE_PER_MIN;
  const beansPerMin = params.beansPerMin
    ? Number(params.beansPerMin)
    : undefined;

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
  const initCallBillingRef = useRef<() => Promise<void>>(async () => {});
  const finalizeBillingRef = useRef<() => Promise<void>>(async () => {});
  const peerNameRef = useRef(peerName);
  const isCallerRef = useRef(isCaller);
  const initAgoraInProgressRef = useRef(false);
  const agoraHandlerRef = useRef<Record<string, unknown> | null>(null);
  const connectFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const remoteConfirmedRef = useRef(false);
  const connectedPhaseRef = useRef(false);
  const localChannelReadyRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [callPhase, setCallPhase] = useState<CallPhase>(
    isCaller && !preAccepted ? "ringing" : "connecting",
  );
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [remoteCamOn, setRemoteCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(isVideoMode);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [localUid, setLocalUid] = useState<number>(0);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [minutesCharged, setMinutesCharged] = useState(0);
  const [totalCharged, setTotalCharged] = useState(0);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [showGifts, setShowGifts] = useState(false);
  const [giftBanner, setGiftBanner] = useState<string | null>(null);
  const [billingActive, setBillingActive] = useState(false);

  const micOnRef = useRef(micOn);
  const speakerOnRef = useRef(speakerOn);
  const camOnRef = useRef(camOn);

  const connected = callPhase === "connected";
  const needsDevBuild = callPhase === "needs_dev_build";
  const showPreCallUI =
    callPhase === "ringing" || callPhase === "connecting" || needsDevBuild;
  const showRemoteVideo =
    isVideoMode &&
    connected &&
    remoteUid != null &&
    remoteCamOn &&
    isAgoraNativeLinked;
  const showGiftsOnCall = params.fromLive === "1";
  const expectedRemoteUid = peerId ? toAgoraUid(peerId) : undefined;

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);
  useEffect(() => {
    speakerOnRef.current = speakerOn;
  }, [speakerOn]);
  useEffect(() => {
    camOnRef.current = camOn;
  }, [camOn]);

  const clearConnectFallback = useCallback(() => {
    if (connectFallbackTimerRef.current) {
      clearTimeout(connectFallbackTimerRef.current);
      connectFallbackTimerRef.current = null;
    }
  }, []);

  const audioOpts = useCallback(
    () => ({
      speakerphone: speakerOnRef.current,
      publishVideo: isVideoMode && camOnRef.current,
      subscribeVideo: isVideoMode,
      micEnabled: micOnRef.current,
    }),
    [isVideoMode],
  );

  const confirmRemotePeer = useCallback((remoteUserUid: number) => {
    if (!remoteUserUid || callEndedRef.current) return;
    remoteUidRef.current = remoteUserUid;
    setRemoteUid(remoteUserUid);
    remoteConfirmedRef.current = true;
  }, []);

  const markConnected = useCallback(() => {
    if (connectedPhaseRef.current) return;
    if (
      !localJoinedRef.current ||
      !remoteUidRef.current ||
      !remoteConfirmedRef.current
    )
      return;
    connectedPhaseRef.current = true;
    setCallPhase("connected");
    setLoading(false);
    clearConnectFallback();
    logAgoraCall("connected", {
      channelName,
      localUid: localUid || undefined,
      remoteUid: remoteUidRef.current ?? undefined,
      role,
    });
    if (
      isCallerRef.current &&
      isAgoraNativeLinked &&
      !billingStartedRef.current
    ) {
      void initCallBillingRef.current();
    }
  }, [channelName, localUid, role, clearConnectFallback]);

  const handleRemotePresence = useCallback(
    (engine: IRtcEngine, remoteUserUid: number) => {
      if (!remoteUserUid) return;
      confirmRemotePeer(remoteUserUid);
      markRemotePeer(engine, remoteUserUid, audioOpts());
      if (localJoinedRef.current) markConnected();
    },
    [audioOpts, confirmRemotePeer, markConnected],
  );

  const scheduleConnectFallback = useCallback(
    (fallbackUid?: number) => {
      clearConnectFallback();
      if (!fallbackUid) return;

      let attempts = 0;
      const maxAttempts = 12;

      const runAttempt = () => {
        connectFallbackTimerRef.current = setTimeout(() => {
          if (callEndedRef.current || remoteConfirmedRef.current) return;
          if (!engineRef.current) return;

          if (!localJoinedRef.current) {
            attempts += 1;
            if (attempts < maxAttempts) {
              runAttempt();
            }
            return;
          }

          logAgoraCall("connect_fallback", {
            fallbackUid,
            channelName,
            attempts,
          });
          handleRemotePresence(engineRef.current, fallbackUid);
        }, attempts === 0 ? 2000 : 1000);
      };

      runAttempt();
    },
    [channelName, clearConnectFallback, handleRemotePresence],
  );

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

  const endCall = useCallback(
    (reason?: EndCallReason) => {
      if (callEndedRef.current) return;
      callEndedRef.current = true;
      connectedPhaseRef.current = false;
      remoteConfirmedRef.current = false;
      localChannelReadyRef.current = false;
      clearRingTimeout();
      clearConnectFallback();
      clearBillingTimer();
      void finalizeBilling();

      const shouldNotifyPeer = Boolean(
        peerId &&
        reason !== "no_answer" &&
        reason !== "declined" &&
        reason !== "remote_ended",
      );
      if (socketRef.current && shouldNotifyPeer) {
        socketRef.current.emit("video_call_end", {
          otherUserId: peerId,
          channelName,
          reason:
            reason === "balance_exhausted" ? "balance_exhausted" : undefined,
        });
      }

      clearCallHandoff(channelName);
      if (params.fromLive === "1") {
        publish("live_call_screen_ended", { role });
      }
      publish("video_call_force_end", {
        channelName,
        reason,
        local: reason !== "remote_ended",
      });

      if (engineRef.current) {
        const eng = engineRef.current;
        const handler = agoraHandlerRef.current;
        engineRef.current = null;
        agoraHandlerRef.current = null;
        void releaseAgoraEngine(eng, { eventHandler: handler });
      }
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setCallPhase("ended");
      if (params.fromLive === "1") {
        exitCallAfterLive(router, { role, sessionId: params.sessionId });
      } else {
        exitCallToHome(router);
      }
    },
    [
      peerId,
      channelName,
      router,
      clearRingTimeout,
      clearConnectFallback,
      clearBillingTimer,
      finalizeBilling,
      params.fromLive,
      params.sessionId,
      role,
    ],
  );

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
            "Balance Low",
            "Insufficient balance for the next minute. Ending the call.",
            [{ text: "OK", onPress: () => endCall("balance_exhausted") }],
          );
        }
      } catch (e) {
        if (isBalanceExhaustedError(e)) {
          clearBillingTimer();
          appAlert(
            "Balance Over",
            "Wallet balance exhausted — ending the video call.",
            [{ text: "OK", onPress: () => endCall("balance_exhausted") }],
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
      if (session.minutesCharged != null)
        setMinutesCharged(session.minutesCharged);
      if (session.totalCharged != null) setTotalCharged(session.totalCharged);
      if (session.sessionId) {
        sessionIdRef.current = session.sessionId;
        setBillingActive(true);
        startBillingLoop();
      }
    } catch (e) {
      if (
        e instanceof ApiError &&
        (e.data as { code?: string })?.code === "INSUFFICIENT_BALANCE"
      ) {
        appAlert(
          "Recharge Required",
          e.message || `Video call costs ₹${ratePerMin}/min.`,
          [{ text: "OK", onPress: () => endCall() }],
        );
        return;
      }
      appAlert(
        "Billing Error",
        e instanceof ApiError ? e.message : "Could not start call billing",
      );
    }
  }, [
    token,
    channelName,
    peerId,
    role,
    startBillingLoop,
    updateUser,
    ratePerMin,
    endCall,
  ]);

  const prepareLocalCallMedia = useCallback(
    (engine: IRtcEngine) => {
      finalizeCallAudioAfterJoin(engine, {
        ...audioOpts(),
        expectedRemoteUid: remoteUidRef.current ?? expectedRemoteUid,
      });
      const subscribeUid = remoteUidRef.current ?? expectedRemoteUid;
      if (subscribeUid) {
        markRemotePeer(engine, subscribeUid, audioOpts());
      }
    },
    [audioOpts, expectedRemoteUid],
  );

  const tryActivateCall = useCallback(
    (engine: IRtcEngine, remoteUserUid?: number) => {
      if (remoteUserUid) {
        handleRemotePresence(engine, remoteUserUid);
        return;
      }

      prepareLocalCallMedia(engine);

      if (localJoinedRef.current) {
        setCallPhase("connecting");
        setLoading(false);
        scheduleConnectFallback(expectedRemoteUid);
      }
    },
    [
      expectedRemoteUid,
      handleRemotePresence,
      prepareLocalCallMedia,
      scheduleConnectFallback,
    ],
  );

  const handleLocalChannelReady = useCallback(
    (engine: IRtcEngine) => {
      if (callEndedRef.current || localChannelReadyRef.current) return;
      localChannelReadyRef.current = true;
      localJoinedRef.current = true;
      setLoading(false);
      setCallPhase((prev) => (prev === "ringing" ? prev : "connecting"));
      configurePublisherAudio(engine, {
        speakerphone: speakerOnRef.current,
      });
      finalizeCallAudioAfterJoin(engine, {
        ...audioOpts(),
        expectedRemoteUid: remoteUidRef.current ?? expectedRemoteUid,
      });
      if (remoteUidRef.current) {
        tryActivateCall(engine, remoteUidRef.current);
      } else {
        tryActivateCall(engine);
      }
    },
    [audioOpts, expectedRemoteUid, tryActivateCall],
  );

  const initAgora = useCallback(async () => {
    if (
      !channelName ||
      !token ||
      !user?.id ||
      engineRef.current ||
      initAgoraInProgressRef.current
    ) {
      console.log("[VideoCall] initAgora skipped", {
        channelName,
        token: Boolean(token),
        userId: user?.id,
        hasEngine: Boolean(engineRef.current),
        inProgress: initAgoraInProgressRef.current,
      });
      return;
    }
    initAgoraInProgressRef.current = true;
    localJoinedRef.current = false;
    localChannelReadyRef.current = false;
    remoteConfirmedRef.current = false;
    connectedPhaseRef.current = false;
    remoteUidRef.current = null;
    setRemoteUid(null);

    try {
      if (!isAgoraNativeLinked) {
        logAgoraCall("init:expo_go_blocked", { channelName });
        setLoading(false);
        setCallPhase("needs_dev_build");
        return;
      }

      logAgoraCall("init:start", {
        channelName,
        role,
        fromLive: params.fromLive === "1",
        peerId,
      });
      if (params.fromLive === "1" || isCallHandoffInProgress()) {
        await waitForAgoraReleaseIdle(800);
        await resetExpoAudioAfterLive();
      } else {
        await hardResetAgoraRtc(200);
      }
      await prepareVoiceCallAudio();
      const perms = await ensureRtcPermissions();
      if (!perms.mic) {
        appAlert(
          "Microphone Required",
          "Allow microphone access so the other person can hear you on this call.",
          [{ text: "OK", onPress: () => endCall() }],
        );
        return;
      }

      const creds = await apiPost<{
        success?: boolean;
        token?: string;
        appId?: string;
        uid?: number;
        error?: string;
      }>("/api/agora/call-token", { channelName, role, peerId }, token);

      // DEBUG: log Agora credential response for troubleshooting
      console.log("[VideoCall] Agora creds response:", {
        success: creds?.success,
        appId: creds?.appId,
        hasToken: Boolean(creds?.token),
        uid: creds?.uid,
        error: creds?.error,
      });

      if (!creds.success || !creds.token || !creds.appId) {
        throw new Error(creds.error || "Could not get call credentials");
      }

      const uid = creds.uid || toAgoraUid(user.id);
      setLocalUid(uid);
      const joinOpts = buildCallJoinOptions({
        ...audioOpts(),
        publishVideo: isVideoMode && camOn,
        subscribeVideo: isVideoMode,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
        clientRoleType: ClientRoleType.ClientRoleBroadcaster,
      });

      const engine = createAgoraRtcEngine();
      engine.initialize({
        appId: creds.appId,
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      const handler = {
        onJoinChannelSuccess: () => {
          logAgoraCall("local_joined", { uid, channelName });
          handleLocalChannelReady(engine);
        },
        onConnectionStateChanged: (
          _conn: unknown,
          state: number,
          reason?: number,
        ) => {
          if (state === ConnectionStateType.ConnectionStateConnected) {
            if (!localChannelReadyRef.current) {
              logAgoraCall("connection_state_connected", { uid, channelName });
            }
            handleLocalChannelReady(engine);
            return;
          }
          if (state === ConnectionStateType.ConnectionStateFailed) {
            logAgoraCall("connection_state_failed", {
              uid,
              channelName,
              reason,
            });
          }
        },
        onUserJoined: (_conn: unknown, remoteUserUid: number) => {
          logAgoraCall("remote_joined", { remoteUserUid, channelName });
          if (offlineGraceRef.current) {
            clearTimeout(offlineGraceRef.current);
            offlineGraceRef.current = null;
          }
          setRemoteCamOn(true);
          tryActivateCall(engine, remoteUserUid);
        },
        onFirstRemoteAudioDecoded: (_conn: unknown, remoteUserUid: number) => {
          handleRemotePresence(engine, remoteUserUid);
        },
        onFirstRemoteAudioFrame: (_conn: unknown, remoteUserUid: number) => {
          handleRemotePresence(engine, remoteUserUid);
        },
        onRemoteAudioStateChanged: (
          _conn: unknown,
          remoteUserUid: number,
          state: number,
        ) => {
          if (shouldConfigureRemoteAudio(state)) {
            handleRemotePresence(engine, remoteUserUid);
          }
        },
        onRemoteVideoStateChanged: (
          _conn: unknown,
          remoteUserUid: number,
          state: number,
        ) => {
          if (isVideoMode && state === 2) {
            handleRemotePresence(engine, remoteUserUid);
          }
        },
        onAudioVolumeIndication: (
          _conn: unknown,
          speakers: Array<{ uid?: number; volume?: number }>,
        ) => {
          if (remoteConfirmedRef.current) return;
          for (const speaker of speakers || []) {
            const speakerUid = speaker?.uid ?? 0;
            if (speakerUid > 0 && (speaker.volume ?? 0) > 0) {
              handleRemotePresence(engine, speakerUid);
              break;
            }
          }
        },
        onUserMuteAudio: (
          _conn: unknown,
          remoteUid: number,
          muted: boolean,
        ) => {
          if (!muted) markRemotePeer(engine, remoteUid, audioOpts());
        },
        onUserMuteVideo: (
          _conn: unknown,
          remoteUid: number,
          muted: boolean,
        ) => {
          if (remoteUid === remoteUidRef.current) setRemoteCamOn(!muted);
        },
        onUserOffline: () => {
          if (offlineGraceRef.current) clearTimeout(offlineGraceRef.current);
          offlineGraceRef.current = setTimeout(() => {
            if (callEndedRef.current) return;
            endCallRef.current("remote_ended");
          }, 1500);
        },
        onError: (err: unknown, msg?: unknown) => {
          console.error("[VideoCall] Agora error:", err, msg);
          logAgoraCall("agora_error", {
            err: String(err),
            msg: String(msg ?? ""),
          });
        },
      };
      agoraHandlerRef.current = handler;
      engine.registerEventHandler(handler);

      engine.enableAudio();
      if (isVideoMode) {
        engine.enableVideo();
        if (params.fromLive !== "1") {
          engine.startPreview();
        } else {
          await new Promise<void>((resolve) => setTimeout(resolve, 350));
          try {
            engine.startPreview();
          } catch (previewErr) {
            console.warn("[VideoCall] startPreview deferred:", previewErr);
          }
        }
      }
      (
        engine as IRtcEngine & {
          enableAudioVolumeIndication?: (
            interval: number,
            smooth: number,
            reportVad: boolean,
          ) => number;
        }
      ).enableAudioVolumeIndication?.(400, 3, true);

      console.log("[VideoCall] joining Agora channel", {
        channelName,
        uid,
        appId: creds.appId,
      });
      const joinResult = engine.joinChannel(
        creds.token,
        channelName,
        uid,
        joinOpts,
      );
      if (typeof joinResult === "number" && joinResult < 0) {
        throw new Error(`Agora join failed (${joinResult})`);
      }
      configurePublisherAudio(engine, { speakerphone: speakerOnRef.current });
      if (!isVideoMode || !camOn) {
        engine.muteLocalVideoStream(!camOn || !isVideoMode);
      }

      engineRef.current = engine;
      trackAgoraEngine(engine);
      scheduleConnectFallback(expectedRemoteUid);
    } catch (e: unknown) {
      const msg =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Call failed";
      const code =
        e instanceof ApiError ? (e.data as { code?: string })?.code : undefined;
      if (code === "FOLLOW_REQUIRED") {
        appAlert("Call Failed", msg || "Could not join this call.", [
          { text: "OK", onPress: () => endCall() },
        ]);
        return;
      }
      if (code === "INSUFFICIENT_BALANCE") {
        appAlert("Recharge Required", msg, [
          { text: "Cancel", style: "cancel", onPress: () => endCall() },
          {
            text: "Add Money",
            onPress: () => router.replace("/profile/wallet" as any),
          },
        ]);
        return;
      }
      appAlert("Call Failed", msg, [{ text: "OK", onPress: () => endCall() }]);
    } finally {
      initAgoraInProgressRef.current = false;
    }
  }, [
    channelName,
    token,
    user?.id,
    role,
    peerId,
    endCall,
    router,
    tryActivateCall,
    audioOpts,
    expectedRemoteUid,
    scheduleConnectFallback,
    isVideoMode,
    camOn,
    params.fromLive,
    prepareLocalCallMedia,
    handleRemotePresence,
    handleLocalChannelReady,
  ]);

  endCallRef.current = endCall;
  initCallBillingRef.current = initCallBilling;
  finalizeBillingRef.current = finalizeBilling;
  initAgoraRef.current = initAgora;
  peerNameRef.current = peerName;
  isCallerRef.current = isCaller;

  useEffect(() => {
    console.log("[VideoCall] mount", {
      channelName,
      role,
      peerId,
      preAccepted,
      isVideoMode,
      fromLive: params.fromLive,
    });

    callEndedRef.current = false;
    localJoinedRef.current = false;
    localChannelReadyRef.current = false;
    remoteConfirmedRef.current = false;
    connectedPhaseRef.current = false;
    remoteUidRef.current = null;
    billingStartedRef.current = false;
    sessionIdRef.current = null;

    if (Platform.OS === "web") {
      appAlert(
        "Mobile Only",
        "1-on-1 video call requires the Android/iOS app with Agora dev build.",
        [{ text: "OK", onPress: () => exitCallToHome(router) }],
      );
      return;
    }

    if (!channelName || !token || !user?.id) {
      appAlert("Error", "Invalid call session", [
        { text: "OK", onPress: () => exitCallToHome(router) },
      ]);
      return;
    }

    const socket = io(API_URL, { transports: ["websocket"], auth: { token } });
    socket.on("connect", () => {
      console.log("[VideoCall] socket connected", {
        channelName,
        userId: user.id,
      });
      socket.emit("join_user", { userId: user.id });
    });
    socket.on("connect_error", (error: unknown) => {
      console.error("[VideoCall] socket connect_error", error);
    });
    socket.on("disconnect", (reason: string) => {
      console.log("[VideoCall] socket disconnected", { reason });
    });
    socket.on("video_call_ended", (data?: { channelName?: string }) => {
      if (data?.channelName && data.channelName !== channelName) return;
      if (!callEndedRef.current) endCallRef.current("remote_ended");
    });
    socket.on("video_call_rejected", () => {
      clearRingTimeout();
      if (!callEndedRef.current) endCallRef.current("declined");
    });
    socket.on(
      "call_gift_received",
      (data?: {
        userId?: string;
        username?: string;
        stickerName?: string;
        channelName?: string;
      }) => {
        if (data?.channelName && data.channelName !== channelName) return;
        if (String(data?.userId) === String(user?.id)) return;
        const label =
          data?.username && data?.stickerName
            ? `${data.username} sent ${data.stickerName}`
            : "Gift received!";
        setGiftBanner(label);
        setTimeout(() => setGiftBanner(null), 3200);
      },
    );
    socket.on("video_call_accepted", (data?: { channelName?: string }) => {
      if (data?.channelName && data.channelName !== channelName) return;
      clearRingTimeout();
      setCallPhase("connecting");
      void initAgoraRef.current();
    });
    socketRef.current = socket;

    if (isCaller && !preAccepted) {
      ringTimeoutRef.current = setTimeout(() => {
        appAlert("No Answer", `${peerNameRef.current} did not answer.`, [
          { text: "OK", onPress: () => endCallRef.current("no_answer") },
        ]);
      }, CALL_RING_TIMEOUT_MS);
    } else {
      setCallPhase("connecting");
      void initAgoraRef.current();
    }

    return () => {
      if (offlineGraceRef.current) {
        clearTimeout(offlineGraceRef.current);
        offlineGraceRef.current = null;
      }
      clearConnectFallback();
      clearRingTimeout();
      clearBillingTimer();
      if (!callEndedRef.current) {
        void finalizeBillingRef.current();
      }
      if (engineRef.current) {
        const eng = engineRef.current;
        const handler = agoraHandlerRef.current;
        engineRef.current = null;
        agoraHandlerRef.current = null;
        void releaseAgoraEngine(eng, { eventHandler: handler });
      }
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [
    channelName,
    token,
    user?.id,
    isCaller,
    preAccepted,
    clearRingTimeout,
    clearBillingTimer,
    clearConnectFallback,
    router,
  ]);

  useEffect(() => {
    const handleAccepted = (...args: unknown[]) => {
      const data = args[0] as { channelName?: string } | undefined;
      if (data?.channelName && data.channelName !== channelName) return;
      clearRingTimeout();
      setCallPhase("connecting");
      void initAgoraRef.current();
    };
    const handleForceEnd = (...args: unknown[]) => {
      const data = args[0] as
        | { channelName?: string; local?: boolean }
        | undefined;
      if (data?.channelName && data.channelName !== channelName) return;
      if (data?.local) return;
      if (!callEndedRef.current) endCallRef.current("remote_ended");
    };
    const unsubAccepted = subscribe("video_call_accepted", handleAccepted, {
      replay: true,
    });
    const unsubForceEnd = subscribe("video_call_force_end", handleForceEnd);
    const unsubReject = subscribe(
      "video_call_rejected",
      () => {
        clearRingTimeout();
        if (!callEndedRef.current) endCallRef.current("declined");
      },
      { replay: true },
    );
    return () => {
      unsubAccepted();
      unsubForceEnd();
      unsubReject();
    };
  }, [channelName, clearRingTimeout]);

  useEffect(() => {
    if (
      callPhase !== "connecting" ||
      engineRef.current ||
      initAgoraInProgressRef.current
    )
      return;
    void initAgoraRef.current();
  }, [callPhase]);

  useEffect(() => {
    if (
      callPhase !== "connecting" ||
      !engineRef.current ||
      !expectedRemoteUid ||
      remoteConfirmedRef.current
    ) {
      return;
    }
    const retrySubscribe = setInterval(() => {
      if (
        callEndedRef.current ||
        remoteConfirmedRef.current ||
        !engineRef.current ||
        !localJoinedRef.current
      ) {
        return;
      }
      handleRemotePresence(engineRef.current, expectedRemoteUid);
    }, 2000);
    return () => clearInterval(retrySubscribe);
  }, [callPhase, expectedRemoteUid, handleRemotePresence]);

  useEffect(() => {
    if (connected || callPhase === "ringing" || needsDevBuild) return;
    const timeout = setTimeout(() => {
      if (callEndedRef.current || remoteUidRef.current) return;
      appAlert(
        "Connection Timeout",
        "Could not connect to the other person. Check your internet and try again.",
        [{ text: "OK", onPress: () => endCallRef.current() }],
      );
    }, 45000);
    return () => clearTimeout(timeout);
  }, [connected, callPhase]);

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
    if (
      needsDevBuild ||
      callPhase === "ringing" ||
      callPhase === "ended" ||
      !engineRef.current
    )
      return;
    const keepAlive = setInterval(() => {
      if (!engineRef.current || callEndedRef.current) return;
      const activeRemoteUid = remoteUidRef.current ?? expectedRemoteUid;
      configurePublisherAudio(engineRef.current, {
        speakerphone: speakerOnRef.current,
      });
      finalizeCallAudioAfterJoin(engineRef.current, {
        ...audioOpts(),
        expectedRemoteUid: activeRemoteUid,
      });
      if (activeRemoteUid) {
        markRemotePeer(engineRef.current, activeRemoteUid, audioOpts());
      }
    }, 3000);
    return () => clearInterval(keepAlive);
  }, [callPhase, needsDevBuild, audioOpts, expectedRemoteUid]);

  const toggleMic = () => {
    setMicOn((prev) => {
      const nextOn = !prev;
      micOnRef.current = nextOn;
      const eng = engineRef.current;
      if (nextOn) {
        finalizeCallAudioAfterJoin(eng, {
          ...audioOpts(),
          micEnabled: true,
          expectedRemoteUid: remoteUidRef.current ?? expectedRemoteUid,
        });
      } else {
        eng?.muteLocalAudioStream(true);
        (
          eng as IRtcEngine & {
            updateChannelMediaOptions?: (o: Record<string, unknown>) => void;
          }
        )?.updateChannelMediaOptions?.(
          buildCallJoinOptions({
            ...audioOpts(),
            micEnabled: false,
            publishVideo: isVideoMode && camOnRef.current,
            subscribeVideo: isVideoMode,
          }),
        );
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
        setDefaultAudioRouteToSpeakerphone?: (
          defaultToSpeaker: boolean,
        ) => void;
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
      <View
        style={[s.ctrlBtn, !active && s.ctrlBtnOff, danger && s.ctrlBtnDanger]}
      >
        <Ionicons name={icon} size={danger ? 30 : 24} color="#FFF" />
      </View>
      <Text style={s.ctrlLabel}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient
        colors={["#0B141A", "#111B21", "#0B141A"]}
        style={StyleSheet.absoluteFill}
      />

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

      {connected && isAgoraNativeLinked && camOn && localUid > 0 && (
        <View style={s.localPip}>
          <RtcSurfaceView style={s.localVideo} canvas={{ uid: localUid }} />
        </View>
      )}

      <LinearGradient
        colors={[
          "rgba(11,20,26,0.15)",
          "rgba(11,20,26,0.75)",
          "rgba(11,20,26,0.95)",
        ]}
        style={s.overlay}
      />

      <View style={s.infoBlock}>
        <Text style={s.callTypeBadge}>
          {isVideoMode ? "Video call" : "Voice call"}
        </Text>
        <Text style={s.peerName}>{peerName}</Text>
        <Text style={[s.statusText, connected && s.statusLive]}>
          {statusText}
        </Text>
        {phaseHint && <Text style={s.phaseHint}>{phaseHint}</Text>}
        {showPreCallUI && isCaller && (
          <Text style={s.rateHint}>
            ₹{ratePerMin}/min
            {beansPerMin ? ` · they earn ${beansPerMin} beans/min` : ""}
          </Text>
        )}
        {connected && isCaller && billingActive && (
          <Text style={s.billingLine}>
            ₹{totalCharged || ratePerMin} charged · ₹{ratePerMin}/min
            {walletBalance != null
              ? ` · bal ₹${walletBalance.toLocaleString("en-IN")}`
              : ""}
          </Text>
        )}
        {connected && !isCaller && beansPerMin != null && (
          <Text style={s.billingLine}>Earning {beansPerMin} beans/min</Text>
        )}
        {needsDevBuild && (
          <Text style={s.devBuildHint}>
            Expo Go mein call/audio kaam nahi karta. Crimzo dev build install
            karo.
          </Text>
        )}
      </View>

      {giftBanner && (
        <View style={s.giftBanner}>
          <Text style={s.giftBannerText}>{giftBanner}</Text>
        </View>
      )}

      <View style={s.controls}>
        {showPreCallUI ? (
          renderControl("call", "Cancel", () => endCall(), true, true)
        ) : (
          <>
            {renderControl(
              speakerOn ? "volume-high" : "volume-mute",
              "Speaker",
              toggleSpeaker,
              speakerOn,
            )}
            {renderControl(micOn ? "mic" : "mic-off", "Mute", toggleMic, micOn)}
            {renderControl("call", "End", () => endCall(), true, true)}
            {isVideoMode &&
              renderControl(
                camOn ? "videocam" : "videocam-off",
                "Video",
                toggleCam,
                camOn,
              )}
            {showGiftsOnCall &&
              renderControl("gift", "Gift", () => setShowGifts(true))}
          </>
        )}
      </View>

      {connected && isVideoMode && camOn && (
        <TouchableOpacity style={s.flipCamBtn} onPress={switchCam}>
          <Ionicons name="camera-reverse" size={22} color="#FFF" />
        </TouchableOpacity>
      )}

      {showGiftsOnCall && token && peerId && (
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
  root: { flex: 1, backgroundColor: "#0B141A" },
  hero: { flex: 1, alignItems: "center", justifyContent: "center" },
  remoteVideo: { ...StyleSheet.absoluteFillObject },
  overlay: { ...StyleSheet.absoluteFillObject },
  avatarRing: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "rgba(37,211,102,0.55)",
  },
  avatarCircle: {
    overflow: "hidden",
    backgroundColor: "#1F2C34",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.12)",
  },
  avatarInitial: { color: "#25D366", fontWeight: "800" },
  localPip: {
    position: "absolute",
    top: 56,
    right: 16,
    width: 108,
    height: 148,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    zIndex: 20,
  },
  localVideo: { flex: 1 },
  infoBlock: {
    position: "absolute",
    top: 72,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 24,
    zIndex: 10,
  },
  callTypeBadge: {
    color: "rgba(37,211,102,0.9)",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  peerName: {
    color: "#FFF",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  statusText: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 18,
    fontWeight: "500",
    marginTop: 8,
  },
  statusLive: { color: "#25D366", fontSize: 20, fontWeight: "600" },
  phaseHint: { color: "rgba(255,255,255,0.45)", fontSize: 13, marginTop: 6 },
  rateHint: {
    color: "rgba(255,215,0,0.85)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 10,
  },
  devBuildHint: {
    color: "rgba(255,180,80,0.95)",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  billingLine: { color: "rgba(255,255,255,0.55)", fontSize: 12, marginTop: 8 },
  giftBanner: {
    position: "absolute",
    top: 200,
    alignSelf: "center",
    zIndex: 30,
    backgroundColor: "rgba(255,215,0,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.45)",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  giftBannerText: { color: "#FFD700", fontSize: 14, fontWeight: "800" },
  controls: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 18,
    paddingBottom: 48,
    paddingTop: 24,
    zIndex: 15,
  },
  ctrlWrap: { alignItems: "center", gap: 8, minWidth: 62 },
  ctrlBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlBtnOff: { backgroundColor: "rgba(255,255,255,0.28)" },
  ctrlBtnDanger: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#E53935",
  },
  ctrlLabel: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    fontWeight: "600",
  },
  flipCamBtn: {
    position: "absolute",
    top: 56,
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
  },
});
