export type LiveFeedStream = {
  id: string | number;
  user_id?: string | number;
  username: string;
  avatar: string | null;
  viewers_count: number;
  followers_count?: number;
  location?: string;
  country?: string;
};

export function sortLiveStreams(streams: LiveFeedStream[]): LiveFeedStream[] {
  return [...streams].sort((a, b) => (b.viewers_count || 0) - (a.viewers_count || 0));
}

export function findLiveStreamIndex(streams: LiveFeedStream[], sessionId: string): number {
  const id = String(sessionId || '').trim();
  if (!id) return 0;
  const idx = streams.findIndex((s) => String(s.id) === id);
  return idx >= 0 ? idx : 0;
}