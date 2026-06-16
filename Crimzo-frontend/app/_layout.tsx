import React from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';
import { RealtimeProvider } from '../contexts/RealtimeProvider';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RealtimeProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)/login" />
        <Stack.Screen name="(auth)/register" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen 
          name="live/broadcast" 
          options={{ presentation: 'modal' }}
        />
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
        <Stack.Screen name="profile/wallet" />
        <Stack.Screen name="profile/stickers" />
        <Stack.Screen name="profile/tasks" />
      </Stack>
      </RealtimeProvider>
    </AuthProvider>
  );
}