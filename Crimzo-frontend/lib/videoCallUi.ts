export const CALL_RING_TIMEOUT_MS = 45000;

export type CallPhase = 'connecting' | 'ringing' | 'connected' | 'ended';

export function callStatusLabel(phase: CallPhase, peerName: string): string {
  switch (phase) {
    case 'ringing':
      return `Calling ${peerName}...`;
    case 'connected':
      return `Live · ${peerName}`;
    case 'ended':
      return 'Call ended';
    default:
      return 'Connecting...';
  }
}