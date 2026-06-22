require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const base = require('./app.json').expo;

module.exports = {
  expo: {
    ...base,
    android: {
      ...base.android,
      usesCleartextTraffic: true,
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