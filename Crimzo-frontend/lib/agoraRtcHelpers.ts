import { Platform, PermissionsAndroid } from 'react-native';
import { Audio } from 'expo-av';
import type { IRtcEngine } from '../components/agoraImports';

/** Request mic (required) + camera before joining an RTC channel. */
export async function ensureRtcPermissions(): Promise<{ mic: boolean; camera: boolean }> {
  if (Platform.OS === 'android') {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    ]);
    const mic = result[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;
    const camera = result[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED;
    return { mic, camera };
  }

  if (Platform.OS === 'ios') {
    const { status } = await Audio.requestPermissionsAsync();
    const mic = status === 'granted';
    return { mic, camera: true };
  }

  return { mic: true, camera: true };
}

/** Ensure local microphone is published and routed to speaker on calls. */
export function configurePublisherAudio(engine: IRtcEngine | null, options?: { speakerphone?: boolean }) {
  if (!engine) return;
  const eng = engine as IRtcEngine & {
    enableLocalAudio?: (enabled: boolean) => void;
    setEnableSpeakerphone?: (enabled: boolean) => void;
    adjustRecordingSignalVolume?: (volume: number) => void;
  };

  try {
    eng.enableLocalAudio?.(true);
    eng.muteLocalAudioStream?.(false);
    eng.adjustRecordingSignalVolume?.(100);
    if (options?.speakerphone !== false) {
      eng.setEnableSpeakerphone?.(true);
    }
  } catch (err) {
    console.warn('[Agora] configurePublisherAudio failed:', err);
  }
}