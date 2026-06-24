import type { Router } from 'expo-router';

export const CALL_RING_TIMEOUT_MS = 45000;

export type CallPhase = 'connecting' | 'ringing' | 'connected' | 'ended';

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
    default:
      return 'Connecting...';
  }
}

export function callPhaseHint(phase: CallPhase, isCaller: boolean): string | null {
  if (phase === 'ringing') {
    return isCaller ? 'Waiting for answer' : 'Incoming call';
  }
  if (phase === 'connecting') {
    return 'Setting up secure connection';
  }
  if (phase === 'connected') {
    return 'End-to-end encrypted';
  }
  return null;
}