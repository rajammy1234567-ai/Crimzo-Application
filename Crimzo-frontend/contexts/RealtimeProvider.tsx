import React, { useEffect, useRef } from 'react';
import { appAlert } from '../lib/appAlert';

import io, { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL } from '../lib/apiClient';
import { publish } from '../lib/realtimeSync';
import { loadAppSettings, onAppSettingsChange, type AppSettings } from '../lib/appSettings';
import { attachAppTimeTracker } from '../lib/appTimeTracker';
import { playGiftPop } from '../lib/uiSounds';

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user, token, updateUser, logout } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const appSettingsRef = useRef<AppSettings>({ notificationsEnabled: true, language: 'Automatic' });

  useEffect(() => {
    loadAppSettings().then((s) => { appSettingsRef.current = s; });
    return onAppSettingsChange((s) => { appSettingsRef.current = s; });
  }, []);

  useEffect(() => {
    if (!token || !user?.id || !API_URL) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io(API_URL, {
      transports: ['websocket'],
      auth: { token },
    });

    const registerPresence = () => {
      socket.emit('join_user');
      socket.emit('app_presence', { category: 'home' });
    };

    socket.on('connect', registerPresence);

    socket.on('user_banned', (data: { message?: string }) => {
      appAlert(
        'Account Suspended',
        data?.message || 'Your account has been suspended by an administrator.',
        [{ text: 'OK', onPress: () => logout() }],
        { cancelable: false },
      );
    });

    socket.on('diamond_update', (data: { diamonds?: number }) => {
      if (typeof data?.diamonds === 'number') {
        updateUser({ diamonds: data.diamonds });
      }
    });

    socket.on('bean_update', (data: { beans?: number }) => {
      if (typeof data?.beans === 'number') {
        updateUser({ beans: data.beans });
      }
    });

    socket.on('reel_deleted', (data: { reelId?: string }) => {
      if (data?.reelId) publish('reel_deleted', data.reelId);
    });

    socket.on('stickers_updated', () => {
      publish('stickers_updated');
    });

    socket.on('live_streams_updated', () => {
      publish('live_streams_updated');
    });

    socket.on('follow_updated', (data: {
      followers_count?: number;
      following_count?: number;
      friends_count?: number;
    }) => {
      publish('follow_updated', data);
    });

    socket.on('follow_status_changed', (data: {
      userId?: string;
      isFollowing?: boolean;
      isRequested?: boolean;
    }) => {
      publish('follow_status_changed', data);
    });

    socket.on('online_count_update', (data: { count?: number }) => {
      if (typeof data?.count === 'number') {
        publish('online_count_update', data.count);
      }
    });

    socket.on('new_notification', (data: {
      title?: string;
      body?: string;
      type?: string;
    }) => {
      publish('notifications_updated', data);
      if (!appSettingsRef.current.notificationsEnabled) return;
      if (data?.type === 'follow_request') {
        appAlert(
          data.title || 'New notification',
          data.body || 'You have a new follow request',
        );
      }
    });

    socket.on('new_message', (data: Record<string, unknown>) => {
      if (data?.id && data?.sender_id && data?.receiver_id) {
        publish('new_message', data);
      }
    });

    socket.on('gift_received', (data: {
      receiverId?: string;
      senderId?: string;
      amount?: number;
      diamondsSpent?: number;
      stickerName?: string;
      senderUsername?: string;
    }) => {
      if (String(data?.receiverId) !== String(user.id)) return;
      playGiftPop();
      publish('gift_received', data);
    });

    socketRef.current = socket;

    const detachAppTime = attachAppTimeTracker(socket);

    const heartbeat = setInterval(() => {
      if (socket.connected) {
        socket.emit('presence_heartbeat', { category: 'home', foreground: true });
      }
    }, 30 * 1000);

    return () => {
      detachAppTime();
      clearInterval(heartbeat);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id, updateUser, logout]);

  return <>{children}</>;
}