import type { IRtcEngine } from '../components/agoraImports';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let trackedEngine: IRtcEngine | null = null;
let releaseChain: Promise<void> = Promise.resolve();

function enqueueRelease(task: () => Promise<void>): Promise<void> {
  const next = releaseChain.then(task).catch(() => {});
  releaseChain = next;
  return next;
}

/** Wait until all queued Agora releases finish (prevents native crash on second createAgoraRtcEngine). */
export async function waitForAgoraReleaseIdle(extraSettleMs = 450): Promise<void> {
  await releaseChain;
  if (extraSettleMs > 0) await sleep(extraSettleMs);
}

/** Remember the active native RTC engine so it can be torn down before starting a call. */
export function trackAgoraEngine(engine: IRtcEngine | null) {
  trackedEngine = engine;
}

/** Release whichever engine was last tracked (e.g. live stream before 1-on-1 call). */
export async function releaseTrackedAgoraEngine(): Promise<void> {
  const eng = trackedEngine;
  trackedEngine = null;
  await releaseAgoraEngine(eng);
}

type EngineWithPreview = IRtcEngine & {
  stopPreview?: () => void;
  disableVideo?: () => void;
  disableAudio?: () => void;
  muteLocalAudioStream?: (mute: boolean) => void;
  muteLocalVideoStream?: (mute: boolean) => void;
  unregisterEventHandler?: (handler?: unknown) => void;
};

/** Leave channel, wait for native teardown, then release the SDK instance. */
export async function releaseAgoraEngine(
  engine: IRtcEngine | null,
  options?: { eventHandler?: unknown; settleMs?: number },
): Promise<void> {
  if (!engine) return;
  const settleMs = options?.settleMs ?? 450;
  await enqueueRelease(async () => {
    if (trackedEngine === engine) trackedEngine = null;

    const eng = engine as EngineWithPreview;

    try {
      eng.unregisterEventHandler?.(options?.eventHandler);
    } catch {
      // ignore
    }
    try {
      eng.stopPreview?.();
    } catch {
      // already stopped
    }
    try {
      eng.muteLocalAudioStream?.(true);
      eng.muteLocalVideoStream?.(true);
    } catch {
      // ignore
    }
    try {
      eng.disableVideo?.();
      eng.disableAudio?.();
    } catch {
      // ignore
    }
    try {
      engine.leaveChannel();
    } catch {
      // already left
    }

    await sleep(650);

    try {
      engine.release();
    } catch {
      // already released
    }

    await sleep(settleMs);
  });
}

/** Hard reset: release tracked engine and wait for native queue to drain. */
export async function hardResetAgoraRtc(extraSettleMs = 600): Promise<void> {
  await releaseTrackedAgoraEngine();
  await waitForAgoraReleaseIdle(extraSettleMs);
}