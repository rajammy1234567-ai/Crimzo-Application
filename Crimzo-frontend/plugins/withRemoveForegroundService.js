const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withRemoveForegroundService(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;

    // Ensure tools namespace is present
    if (!androidManifest.$['xmlns:tools']) {
      androidManifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    // List of permissions to remove
    const permissionsToRemove = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
      'android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION',
      'android.permission.FOREGROUND_SERVICE_SYSTEM_EXEMPT',
      'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
      'android.permission.SYSTEM_ALERT_WINDOW'
    ];
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    // Add tools:node="remove" to each permission
    permissionsToRemove.forEach((permName) => {
      const existing = androidManifest['uses-permission'].find(
        (p) => p.$['android:name'] === permName
      );

      if (existing) {
        existing.$['tools:node'] = 'remove';
      } else {
        androidManifest['uses-permission'].push({
          $: {
            'android:name': permName,
            'tools:node': 'remove'
          }
        });
      }
    });

    // Google Play Console ALSO scans for ANY <service> tag that has android:foregroundServiceType
    // expo-location includes LocationTaskService with android:foregroundServiceType="location"
    // We must manually strip this service so Google Play robot ignores it.
    if (!androidManifest.application) {
      androidManifest.application = [{}];
    }
    if (!androidManifest.application[0].service) {
      androidManifest.application[0].service = [];
    }

    const serviceName = 'expo.modules.location.services.LocationTaskService';
    const existingService = androidManifest.application[0].service.find(
      (s) => s.$['android:name'] === serviceName
    );

    if (existingService) {
      existingService.$['tools:node'] = 'remove';
    } else {
      androidManifest.application[0].service.push({
        $: {
          'android:name': serviceName,
          'tools:node': 'remove'
        }
      });
    }

    return config;
  });
};
