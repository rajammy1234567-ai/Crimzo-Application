import { Platform, PermissionsAndroid } from 'react-native';
import { Audio } from 'expo-av';
import type { IRtcEngine } from '../components/agoraImports';
import {
  AudioProfileType,
  AudioScenarioType,
  RemoteAudioState,
} from '../components/agoraImports';

type EngineAudioApi = IRtcEngine & {
  setClientRole?: (role: number) => void;
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
      interruptionModeAndroid: 1,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
  } catch (err) {
    console.warn('[Agora] prepareVoiceCallAudio failed:', err);
  }
}

/** Drop live-playback audio session before starting a 2-way call (Expo ↔ Agora handoff). */
export async function resetExpoAudioAfterLive(): Promise<void> {
  try {
    await Audio.setIsEnabledAsync(true);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      interruptionModeIOS: 1,
      interruptionModeAndroid: 1,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    await sleep(80);
  } catch (err) {
    console.warn('[Agora] resetExpoAudioAfterLive failed:', err);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type CallMediaOptions = {
  speakerphone?: boolean;
  publishVideo?: boolean;
  subscribeVideo?: boolean;
  micEnabled?: boolean;
  expectedRemoteUid?: number;
};

/** Channel media options for 1-on-1 Communication profile calls. */
export function buildCallJoinOptions(options: CallMediaOptions = {}) {
  const micEnabled = options.micEnabled !== false;
  const publishVideo = !!options.publishVideo;
  const subscribeVideo = options.subscribeVideo ?? publishVideo;
  return {
    publishMicrophoneTrack: micEnabled,
    publishCameraTrack: publishVideo,
    autoSubscribeAudio: true,
    autoSubscribeVideo: subscribeVideo,
  };
}

/** Apply Agora audio profile tuned for 1-on-1 calls (publish + subscribe). */
export function configureCallAudioEngine(
  engine: IRtcEngine | null,
  options?: { speakerphone?: boolean },
) {
  if (!engine) return;
  const eng = engine as EngineAudioApi;

  try {
    const scenario = AudioScenarioType.AudioScenarioChatroom
      ?? (AudioScenarioType as { AudioScenarioDefault?: number }).AudioScenarioDefault;
    eng.setAudioProfile?.(
      AudioProfileType.AudioProfileSpeechStandard,
      scenario,
    );
    eng.setAudioScenario?.(scenario);
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

type ChannelMediaEngine = IRtcEngine & {
  updateChannelMediaOptions?: (options: Record<string, unknown>) => number;
};

/** After joining a 1-on-1 call channel, force broadcaster role + mic publish + remote subscribe. */
export function finalizeCallAudioAfterJoin(
  engine: IRtcEngine | null,
  options?: CallMediaOptions,
) {
  if (!engine) return;
  const eng = engine as EngineAudioApi & ChannelMediaEngine;
  const micEnabled = options?.micEnabled !== false;

  try {
    eng.enableAudio?.();
    eng.enableLocalAudio?.(micEnabled);
    eng.muteLocalAudioStream?.(!micEnabled);
    if (micEnabled) {
      configureCallAudioEngine(engine, { speakerphone: options?.speakerphone });
    } else {
      const engAudio = engine as EngineAudioApi;
      engAudio.muteAllRemoteAudioStreams?.(false);
      engAudio.adjustPlaybackSignalVolume?.(100);
      if (options?.speakerphone !== false) {
        engAudio.setEnableSpeakerphone?.(true);
        engAudio.setDefaultAudioRouteToSpeakerphone?.(true);
      }
    }
    eng.updateChannelMediaOptions?.(buildCallJoinOptions(options));
    if (options?.expectedRemoteUid) {
      configureRemoteSubscriber(engine, options.expectedRemoteUid);
    }
  } catch (err) {
    console.warn('[Agora] finalizeCallAudioAfterJoin failed:', err);
  }
}

export function markRemotePeer(
  engine: IRtcEngine | null,
  remoteUid: number,
  options?: { speakerphone?: boolean; publishVideo?: boolean; micEnabled?: boolean },
): void {
  if (!remoteUid) return;
  finalizeCallAudioAfterJoin(engine, {
    ...options,
    expectedRemoteUid: remoteUid,
  });
  configureRemoteSubscriber(engine, remoteUid);
}