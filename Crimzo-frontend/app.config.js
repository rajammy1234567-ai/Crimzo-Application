require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const base = require('./app.json').expo;

const ANDROID_PACKAGE = base.android?.package || 'com.livestreamhub';
const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const reverseClientMatch = webClientId.match(/^([\w-]+)\.apps\.googleusercontent\.com$/);
const googleReverseScheme = reverseClientMatch
  ? `com.googleusercontent.apps.${reverseClientMatch[1]}`
  : null;

const googleOAuthIntentFilters = [
  {
    action: 'VIEW',
    autoVerify: false,
    data: [{ scheme: ANDROID_PACKAGE, pathPrefix: '/oauthredirect' }],
    category: ['BROWSABLE', 'DEFAULT'],
  },
];

if (googleReverseScheme) {
  googleOAuthIntentFilters.push({
    action: 'VIEW',
    autoVerify: false,
    data: [{ scheme: googleReverseScheme, pathPrefix: '/oauthredirect' }],
    category: ['BROWSABLE', 'DEFAULT'],
  });
}

module.exports = {
  expo: {
    ...base,
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