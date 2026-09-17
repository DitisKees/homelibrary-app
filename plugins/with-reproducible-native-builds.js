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
// Native modules are compiled from source for F-Droid. Clang otherwise embeds
// absolute checkout paths in native/codegen objects. Android's NDK guidance
// recommends configuring compiler behavior in CMake rather than relying on
// Gradle cFlags/cppFlags, whose precedence can be surprising.
//
// CMAKE_PROJECT_INCLUDE is processed by every CMake project() call, including
// React Native autolinking/codegen subprojects. The included file applies the
// prefix maps at directory scope so every target created below it inherits them.
def reproducibleCheckoutRoot = rootProject.projectDir.parentFile.absolutePath
def reproducibleCmakeInit = new File(rootProject.projectDir, "reproducible-build.cmake")
reproducibleCmakeInit.text = """
set(HOMELIBRARY_CHECKOUT_ROOT \"${'$'}{reproducibleCheckoutRoot}\")
add_compile_options(
  \"-ffile-prefix-map=\\${HOMELIBRARY_CHECKOUT_ROOT}=/src\"
  \"-fdebug-prefix-map=\\${HOMELIBRARY_CHECKOUT_ROOT}=/src\"
)
"""

subprojects { subproject ->
    ["com.android.application", "com.android.library"].each { pluginId ->
        subproject.plugins.withId(pluginId) {
            subproject.android.defaultConfig.externalNativeBuild.cmake {
                arguments "-DCMAKE_PROJECT_INCLUDE=${'$'}{reproducibleCmakeInit.absolutePath}"
            }
        }
    }
}
`;

    return config;
  });
};
