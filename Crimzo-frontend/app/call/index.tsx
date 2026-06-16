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
import { API_URL, apiPost } from '../../lib/apiClient';
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
  const { user, token } = useAuth();
  const params = useLocalSearchParams<{
    channel?: string;
    role?: string;
    peerId?: string;
    peerName?: string;
  }>();

  const channelName = params.channel || '';
  const peerName = params.peerName || 'User';
  const peerId = params.peerId || '';
  const role = params.role || 'caller';

  const engineRef = useRef<IRtcEngine | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [remoteUid, setRemoteUid] = useState<number | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [localUid, setLocalUid] = useState<number>(0);

  const endCall = useCallback(() => {
    if (socketRef.current && peerId) {
      socketRef.current.emit('video_call_end', { otherUserId: peerId, channelName });
    }
    if (engineRef.current) {
      engineRef.current.leaveChannel();
      engineRef.current.release();
      engineRef.current = null;
    }
    socketRef.current?.disconnect();
    router.back();
  }, [peerId, channelName, router]);

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

    let cancelled = false;

    const init = async () => {
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
        }>('/api/agora/call-token', { channelName }, token);

        if (!creds.success || !creds.token || !creds.appId) {
          throw new Error(creds.error || 'Could not get call credentials');
        }

        const uid = creds.uid || toAgoraUid(user.id);
        setLocalUid(uid);

        const socket = io(API_URL, { transports: ['websocket'], auth: { token } });
        socket.on('connect', () => socket.emit('join_user', { userId: user.id }));
        socketRef.current = socket;

        if (!isAgoraNativeLinked) {
          setLoading(false);
          setConnected(true);
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
            if (!cancelled) {
              setConnected(true);
              setLoading(false);
            }
          },
          onUserJoined: (_conn: unknown, remoteUserUid: number) => {
            setRemoteUid(remoteUserUid);
          },
          onUserOffline: () => {
            setRemoteUid(null);
            Alert.alert('Call Ended', `${peerName} left the call`, [
              { text: 'OK', onPress: endCall },
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
        const msg = e instanceof Error ? e.message : 'Call failed';
        Alert.alert('Call Failed', msg, [{ text: 'OK', onPress: () => router.back() }]);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (engineRef.current) {
        engineRef.current.leaveChannel();
        engineRef.current.release();
        engineRef.current = null;
      }
      socketRef.current?.disconnect();
    };
  }, [channelName, token, user?.id, peerName, endCall, router]);

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

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={['#0a0a12', '#1a0a18', '#0a0a12']} style={StyleSheet.absoluteFill} />

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#FF2D55" />
          <Text style={s.statusText}>
            {role === 'caller' ? `Calling ${peerName}...` : 'Connecting...'}
          </Text>
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
                  {connected ? 'Waiting for video...' : 'Connecting...'}
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
            <Text style={s.callSub}>{connected ? 'Live' : 'Connecting...'}</Text>
          </View>
        </>
      )}

      <View style={s.controls}>
        <TouchableOpacity style={s.ctrlBtn} onPress={toggleMic}>
          <Ionicons name={micOn ? 'mic' : 'mic-off'} size={24} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={s.ctrlBtn} onPress={toggleCam}>
          <Ionicons name={camOn ? 'videocam' : 'videocam-off'} size={24} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={s.ctrlBtn} onPress={switchCam}>
          <Ionicons name="camera-reverse" size={24} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={s.endBtn} onPress={endCall}>
          <Ionicons name="call" size={28} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  statusText: { color: 'rgba(255,255,255,0.7)', fontSize: 16, fontWeight: '600' },
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