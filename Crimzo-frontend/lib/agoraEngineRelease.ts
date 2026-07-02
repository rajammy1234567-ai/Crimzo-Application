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
};

/** Leave channel, wait for native teardown, then release the SDK instance. */
export async function releaseAgoraEngine(engine: IRtcEngine | null): Promise<void> {
  if (!engine) return;
  await enqueueRelease(async () => {
    if (trackedEngine === engine) trackedEngine = null;

    try {
      (engine as EngineWithPreview).stopPreview?.();
    } catch {
      // already stopped
    }
    try {
      (engine as EngineWithPreview).disableVideo?.();
    } catch {
      // ignore
    }
    try {
      engine.leaveChannel();
    } catch {
      // already left
    }

    await sleep(550);

    try {
      engine.release();
    } catch {
      // already released
    }

    await sleep(450);
  });
}