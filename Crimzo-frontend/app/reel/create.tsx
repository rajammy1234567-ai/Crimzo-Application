import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/appAlert';
import { uploadReel } from '../../lib/reelUpload';
import type { ReelAudioSelection, ReelSound, ReelVideoAsset } from '../../lib/reelTypes';
import ReelEditor from '../../components/reel/ReelEditor';
import MusicPicker from '../../components/reel/MusicPicker';

const MAX_DURATION_SEC = 60;

export default function ReelCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [selectedSound, setSelectedSound] = useState<ReelSound | null>(null);
  const [showMusicPicker, setShowMusicPicker] = useState(false);

  const [editorAsset, setEditorAsset] = useState<ReelVideoAsset | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadDone, setUploadDone] = useState(false);

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (!token || isGuest) {
      appAlert('Login Required', 'Please log in to create reels.');
      router.back();
    }
  }, [token, isGuest, router]);

  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    };
  }, []);

  const ensurePermissions = useCallback(async () => {
    if (isWeb) return true;

    let cam = cameraPermission?.granted;
    if (!cam) {
      const res = await requestCameraPermission();
      cam = res.granted;
    }
    let mic = micPermission?.granted;
    if (!mic) {
      const res = await requestMicPermission();
      mic = res.granted;
    }

    if (!cam || !mic) {
      appAlert('Permission Required', 'Camera and microphone access are needed to record reels.');
      return false;
    }
    return true;
  }, [cameraPermission, micPermission, requestCameraPermission, requestMicPermission, isWeb]);

  const startRecordTimer = () => {
    setRecordSeconds(0);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = setInterval(() => {
      setRecordSeconds((s) => {
        if (s + 1 >= MAX_DURATION_SEC) {
          void stopRecording();
        }
        return s + 1;
      });
    }, 1000);
  };

  const stopRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  };

  const openEditor = (asset: ReelVideoAsset) => {
    setEditorAsset(asset);
    setShowEditor(true);
  };

  const startRecording = async () => {
    if (recording) return;
    const ok = await ensurePermissions();
    if (!ok || isWeb) return;

    try {
      setRecording(true);
      startRecordTimer();
      const result = await cameraRef.current?.recordAsync({ maxDuration: MAX_DURATION_SEC });
      stopRecordTimer();
      setRecording(false);

      if (result?.uri) {
        openEditor({
          uri: result.uri,
          mimeType: 'video/mp4',
          fileName: `reel_${Date.now()}.mp4`,
          duration: recordSeconds * 1000,
        });
      }
    } catch (e) {
      console.error('Record error:', e);
      stopRecordTimer();
      setRecording(false);
      appAlert('Recording Failed', 'Could not record video. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    try {
      cameraRef.current?.stopRecording();
    } catch (e) {
      console.error('Stop record error:', e);
    }
  };

  const pickFromGallery = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        appAlert('Permission Required', 'Please grant gallery access to upload reels.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: MAX_DURATION_SEC,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      openEditor({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        duration: asset.duration,
      });
    } catch (e) {
      console.error('Gallery pick error:', e);
      appAlert('Error', 'Failed to pick video from gallery.');
    }
  };

  const handlePost = async (caption: string, audio: ReelAudioSelection | null) => {
    if (!editorAsset) return;
    setUploading(true);
    setUploadProgress(10);
    setUploadDone(false);

    try {
      const response = await uploadReel({
        asset: editorAsset,
        caption,
        token,
        audio: audio || (selectedSound ? { sound: selectedSound, startMs: 0 } : null),
        onProgress: setUploadProgress,
      });

      if (response.success) {
        setUploadProgress(100);
        setUploadDone(true);
        setTimeout(() => {
          setUploading(false);
          setUploadDone(false);
          setShowEditor(false);
          setEditorAsset(null);
          appAlert('Reel Posted!', 'Your reel is now live for everyone to see.');
          router.replace('/(tabs)/reels' as any);
        }, 1200);
      } else {
        throw new Error('Failed to save reel');
      }
    } catch (e: any) {
      console.error('Upload error:', e);
      setUploading(false);
      appAlert('Upload Failed', e?.message || 'Something went wrong. Please try again.');
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const permissionsReady = isWeb || (cameraPermission?.granted && micPermission?.granted);
  const permissionsDenied = !isWeb && cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      {!isWeb && permissionsReady ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          videoQuality="720p"
        />
      ) : (
        <View style={styles.fallbackBg}>
          <Ionicons name="videocam-outline" size={72} color="rgba(255,255,255,0.2)" />
          <Text style={styles.fallbackTitle}>
            {isWeb ? 'Record on mobile app' : 'Camera access needed'}
          </Text>
          <Text style={styles.fallbackSub}>
            {isWeb
              ? 'Use gallery upload here, or open Crimzo on your phone to record reels.'
              : 'Allow camera access to record, or pick a video from gallery.'}
          </Text>
          {permissionsDenied && (
            <TouchableOpacity style={styles.permBtn} onPress={() => void ensurePermissions()}>
              <Text style={styles.permBtnText}>Grant Permissions</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.topBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={28} color="#FFF" />
        </TouchableOpacity>

        {recording && (
          <View style={styles.recordingBadge}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>{formatTimer(recordSeconds)}</Text>
          </View>
        )}

        {!isWeb && permissionsReady && (
          <TouchableOpacity
            style={styles.topBtn}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          >
            <Ionicons name="camera-reverse" size={26} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        style={[styles.musicPill, { top: insets.top + 60 }]}
        onPress={() => setShowMusicPicker(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="musical-notes" size={16} color="#FFF" />
        <Text style={styles.musicPillText} numberOfLines={1}>
          {selectedSound ? `${selectedSound.title}` : 'Add a song'}
        </Text>
      </TouchableOpacity>

      <View style={[styles.bottomControls, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity style={styles.sideBtn} onPress={pickFromGallery}>
          <Ionicons name="images" size={28} color="#FFF" />
          <Text style={styles.sideBtnText}>Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.recordBtn, recording && styles.recordBtnActive]}
          onPress={recording ? () => void stopRecording() : () => void startRecording()}
          disabled={isWeb}
        >
          {recording ? (
            <View style={styles.recordStop} />
          ) : (
            <View style={styles.recordInner} />
          )}
        </TouchableOpacity>

        <View style={styles.sideBtn}>
          <Text style={styles.maxDurText}>Max {MAX_DURATION_SEC}s</Text>
        </View>
      </View>

      {!permissionsReady && !isWeb && !permissionsDenied && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#9333EA" />
          <Text style={styles.loadingText}>Preparing camera...</Text>
        </View>
      )}

      <MusicPicker
        visible={showMusicPicker}
        token={token}
        selectedId={selectedSound?.id}
        onClose={() => setShowMusicPicker(false)}
        onSelect={setSelectedSound}
      />

      <ReelEditor
        visible={showEditor}
        asset={editorAsset}
        token={token}
        initialSound={selectedSound}
        uploading={uploading}
        uploadProgress={uploadProgress}
        uploadDone={uploadDone}
        onClose={() => {
          if (!uploading) {
            setShowEditor(false);
            setEditorAsset(null);
          }
        }}
        onPost={handlePost}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  fallbackBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0F',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  fallbackTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 20 },
  fallbackSub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  permBtn: {
    marginTop: 20,
    backgroundColor: '#9333EA',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  permBtnText: { color: '#FFF', fontWeight: '700' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 10,
  },
  topBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,45,85,0.9)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  recText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  musicPill: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    maxWidth: '80%',
    zIndex: 10,
  },
  musicPillText: { color: '#FFF', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 24,
    zIndex: 10,
  },
  sideBtn: { alignItems: 'center', width: 72 },
  sideBtnText: { color: '#FFF', fontSize: 11, marginTop: 4, fontWeight: '600' },
  maxDurText: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '600' },
  recordBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtnActive: { borderColor: '#FF2D55' },
  recordInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FF2D55',
  },
  recordStop: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#FF2D55',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: { color: '#FFF', fontSize: 14 },
});