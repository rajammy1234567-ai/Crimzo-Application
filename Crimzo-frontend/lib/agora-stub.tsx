/**
 * AGORA STUB — Expo Go compatibility layer
 *
 * react-native-agora requires a custom dev build / native code.
 * This stub lets the app run in Expo Go without crashing.
 *
 * To restore real Agora:  change the import in broadcast.tsx and watch.tsx from
 *   '../../lib/agora-stub'  →  'react-native-agora'
 */

import React from 'react';
import { View, Text } from 'react-native';

/* ── Enums ── */
export const ChannelProfileType = {
  ChannelProfileLiveBroadcasting: 1,
} as const;

export const ClientRoleType = {
  ClientRoleBroadcaster: 1,
  ClientRoleAudience: 2,
} as const;

/* ── Engine stub ── */
const engineStub = {
  initialize: (_opts: any) => {},
  setClientRole: (_role: any) => {},
  enableVideo: () => {},
  enableAudio: () => {},
  enableLocalVideo: (_enabled: boolean) => {},
  enableLocalAudio: (_enabled: boolean) => {},
  registerEventHandler: (_handler: any) => {},
  startPreview: () => {},
  joinChannel: (_token: any, _channel: any, _uid: any, _opts: any) => {},
  leaveChannel: () => {},
  release: () => {},
  muteLocalAudioStream: (_mute: boolean) => {},
  muteLocalVideoStream: (_mute: boolean) => {},
  switchCamera: () => {},
};

export const createAgoraRtcEngine = () => engineStub;

export type IRtcEngine = typeof engineStub;

/* ── RtcSurfaceView stub ── */
export const RtcSurfaceView = ({ style }: { style?: any; canvas?: any }) => (
  <View
    style={[
      { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
      style,
    ]}
  >
    <Text style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12, textAlign: 'center' }}>
      {'📷 Camera preview\nrequires dev build'}
    </Text>
  </View>
);
