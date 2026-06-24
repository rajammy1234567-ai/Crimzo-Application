import { sameUserId } from './agoraUid';

export type PkBattleCardData = {
  status?: string;
  host1_id?: string | null;
  host2_id?: string | null;
  host1_username?: string | null;
  host2_username?: string | null;
  host1_score?: number;
  host2_score?: number;
  winner_id?: string | null;
  winner_username?: string | null;
  remainingSeconds?: number;
  ended_at?: string | Date | null;
};

function normalizeUserId(id: unknown): string | null {
  if (id == null) return null;
  if (typeof id === 'object' && id !== null && '_id' in id) {
    return String((id as { _id: unknown })._id);
  }
  return String(id);
}

export type PkBattleDisplayStatus = 'waiting' | 'active' | 'ended';

/** UI status — treats timer-expired active battles as ended */
export function getPkBattleDisplayStatus(battle: PkBattleCardData): PkBattleDisplayStatus {
  if (battle.status === 'ended' || battle.ended_at) return 'ended';
  if (battle.status === 'active') {
    const remaining = battle.remainingSeconds;
    if (typeof remaining === 'number' && remaining <= 0) return 'ended';
  }
  if (battle.status === 'waiting') return 'waiting';
  if (battle.status === 'active') return 'active';
  return 'waiting';
}

/** Winner = most gifts (score); uses winner_id when set, else highest score */
export function isPkBattleWinner(battle: PkBattleCardData, side: 'host1' | 'host2'): boolean {
  if (getPkBattleDisplayStatus(battle) !== 'ended') return false;

  const hostId = side === 'host1' ? battle.host1_id : battle.host2_id;
  if (battle.winner_id && hostId) {
    const winnerId = normalizeUserId(battle.winner_id);
    const host = normalizeUserId(hostId);
    if (winnerId && host) return winnerId === host;
    return sameUserId(battle.winner_id, hostId);
  }

  const h1 = Number(battle.host1_score) || 0;
  const h2 = Number(battle.host2_score) || 0;
  if (h1 === h2) return false;
  return side === 'host1' ? h1 > h2 : h2 > h1;
}

export function getPkBattleWinnerSide(battle: PkBattleCardData): 'host1' | 'host2' | null {
  if (getPkBattleDisplayStatus(battle) !== 'ended') return null;
  if (isPkBattleWinner(battle, 'host1')) return 'host1';
  if (isPkBattleWinner(battle, 'host2')) return 'host2';
  return null;
}

export function getPkBattleWinnerLabel(battle: PkBattleCardData): string | null {
  const side = getPkBattleWinnerSide(battle);
  if (!side) return null;
  if (battle.winner_username) return battle.winner_username;
  if (side === 'host1') return battle.host1_username || 'Host 1';
  return battle.host2_username || 'Host 2';
}