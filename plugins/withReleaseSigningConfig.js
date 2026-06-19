const { withAppBuildGradle } = require('@expo/config-plugins');

// Injects a release signingConfig into build.gradle using env vars set by build-secrets.sh.
// Required because expo prebuild --clean regenerates build.gradle every time and
// defaults the release buildType to signingConfig signingConfigs.debug.
module.exports = function withReleaseSigningConfig(config) {
  return withAppBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    if (contents.includes('signingConfigs.release')) {
      return mod;
    }

    // Add release signing config block inside signingConfigs { ... }
    contents = contents.replace(
      'signingConfigs {',
      `signingConfigs {
        release {
            storeFile file(System.getenv("KEYSTORE_PATH"))
            storePassword System.getenv("KEYSTORE_PASSWORD")
            keyAlias System.getenv("KEY_ALIAS")
            keyPassword System.getenv("KEY_PASSWORD")
        }`
    );

    // Change the release buildType to use signingConfigs.release.
    // The debug buildType also uses signingConfigs.debug — skip the first occurrence.
    let count = 0;
    contents = contents.replace(/signingConfig signingConfigs\.debug/g, (match) => {
      count++;
      return count === 2 ? 'signingConfig signingConfigs.release' : match;
    });

    mod.modResults.contents = contents;
    return mod;
  });
};
