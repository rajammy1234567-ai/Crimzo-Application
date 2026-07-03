import type { IRtcEngine } from '../components/agoraImports';
import {
  hardResetAgoraRtc,
  releaseAgoraEngine,
} from './agoraEngineRelease';
import { prepareVoiceCallAudio, resetExpoAudioAfterLive } from './agoraRtcHelpers';
import { logAgoraCall } from './agoraCallDiagnostics';

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
    logAgoraCall('handoff:start', { channelName, hasLocalEngine: !!localEngine });
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
      await releaseAgoraEngine(engine, { settleMs: 700 });
    }

    // Always drain tracked/live engines — never reuse live RTC for private call.
    await hardResetAgoraRtc(900);
    await resetExpoAudioAfterLive();
    await prepareVoiceCallAudio();
    logAgoraCall('handoff:ready', { channelName });
  })();

  try {
    await handoffPromise;
    return true;
  } finally {
    handoffPromise = null;
  }
}