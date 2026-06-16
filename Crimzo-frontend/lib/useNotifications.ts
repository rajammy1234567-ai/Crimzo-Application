import { useState, useCallback, useEffect } from 'react';
import { apiGet, apiPost } from './apiClient';
import { useAuth } from '../contexts/AuthContext';
import { publish, subscribe } from './realtimeSync';

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  actor_id?: string | null;
  actor_username?: string | null;
  actor_avatar?: string | null;
  reference_id?: string | null;
  is_read: boolean;
  created_at: string;
};

export function useNotifications() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiGet<{
        notifications?: AppNotification[];
        unreadCount?: number;
      }>('/api/notifications', token);
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  }, [token]);

  const refreshUnreadCount = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiGet<{ unreadCount?: number }>('/api/notifications/unread-count', token);
      setUnreadCount(data.unreadCount || 0);
    } catch {
      // non-fatal
    }
  }, [token]);

  const markAllRead = useCallback(async () => {
    if (!token) return;
    try {
      const data = await apiPost<{ unreadCount?: number }>('/api/notifications/mark-read', {}, token);
      setUnreadCount(data.unreadCount || 0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // non-fatal
    }
  }, [token]);

  const pushLocal = useCallback((n: AppNotification) => {
    setNotifications((prev) => [n, ...prev].slice(0, 50));
    setUnreadCount((c) => c + 1);
    publish('notifications_updated');
  }, []);

  useEffect(() => {
    refreshUnreadCount();
    const unsub = subscribe('notifications_updated', () => refreshUnreadCount());
    return unsub;
  }, [refreshUnreadCount]);

  return {
    notifications,
    unreadCount,
    loading,
    refresh,
    refreshUnreadCount,
    markAllRead,
    pushLocal,
  };
}