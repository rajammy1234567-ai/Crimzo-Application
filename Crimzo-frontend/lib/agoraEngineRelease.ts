import type { IRtcEngine } from '../components/agoraImports';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let trackedEngine: IRtcEngine | null = null;

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

/** Leave channel, wait for native teardown, then release the SDK instance. */
export async function releaseAgoraEngine(engine: IRtcEngine | null): Promise<void> {
  if (!engine) return;
  if (trackedEngine === engine) trackedEngine = null;

  try {
    engine.leaveChannel();
  } catch {
    // already left
  }

  await sleep(450);

  try {
    engine.release();
  } catch {
    // already released
  }

  await sleep(250);
}