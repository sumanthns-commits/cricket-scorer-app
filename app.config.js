const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, process.env.APP_ENV === 'production' ? '.env.production' : '.env'),
  override: true,
});

const { withAppBuildGradle } = require('@expo/config-plugins');

function withProductionSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!process.env.KEYSTORE_PATH) return mod;

    let contents = mod.modResults.contents;

    // Inject release signing config after the debug block
    if (!contents.includes('signingConfigs.release')) {
      contents = contents.replace(
        /(signingConfigs \{)([\s\S]*?debug \{[\s\S]*?\}\s*)(\})/,
        `$1$2    release {\n            storeFile file(System.getenv("KEYSTORE_PATH"))\n            storePassword System.getenv("KEYSTORE_PASSWORD")\n            keyAlias System.getenv("KEY_ALIAS")\n            keyPassword System.getenv("KEY_PASSWORD")\n        }\n    $3`
      );

      // Switch release build type from debug signing to release signing
      contents = contents.replace(
        /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/,
        '$1signingConfig signingConfigs.release'
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

module.exports = ({ config }) => {
  let cfg = {
    ...config,
    extra: {
      ...config.extra,
      apiKey: process.env.API_KEY ?? null,
    },
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    },
    ios: {
      ...config.ios,
      googleServicesFile: process.env.GOOGLE_SERVICES_PLIST ?? './GoogleService-Info.plist',
      appleTeamId: process.env.APPLE_TEAM_ID ?? config.ios?.appleTeamId,
    },
  };

  cfg = withProductionSigning(cfg);

  return cfg;
};
