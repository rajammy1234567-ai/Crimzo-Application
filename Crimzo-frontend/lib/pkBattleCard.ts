import { sameUserId } from './agoraUid';

export type PkBattleCardData = {
  status?: string;
  host1_id?: string | null;
  host2_id?: string | null;
  host1_score?: number;
  host2_score?: number;
  winner_id?: string | null;
};

/** Winner = most gifts (score); uses winner_id when set, else highest score */
export function isPkBattleWinner(battle: PkBattleCardData, side: 'host1' | 'host2'): boolean {
  if (battle.status !== 'ended') return false;

  const hostId = side === 'host1' ? battle.host1_id : battle.host2_id;
  if (battle.winner_id && hostId) {
    return sameUserId(battle.winner_id, hostId);
  }

  const h1 = Number(battle.host1_score) || 0;
  const h2 = Number(battle.host2_score) || 0;
  if (h1 === h2) return false;
  return side === 'host1' ? h1 > h2 : h2 > h1;
}