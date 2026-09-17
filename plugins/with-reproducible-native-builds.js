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
// absolute checkout paths in some native objects. Apply prefix-map flags to every
// Android subproject that exposes externalNativeBuild so autolinked Expo/React
// Native modules receive the same deterministic mapping as the app itself.
subprojects { subproject ->
    subproject.plugins.withId("com.android.application") {
        configureReproducibleNativeBuild(subproject)
    }
    subproject.plugins.withId("com.android.library") {
        configureReproducibleNativeBuild(subproject)
    }
}

def configureReproducibleNativeBuild(Project targetProject) {
    def checkoutRoot = rootProject.projectDir.parentFile.absolutePath
    def nodeModulesRoot = new File(checkoutRoot, "node_modules").absolutePath
    def reproducibleFlags = [
        "-ffile-prefix-map=\${checkoutRoot}=/src",
        "-fdebug-prefix-map=\${checkoutRoot}=/src",
        "-ffile-prefix-map=\${nodeModulesRoot}=/src/node_modules",
        "-fdebug-prefix-map=\${nodeModulesRoot}=/src/node_modules"
    ]

    targetProject.android.defaultConfig.externalNativeBuild.cmake {
        cFlags(*reproducibleFlags)
        cppFlags(*reproducibleFlags)
    }
}
`;

    return config;
  });
};
