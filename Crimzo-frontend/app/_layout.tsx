import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { RealtimeProvider } from '../contexts/RealtimeProvider';
import { VideoCallProvider } from '../contexts/VideoCallContext';
import { DialogProvider } from '../contexts/DialogProvider';
import ScreenPrivacy from '../components/ScreenPrivacy';
import DeepLinkHandler from '../components/DeepLinkHandler';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <DialogProvider>
      <RealtimeProvider>
      <VideoCallProvider>
      <ScreenPrivacy />
      <DeepLinkHandler />
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/register" />
        <Stack.Screen name="invite/[code]" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen 
          name="live/broadcast" 
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="live/[sessionId]" />
        <Stack.Screen 
          name="live/watch" 
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="pk/lobby" />
        <Stack.Screen 
          name="pk/battle" 
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen 
          name="pk/watch" 
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen name="search" />
        <Stack.Screen name="user/[userId]" />
        <Stack.Screen name="profile/edit" />
        <Stack.Screen name="profile/messages" />
        <Stack.Screen name="profile/settings" />
        <Stack.Screen name="profile/transactions" />
        <Stack.Screen name="profile/notifications" />
        <Stack.Screen name="profile/blacklist" />
        <Stack.Screen name="profile/wallet" />
        <Stack.Screen name="profile/stickers" />
        <Stack.Screen name="profile/tasks" />
        <Stack.Screen
          name="call/index"
          options={{ presentation: 'fullScreenModal' }}
        />
      </Stack>
      </VideoCallProvider>
      </RealtimeProvider>
      </DialogProvider>
    </AuthProvider>
  );
}