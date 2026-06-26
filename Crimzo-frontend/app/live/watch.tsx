import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import LiveWatchRoom from '../../components/LiveWatchRoom';

/** Single live stream (deep links, legacy routes). Home cards open /live/feed instead. */
export default function WatchScreen() {
  const { sessionId, talk } = useLocalSearchParams<{ sessionId?: string; talk?: string }>();
  const id = String(Array.isArray(sessionId) ? sessionId[0] : sessionId || '').trim();
  if (!id) return null;
  return <LiveWatchRoom sessionId={id} isActive talk={talk} />;
}