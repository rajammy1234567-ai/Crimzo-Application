import Constants from 'expo-constants';
import { NativeModules } from 'react-native';

function isAgoraNativeModuleLinked(): boolean {
  if (Constants.appOwnership === 'expo') {
    return false;
  }

  // @ts-expect-error __turboModuleProxy is set when the new architecture is enabled
  if (global.__turboModuleProxy != null) {
    try {
      const { TurboModuleRegistry } = require('react-native');
      return TurboModuleRegistry.get('AgoraRtcNg') != null;
    } catch {
      return false;
    }
  }

  return NativeModules.AgoraRtcNg != null;
}

const agora = isAgoraNativeModuleLinked()
  ? require('react-native-agora')
  : require('../lib/agora-stub');

export const isAgoraNativeLinked = isAgoraNativeModuleLinked();

export const createAgoraRtcEngine = agora.createAgoraRtcEngine;
export const ChannelProfileType = agora.ChannelProfileType;
export const ClientRoleType = agora.ClientRoleType;
export const ConnectionStateType = agora.ConnectionStateType;
export const AudioProfileType = agora.AudioProfileType;
export const AudioScenarioType = agora.AudioScenarioType;
export const RemoteAudioState = agora.RemoteAudioState;
export const RtcSurfaceView = agora.RtcSurfaceView;
export type IRtcEngine = ReturnType<typeof createAgoraRtcEngine>;