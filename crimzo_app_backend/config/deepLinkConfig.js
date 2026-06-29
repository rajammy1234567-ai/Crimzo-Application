/** Android App Links — release upload keystore fingerprint */
const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.crimzolive';

const ANDROID_RELEASE_SHA256 =
  process.env.ANDROID_RELEASE_SHA256 ||
  'B0:0B:D8:7F:C5:0A:13:7F:1F:84:4F:93:FF:05:B7:72:14:CB:A9:EC:A4:C7:AF:B0:4F:F0:62:A5:9B:A7:97:02';

/** iOS Universal Links — set APPLE_TEAM_ID in .env when available */
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || '';

const IOS_BUNDLE_ID = process.env.IOS_BUNDLE_ID || ANDROID_PACKAGE_NAME;

module.exports = {
  ANDROID_PACKAGE_NAME,
  ANDROID_RELEASE_SHA256,
  APPLE_TEAM_ID,
  IOS_BUNDLE_ID,
};