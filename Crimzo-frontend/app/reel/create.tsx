import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Platform,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { appAlert } from '../../lib/appAlert';
import { uploadReel } from '../../lib/reelUpload';
import type { ReelAudioSelection, ReelSound, ReelVideoAsset } from '../../lib/reelTypes';
import ReelEditor from '../../components/reel/ReelEditor';
import MusicPicker from '../../components/reel/MusicPicker';
import ReelCaptureOverlay from '../../components/reel/ReelCaptureOverlay';
import ReelPermissionGate from '../../components/reel/ReelPermissionGate';
import {
  REEL_MAX_DURATION_SEC,
  REEL_MIN_DURATION_SEC,
} from '../../components/reel/reelStudioTheme';

export default function ReelCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, isGuest } = useAuth();
  const cameraRef = useRef<CameraView>(null);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [torchOn, setTorchOn] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const recordSecondsRef = useRef(0);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordProgress = useRef(new Animated.Value(0)).current;
  const isBusyRef = useRef(false);

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
    if (!isWeb) {
      void ensurePermissions();
    }
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
      return false;
    }
    return true;
  }, [cameraPermission, micPermission, requestCameraPermission, requestMicPermission, isWeb]);

  const resetRecordProgress = () => {
    recordProgress.stopAnimation();
    recordProgress.setValue(0);
  };

  const animateRecordProgress = () => {
    resetRecordProgress();
    Animated.timing(recordProgress, {
      toValue: 1,
      duration: REEL_MAX_DURATION_SEC * 1000,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
  };

  const startRecordTimer = () => {
    recordSecondsRef.current = 0;
    setRecordSeconds(0);
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    recordTimerRef.current = setInterval(() => {
      recordSecondsRef.current += 1;
      setRecordSeconds(recordSecondsRef.current);
      if (recordSecondsRef.current >= REEL_MAX_DURATION_SEC) {
        void stopRecording();
      }
    }, 1000);
    animateRecordProgress();
  };

  const stopRecordTimer = () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    recordProgress.stopAnimation();
  };

  const openEditor = (asset: ReelVideoAsset) => {
    setEditorAsset(asset);
    setShowEditor(true);
  };

  const startRecording = async () => {
    if (recording || isBusyRef.current || isWeb) return;
    const ok = await ensurePermissions();
    if (!ok) {
      appAlert('Permission Required', 'Camera and microphone access are needed to record reels.');
      return;
    }

    isBusyRef.current = true;
    try {
      setRecording(true);
      startRecordTimer();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const result = await cameraRef.current?.recordAsync({ maxDuration: REEL_MAX_DURATION_SEC });
      const elapsed = recordSecondsRef.current;

      stopRecordTimer();
      setRecording(false);

      if (!result?.uri) return;

      if (elapsed < REEL_MIN_DURATION_SEC) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        appAlert(
          'Clip too short',
          `Record at least ${REEL_MIN_DURATION_SEC} seconds for a reel.`,
        );
        return;
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      openEditor({
        uri: result.uri,
        mimeType: 'video/mp4',
        fileName: `reel_${Date.now()}.mp4`,
        duration: elapsed * 1000,
      });
    } catch (e) {
      console.error('Record error:', e);
      stopRecordTimer();
      setRecording(false);
      appAlert('Recording Failed', 'Could not record video. Please try again.');
    } finally {
      isBusyRef.current = false;
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
    if (recording) return;
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
        videoMaxDuration: REEL_MAX_DURATION_SEC,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const durationMs = asset.duration || 0;

      if (durationMs > 0 && durationMs < REEL_MIN_DURATION_SEC * 1000) {
        appAlert(
          'Video too short',
          `Please pick a video at least ${REEL_MIN_DURATION_SEC} seconds long.`,
        );
        return;
      }

      void Haptics.selectionAsync();
      openEditor({
        uri: asset.uri,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        duration: durationMs,
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
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => {
          setUploading(false);
          setUploadDone(false);
          setShowEditor(false);
          setEditorAsset(null);
          router.replace('/(tabs)/reels' as any);
        }, 1400);
      } else {
        throw new Error('Failed to save reel');
      }
    } catch (e: any) {
      console.error('Upload error:', e);
      setUploading(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      appAlert('Upload Failed', e?.message || 'Something went wrong. Please try again.');
    }
  };

  const handleClose = () => {
    if (recording) {
      appAlert('Stop recording?', 'Going back will discard your current clip.', [
        { text: 'Keep Recording', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            void stopRecording();
            router.back();
          },
        },
      ]);
      return;
    }
    router.back();
  };

  const permissionsReady = isWeb || (cameraPermission?.granted && micPermission?.granted);
  const permissionsDenied = !isWeb && cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;
  const showCamera = !isWeb && permissionsReady;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {showCamera ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          videoQuality="1080p"
          enableTorch={torchOn && facing === 'back'}
        />
      ) : isWeb ? (
        <ReelPermissionGate
          variant="web"
          onOpenGallery={pickFromGallery}
          onClose={handleClose}
        />
      ) : permissionsDenied ? (
        <ReelPermissionGate
          variant="permission"
          onGrantPermissions={() => void ensurePermissions()}
          onOpenGallery={pickFromGallery}
          onClose={handleClose}
        />
      ) : !permissionsReady ? (
        <ReelPermissionGate variant="loading" />
      ) : null}

      {showCamera && (
        <ReelCaptureOverlay
          insets={insets}
          recording={recording}
          recordSeconds={recordSeconds}
          recordProgress={recordProgress}
          selectedSound={selectedSound}
          torchOn={torchOn}
          canUseTorch={facing === 'back'}
          canFlipCamera
          onClose={handleClose}
          onFlipCamera={() => {
            setFacing((f) => (f === 'back' ? 'front' : 'back'));
            setTorchOn(false);
          }}
          onToggleTorch={() => setTorchOn((v) => !v)}
          onOpenMusic={() => setShowMusicPicker(true)}
          onOpenGallery={pickFromGallery}
          onRecordPress={() => void (recording ? stopRecording() : startRecording())}
          galleryDisabled={recording}
          recordDisabled={isWeb}
        />
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
});