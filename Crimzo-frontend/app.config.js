require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const base = require('./app.json').expo;

const ANDROID_PACKAGE = base.android?.package || 'com.crimzolive';

function clientIdToReverseScheme(clientId) {
  const match = String(clientId || '').match(/^([\w-]+)\.apps\.googleusercontent\.com$/);
  return match ? `com.googleusercontent.apps.${match[1]}` : null;
}

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const webReverseScheme = clientIdToReverseScheme(webClientId);
const androidReverseScheme = clientIdToReverseScheme(androidClientId);

const googleOAuthIntentFilters = [
  {
    action: 'VIEW',
    autoVerify: false,
    data: [{ scheme: ANDROID_PACKAGE, pathPrefix: '/oauthredirect' }],
    category: ['BROWSABLE', 'DEFAULT'],
  },
];

for (const scheme of [androidReverseScheme, webReverseScheme]) {
  if (!scheme) continue;
  googleOAuthIntentFilters.push({
    action: 'VIEW',
    autoVerify: false,
    data: [{ scheme, pathPrefix: '/oauthredirect' }],
    category: ['BROWSABLE', 'DEFAULT'],
  });
}

const iosUrlScheme = webReverseScheme || androidReverseScheme;
const googleSignInPlugin = iosUrlScheme
  ? [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme },
    ]
  : '@react-native-google-signin/google-signin';

module.exports = {
  expo: {
    ...base,
    plugins: [
      ...(base.plugins || []),
      googleSignInPlugin,
    ],
    android: {
      ...base.android,
      usesCleartextTraffic: true,
      intentFilters: [
        ...(base.android?.intentFilters || []),
        ...googleOAuthIntentFilters,
      ],
      queries: [
        { intent: { action: 'android.intent.action.VIEW', data: { scheme: 'upi' } } },
        { intent: { action: 'android.intent.action.VIEW', data: { scheme: 'tez' } } },
        { intent: { action: 'android.intent.action.VIEW', data: { scheme: 'phonepe' } } },
        { intent: { action: 'android.intent.action.VIEW', data: { scheme: 'paytmmp' } } },
        { intent: { action: 'android.intent.action.VIEW', data: { scheme: 'gpay' } } },
        { intent: { action: 'android.intent.action.VIEW', data: { scheme: 'credpay' } } },
        { package: 'com.google.android.apps.nbu.paisa.user' },
        { package: 'com.phonepe.app' },
        { package: 'net.one97.paytm' },
      ],
    },
  },
};