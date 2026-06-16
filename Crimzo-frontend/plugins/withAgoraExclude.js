const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAgoraExclude(config) {
  return withAppBuildGradle(config, config => {
    if (!config.modResults.contents.includes('exclude group: "io.agora.rtc"')) {
      config.modResults.contents = config.modResults.contents + `
// Exclude Agora screen sharing module which forces foreground service permission
configurations.all {
    exclude group: "io.agora.rtc", module: "full-screen-sharing"
}
`;
    }
    return config;
  });
};
