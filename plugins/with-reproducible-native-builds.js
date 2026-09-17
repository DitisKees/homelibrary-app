const { withProjectBuildGradle } = require('expo/config-plugins');

const MARKER = '// HomeLibrary reproducible native builds';

module.exports = function withReproducibleNativeBuilds(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-reproducible-native-builds requires a Groovy project build.gradle');
    }

    if (config.modResults.contents.includes(MARKER)) {
      return config;
    }

    config.modResults.contents += `

${MARKER}
// Locally compiled React Native/Expo libraries can embed their absolute checkout
// directory in __FILE__, debug information and therefore their GNU build-id.
// Pass the prefix maps as CMake's initial compiler flags for every Android
// application/library subproject. Unlike process CFLAGS/CXXFLAGS or a
// CMAKE_PROJECT_INCLUDE hook, these values are part of each Gradle external
// native build's CMake configuration and therefore reach dependency/codegen
// projects such as react-native-screens.
def reproducibleCheckoutRoot = rootProject.projectDir.parentFile.absolutePath.replace('\\\\', '/')
def reproduciblePrefixFlags = [
    "-ffile-prefix-map=${'$'}{reproducibleCheckoutRoot}=/src",
    "-fdebug-prefix-map=${'$'}{reproducibleCheckoutRoot}=/src",
    "-fmacro-prefix-map=${'$'}{reproducibleCheckoutRoot}=/src"
].join(' ')

subprojects { subproject ->
    ["com.android.application", "com.android.library"].each { pluginId ->
        subproject.plugins.withId(pluginId) {
            subproject.android.defaultConfig.externalNativeBuild.cmake {
                arguments "-DCMAKE_C_FLAGS=${'$'}{reproduciblePrefixFlags}",
                          "-DCMAKE_CXX_FLAGS=${'$'}{reproduciblePrefixFlags}"
            }
        }
    }
}
`;

    return config;
  });
};
