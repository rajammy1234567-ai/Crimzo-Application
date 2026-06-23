import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import {
  giftPopWavBase64,
  messageReceiveWavBase64,
  messageSendWavBase64,
} from './uiSoundAssets';

type SoundKind = 'messageSend' | 'messageReceive' | 'gift';

const SOURCES: Record<SoundKind, string> = {
  messageSend: `data:audio/wav;base64,${messageSendWavBase64}`,
  messageReceive: `data:audio/wav;base64,${messageReceiveWavBase64}`,
  gift: `data:audio/wav;base64,${giftPopWavBase64}`,
};

let audioReady = false;
const soundCache: Partial<Record<SoundKind, Audio.Sound>> = {};
const playing: Partial<Record<SoundKind, boolean>> = {};

async function ensureAudioMode() {
  if (audioReady) return;
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioReady = true;
}

async function loadSound(kind: SoundKind): Promise<Audio.Sound> {
  const cached = soundCache[kind];
  if (cached) return cached;
  const { sound } = await Audio.Sound.createAsync(
    { uri: SOURCES[kind] },
    {
      volume: kind === 'gift' ? 0.72 : 0.62,
      shouldPlay: false,
    },
  );
  soundCache[kind] = sound;
  return sound;
}

async function play(
  kind: SoundKind,
  haptic: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
) {
  if (playing[kind]) return;
  playing[kind] = true;
  try {
    await ensureAudioMode();
    void Haptics.impactAsync(haptic);
    const sound = await loadSound(kind);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Ignore — sound is optional UX polish
  } finally {
    setTimeout(() => { playing[kind] = false; }, kind === 'gift' ? 220 : 120);
  }
}

/** Outgoing chat message — short pop */
export function playMessageSendPop() {
  void play('messageSend', Haptics.ImpactFeedbackStyle.Light);
}

/** Incoming chat message — soft pop */
export function playMessageReceivePop() {
  void play('messageReceive', Haptics.ImpactFeedbackStyle.Medium);
}

/** Gift / sticker sent or received — richer pop */
export function playGiftPop() {
  void play('gift', Haptics.ImpactFeedbackStyle.Heavy);
}