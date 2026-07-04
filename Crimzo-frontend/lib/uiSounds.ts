import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { giftSplashTier } from './giftSplash';

type SoundKind =
  | 'messageSend'
  | 'messageReceive'
  | 'gift'
  | 'giftSend'
  | 'giftReceive'
  | 'giftMega';

// Lazy-load the heavy 162KB base64 assets only when first sound is actually played
let _sources: Record<SoundKind, string> | null = null;
function getSources(): Record<SoundKind, string> {
  if (_sources) return _sources;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const assets = require('./uiSoundAssets');
  _sources = {
    messageSend: `data:audio/wav;base64,${assets.messageSendWavBase64}`,
    messageReceive: `data:audio/wav;base64,${assets.messageReceiveWavBase64}`,
    gift: `data:audio/wav;base64,${assets.giftPopWavBase64}`,
    giftSend: `data:audio/wav;base64,${assets.giftSendWavBase64}`,
    giftReceive: `data:audio/wav;base64,${assets.giftReceiveWavBase64}`,
    giftMega: `data:audio/wav;base64,${assets.giftMegaWavBase64}`,
  };
  return _sources;
}

const VOLUMES: Record<SoundKind, number> = {
  messageSend: 0.62,
  messageReceive: 0.68,
  gift: 0.78,
  giftSend: 0.88,
  giftReceive: 0.9,
  giftMega: 0.95,
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
  const sources = getSources();
  const { sound } = await Audio.Sound.createAsync(
    { uri: sources[kind] },
    { volume: VOLUMES[kind], shouldPlay: false },
  );
  soundCache[kind] = sound;
  return sound;
}

async function play(
  kind: SoundKind,
  haptic: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light,
  cooldownMs?: number,
) {
  if (playing[kind]) return;
  playing[kind] = true;
  const cooldown = cooldownMs ?? (kind.startsWith('gift') ? 480 : 120);
  try {
    await ensureAudioMode();
    void Haptics.impactAsync(haptic);
    const sound = await loadSound(kind);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Optional UX polish
  } finally {
    setTimeout(() => { playing[kind] = false; }, cooldown);
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

/** Legacy gift pop */
export function playGiftPop() {
  void play('gift', Haptics.ImpactFeedbackStyle.Heavy, 420);
}

/** Full-screen gift splash — tiered fanfare for send vs receive */
export function playGiftSplashSound(
  variant: 'sent' | 'received' = 'received',
  diamonds?: number,
) {
  const tier = giftSplashTier(diamonds);
  if (tier === 'mega') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    void play('giftMega', Haptics.ImpactFeedbackStyle.Heavy, 900);
    return;
  }
  if (variant === 'sent') {
    void play('giftSend', Haptics.ImpactFeedbackStyle.Medium, 520);
    return;
  }
  void play('giftReceive', Haptics.ImpactFeedbackStyle.Heavy, 480);
}