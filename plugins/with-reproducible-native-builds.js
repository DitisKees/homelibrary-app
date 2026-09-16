const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// HomeLibrary reproducible native builds';

module.exports = function withReproducibleNativeBuilds(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-reproducible-native-builds requires a Groovy app/build.gradle');
    }

    if (config.modResults.contents.includes(MARKER)) {
      return config;
    }

    config.modResults.contents += `

${MARKER}
// Native modules are compiled from source for F-Droid. Clang otherwise embeds
// the absolute checkout path in some generated/native objects, making identical
// source trees (and GitHub vs F-Droid build roots) produce different ELF files.
// Map this checkout's project and node_modules roots to stable synthetic paths.
// The flags are applied to every C/C++ Compile task, including external native
// modules configured through React Native/Expo autolinking.

def reproducibleProjectRoot = rootProject.projectDir.parentFile.absolutePath
def reproducibleNodeModules = new File(reproducibleProjectRoot, "node_modules").absolutePath

tasks.configureEach { task ->
    if (task.class.name == "com.android.build.gradle.tasks.ExternalNativeBuildJsonTask") {
        // Configuration task only; compiler flags are supplied below through CMake.
        return
    }
}

android {
    defaultConfig {
        externalNativeBuild {
            cmake {
                cppFlags "-ffile-prefix-map=${reproducibleProjectRoot}=/src", "-fdebug-prefix-map=${reproducibleProjectRoot}=/src", "-ffile-prefix-map=${reproducibleNodeModules}=/src/node_modules", "-fdebug-prefix-map=${reproducibleNodeModules}=/src/node_modules"
                cFlags "-ffile-prefix-map=${reproducibleProjectRoot}=/src", "-fdebug-prefix-map=${reproducibleProjectRoot}=/src", "-ffile-prefix-map=${reproducibleNodeModules}=/src/node_modules", "-fdebug-prefix-map=${reproducibleNodeModules}=/src/node_modules"
            }
        }
    }
}
`;

    return config;
  });
};
