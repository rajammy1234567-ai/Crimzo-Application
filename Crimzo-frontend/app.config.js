require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const base = require('./app.json').expo;

module.exports = {
  expo: {
    ...base,
    android: {
      ...base.android,
      usesCleartextTraffic: true,
    },
  },
};