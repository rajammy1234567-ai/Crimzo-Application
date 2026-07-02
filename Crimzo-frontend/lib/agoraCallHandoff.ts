import type { IRtcEngine } from '../components/agoraImports';
import {
  releaseAgoraEngine,
  releaseTrackedAgoraEngine,
  waitForAgoraReleaseIdle,
} from './agoraEngineRelease';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const UI_SETTLE_MS = 120;

let handoffInProgress = false;
let handoffPromise: Promise<void> | null = null;
let lastHandoffChannel: string | null = null;

type PreviewEngine = IRtcEngine & {
  stopPreview?: () => void;
  disableVideo?: () => void;
};

export function isCallHandoffInProgress(): boolean {
  return handoffInProgress;
}

export function shouldSkipLiveEngineTeardown(): boolean {
  return handoffInProgress;
}

export function clearCallHandoff(channelName?: string): void {
  if (!channelName || lastHandoffChannel === channelName) {
    lastHandoffChannel = null;
  }
  handoffInProgress = false;
}

export function hasNavigatedToCallChannel(channelName: string): boolean {
  return lastHandoffChannel === channelName;
}

/** Tear down live/broadcast Agora before opening the 1-on-1 call screen (prevents native crashes). */
export async function prepareAgoraCallHandoff(
  localEngine?: IRtcEngine | null,
  channelName?: string,
): Promise<boolean> {
  if (channelName && lastHandoffChannel === channelName) {
    return false;
  }

  if (handoffPromise) {
    await handoffPromise;
    return false;
  }

  handoffInProgress = true;
  if (channelName) lastHandoffChannel = channelName;

  handoffPromise = (async () => {
    await sleep(UI_SETTLE_MS);

    const engine = localEngine ?? null;

    if (engine) {
      try {
        (engine as PreviewEngine).stopPreview?.();
      } catch {
        // ignore
      }
      try {
        (engine as PreviewEngine).disableVideo?.();
      } catch {
        // ignore
      }
      await releaseAgoraEngine(engine);
    } else {
      await releaseTrackedAgoraEngine();
    }

    await waitForAgoraReleaseIdle(800);
  })();

  try {
    await handoffPromise;
    return true;
  } finally {
    handoffPromise = null;
  }
}