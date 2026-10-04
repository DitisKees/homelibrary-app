const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const MARKER = '// HomeLibrary reproducible native builds';
const DEPENDENCY_INFO_MARKER = '// HomeLibrary excludes encrypted dependency metadata';

// This config plugin is the authoritative upstream location for the app-level
// externalNativeBuild compiler flags used by React Native codegen. F-Droid
// metadata must not patch the generated Gradle project after Expo prebuild.
module.exports = function withReproducibleNativeBuilds(config) {
  config = withGradleProperties(config, (config) => {
    // React Native otherwise embeds the builder's first non-loopback IPv4
    // address in every variant, including release. Configure the supported
    // property through Expo's parsed model before Gradle generates resources.
    config.modResults = config.modResults.filter(
      (item) => item.type !== 'property' || item.key.trim() !== 'reactNativeDevServerIp',
    );
    config.modResults.push({
      type: 'property',
      key: 'reactNativeDevServerIp',
      value: 'localhost',
    });
    return config;
  });

  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-reproducible-native-builds requires a Groovy app build.gradle');
    }

    // Use AGP's supported DSL rather than modifying a signed APK after build.
    if (!config.modResults.contents.includes(DEPENDENCY_INFO_MARKER)) {
      config.modResults.contents += `
${DEPENDENCY_INFO_MARKER}
android {
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
}
`;
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
