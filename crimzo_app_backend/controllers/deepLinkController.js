const {
  ANDROID_PACKAGE_NAME,
  ANDROID_RELEASE_SHA256,
  APPLE_TEAM_ID,
  IOS_BUNDLE_ID,
} = require('../config/deepLinkConfig');

exports.getAndroidAssetLinks = (_req, res) => {
  res.json([
    {
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: ANDROID_PACKAGE_NAME,
        sha256_cert_fingerprints: [ANDROID_RELEASE_SHA256],
      },
    },
  ]);
};

function buildAppleAppSiteAssociation() {
  if (!APPLE_TEAM_ID) {
    return { applinks: { apps: [], details: [] } };
  }
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${APPLE_TEAM_ID}.${IOS_BUNDLE_ID}`,
          paths: ['/invite/*', '/live/*'],
        },
      ],
    },
  };
}

exports.getAppleAppSiteAssociation = (_req, res) => {
  res.type('application/json').send(JSON.stringify(buildAppleAppSiteAssociation()));
};