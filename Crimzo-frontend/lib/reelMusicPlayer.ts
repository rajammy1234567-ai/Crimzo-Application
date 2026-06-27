import { Audio } from 'expo-av';

let activeSound: Audio.Sound | null = null;
let loadGeneration = 0;

export async function stopReelMusic(): Promise<void> {
  loadGeneration += 1;
  const sound = activeSound;
  activeSound = null;
  if (!sound) return;
  try {
    await sound.stopAsync();
    await sound.unloadAsync();
  } catch {
    // ignore
  }
}

type PlayOptions = {
  url: string;
  loop?: boolean;
  volume?: number;
  onFinish?: () => void;
};

/** Only one reel music stream at a time — switching songs stops the previous track. */
export async function playReelMusic({
  url,
  loop = true,
  volume = 1,
  onFinish,
}: PlayOptions): Promise<void> {
  await stopReelMusic();
  const generation = loadGeneration;

  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });

  const { sound } = await Audio.Sound.createAsync(
    { uri: url },
    { shouldPlay: true, isLooping: loop, volume },
  );

  if (generation !== loadGeneration) {
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
    return;
  }

  if (onFinish) {
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        onFinish();
      }
    });
  }

  activeSound = sound;
}

export function isReelMusicPlaying(): boolean {
  return activeSound != null;
}