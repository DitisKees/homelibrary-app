const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// HomeLibrary reproducible native builds';

// This config plugin is the authoritative upstream location for the app-level
// externalNativeBuild compiler flags used by React Native codegen. F-Droid
// metadata must not patch the generated Gradle project after Expo prebuild.
module.exports = function withReproducibleNativeBuilds(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-reproducible-native-builds requires a Groovy app build.gradle');
    }

    if (config.modResults.contents.includes(MARKER)) {
      return config;
    }

    const needle = 'defaultConfig {';
    if (!config.modResults.contents.includes(needle)) {
      throw new Error('with-reproducible-native-builds could not find defaultConfig in app build.gradle');
    }

    const block = `
        ${MARKER}
        // React Native codegen CMake builds can embed the absolute checkout path
        // in generated native libraries such as react_codegen_rnscreens. Keep
        // the compiler prefix maps in the generated app Gradle configuration so
        // all app/codegen external native compilation sees the same source root.
        def reproducibleCheckoutRoot = rootProject.projectDir.parentFile.absolutePath.replace('\\\\', '/')
        externalNativeBuild {
            cmake {
                cppFlags "-ffile-prefix-map=\${reproducibleCheckoutRoot}=/homelibrary-src",
                         "-fdebug-prefix-map=\${reproducibleCheckoutRoot}=/homelibrary-src",
                         "-fmacro-prefix-map=\${reproducibleCheckoutRoot}=/homelibrary-src"
                cFlags "-ffile-prefix-map=\${reproducibleCheckoutRoot}=/homelibrary-src",
                       "-fdebug-prefix-map=\${reproducibleCheckoutRoot}=/homelibrary-src",
                       "-fmacro-prefix-map=\${reproducibleCheckoutRoot}=/homelibrary-src"
            }
        }
`;

    config.modResults.contents = config.modResults.contents.replace(
      needle,
      needle + block,
    );

    return config;
  });
};
