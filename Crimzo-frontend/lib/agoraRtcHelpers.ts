import { Platform, PermissionsAndroid } from 'react-native';
import { Audio } from 'expo-av';
import type { IRtcEngine } from '../components/agoraImports';
import {
  AudioProfileType,
  AudioScenarioType,
  RemoteAudioState,
} from '../components/agoraImports';

type EngineAudioApi = IRtcEngine & {
  enableLocalAudio?: (enabled: boolean) => void;
  setEnableSpeakerphone?: (enabled: boolean) => void;
  setDefaultAudioRouteToSpeakerphone?: (defaultToSpeaker: boolean) => void;
  adjustRecordingSignalVolume?: (volume: number) => void;
  adjustPlaybackSignalVolume?: (volume: number) => void;
  setAudioProfile?: (profile: number, scenario?: number) => number;
  setAudioScenario?: (scenario: number) => number;
  muteAllRemoteAudioStreams?: (mute: boolean) => number;
  muteRemoteAudioStream?: (uid: number, mute: boolean) => void;
  muteRemoteVideoStream?: (uid: number, mute: boolean) => void;
};

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

/** Configure iOS/Android audio session for two-way voice calls. */
export async function prepareVoiceCallAudio(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: 1,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
  } catch (err) {
    console.warn('[Agora] prepareVoiceCallAudio failed:', err);
  }
}

/** Apply Agora audio profile tuned for 1-on-1 calls (publish + subscribe). */
export function configureCallAudioEngine(
  engine: IRtcEngine | null,
  options?: { speakerphone?: boolean },
) {
  if (!engine) return;
  const eng = engine as EngineAudioApi;

  try {
    eng.setAudioProfile?.(
      AudioProfileType.AudioProfileSpeechStandard,
      AudioScenarioType.AudioScenarioChatroom,
    );
    eng.setAudioScenario?.(AudioScenarioType.AudioScenarioChatroom);
    eng.muteAllRemoteAudioStreams?.(false);
    eng.adjustPlaybackSignalVolume?.(100);
    configurePublisherAudio(engine, options);
  } catch (err) {
    console.warn('[Agora] configureCallAudioEngine failed:', err);
  }
}

/** Ensure local microphone is published and routed to speaker on calls. */
export function configurePublisherAudio(engine: IRtcEngine | null, options?: { speakerphone?: boolean }) {
  if (!engine) return;
  const eng = engine as EngineAudioApi;

  try {
    eng.enableLocalAudio?.(true);
    eng.muteLocalAudioStream?.(false);
    eng.adjustRecordingSignalVolume?.(100);
    if (options?.speakerphone !== false) {
      eng.setEnableSpeakerphone?.(true);
      eng.setDefaultAudioRouteToSpeakerphone?.(true);
    } else {
      eng.setEnableSpeakerphone?.(false);
      eng.setDefaultAudioRouteToSpeakerphone?.(false);
    }
  } catch (err) {
    console.warn('[Agora] configurePublisherAudio failed:', err);
  }
}

/** Ensure remote peer audio/video is subscribed and audible. */
export function configureRemoteSubscriber(engine: IRtcEngine | null, remoteUid: number) {
  if (!engine || !remoteUid) return;
  const eng = engine as EngineAudioApi;

  try {
    eng.muteAllRemoteAudioStreams?.(false);
    eng.muteRemoteAudioStream?.(remoteUid, false);
    eng.muteRemoteVideoStream?.(remoteUid, false);
    eng.adjustPlaybackSignalVolume?.(100);
    eng.setDefaultAudioRouteToSpeakerphone?.(true);
  } catch (err) {
    console.warn('[Agora] configureRemoteSubscriber failed:', err);
  }
}

/** Re-apply remote audio when Agora reports the peer is sending audio. */
export function shouldConfigureRemoteAudio(state: number): boolean {
  return state === RemoteAudioState.RemoteAudioStateStarting
    || state === RemoteAudioState.RemoteAudioStateDecoding;
}