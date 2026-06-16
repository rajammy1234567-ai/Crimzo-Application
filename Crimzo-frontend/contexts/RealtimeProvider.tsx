import React, { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import io, { Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL } from '../lib/apiClient';
import { publish } from '../lib/realtimeSync';
import { loadAppSettings, onAppSettingsChange, type AppSettings } from '../lib/appSettings';

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

    socket.on('connect', () => {
      socket.emit('join_user', { userId: user.id });
    });

    socket.on('user_banned', (data: { message?: string }) => {
      Alert.alert(
        'Account Suspended',
        data?.message || 'Your account has been suspended by an administrator.',
        [{ text: 'OK', onPress: () => logout() }],
        { cancelable: false },
      );
      logout();
    });

    socket.on('diamond_update', (data: { diamonds?: number }) => {
      if (typeof data?.diamonds === 'number') {
        updateUser({ diamonds: data.diamonds });
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

    socket.on('new_notification', (data: {
      title?: string;
      body?: string;
      type?: string;
    }) => {
      publish('notifications_updated', data);
      if (!appSettingsRef.current.notificationsEnabled) return;
      if (data?.type === 'follow_request') {
        Alert.alert(
          data.title || 'New notification',
          data.body || 'You have a new follow request',
        );
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, user?.id, updateUser, logout]);

  return <>{children}</>;
}