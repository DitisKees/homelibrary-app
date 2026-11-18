const { withProjectBuildGradle } = require('expo/config-plugins');

const APPLY = "apply from: rootProject.file('../scripts/glide-version.gradle')";

// Use the generated root project for every Android build, not a recipe-side
// patch of Expo's package or a separate Gradle init script.
module.exports = function withGlideVersion(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-glide-version requires a Groovy project build.gradle');
    }
    if (!config.modResults.contents.includes(APPLY)) {
      config.modResults.contents += '\n' + APPLY + '\n';
    }
    return config;
  });
};
