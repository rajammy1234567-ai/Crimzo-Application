import type { Router } from 'expo-router';

export const CALL_RING_TIMEOUT_MS = 45000;

export type CallPhase = 'connecting' | 'ringing' | 'connected' | 'ended' | 'needs_dev_build';

export type EndCallReason = 'balance_exhausted' | 'no_answer' | 'declined' | 'remote_ended';

/** Leave call UI and land both users on the home tab. */
export function exitCallToHome(router: Router) {
  try {
    if (router.canDismiss?.()) {
      router.dismissAll();
    }
  } catch {
    // navigation stack may already be at root
  }
  router.replace('/(tabs)/home');
}

type ExitLiveCallOptions = {
  role?: string;
  sessionId?: string;
};

/** After a live private call, return viewer/host to their live screen when possible. */
export function exitCallAfterLive(router: Router, options: ExitLiveCallOptions = {}) {
  const sessionId = String(options.sessionId || '').trim();
  if (sessionId) {
    if (options.role === 'caller') {
      router.replace(`/live/watch?sessionId=${encodeURIComponent(sessionId)}` as never);
      return;
    }
    router.replace('/live/broadcast' as never);
    return;
  }
  exitCallToHome(router);
}

export function formatCallDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function callStatusLabel(phase: CallPhase, peerName: string, elapsedSec = 0): string {
  switch (phase) {
    case 'ringing':
      return 'Ringing...';
    case 'connected':
      return formatCallDuration(elapsedSec);
    case 'ended':
      return 'Call ended';
    case 'needs_dev_build':
      return 'Dev build required';
    default:
      return 'Connecting...';
  }
}

export function callPhaseHint(phase: CallPhase, isCaller: boolean): string | null {
  if (phase === 'ringing') {
    return isCaller ? 'Waiting for answer' : 'Incoming call';
  }
  if (phase === 'connecting') {
    return 'Waiting for the other person to join';
  }
  if (phase === 'connected') {
    return 'End-to-end encrypted';
  }
  if (phase === 'needs_dev_build') {
    return 'Install the Crimzo dev build for real voice/video calls';
  }
  return null;
}