// Mock react-native-agora for web to prevent Metro bundler crashes
export const isAgoraNativeLinked = false;

export const createAgoraRtcEngine = () => ({
    initialize: () => { },
    registerEventHandler: () => { },
    setClientRole: () => { },
    enableVideo: () => { },
    enableAudio: () => { },
    joinChannel: () => { },
    leaveChannel: () => { },
    release: () => { },
    startPreview: () => { },
    setupLocalVideo: () => { },
    switchCamera: () => { },
    muteLocalAudioStream: () => { },
    muteLocalVideoStream: () => { },
    // Additional common methods used in PK/live to prevent "not a function" on web
    setupRemoteVideo: () => { },
    playEffect: () => { },
    stopEffect: () => { },
    setAudioProfile: () => { },
    setVideoEncoderConfiguration: () => { },
    enableLocalVideo: () => { },
    enableLocalAudio: () => { },
});

export const ChannelProfileType = { ChannelProfileLiveBroadcasting: 1, ChannelProfileCommunication: 0 };
export const ClientRoleType = { ClientRoleAudience: 2, ClientRoleBroadcaster: 1 };
export const ConnectionStateType = { ConnectionStateConnected: 3 };
export const AudioProfileType = { AudioProfileSpeechStandard: 1 };
export const AudioScenarioType = { AudioScenarioChatroom: 5 };
export const RemoteAudioState = { RemoteAudioStateStarting: 1, RemoteAudioStateDecoding: 2 };
export const RtcSurfaceView = () => null;
export type IRtcEngine = any;
