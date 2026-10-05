const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');
const abis = require('../scripts/android-release-abis.json');

const MARKER = '// HomeLibrary R8 and ABI release packaging';

// F-Droid builds each standalone ABI APK separately with the supported React
// Native property. No post-build manifest edits or APK-set/split installer needed.
module.exports = function withAndroidReleasePackaging(config) {
  const baseCode = config.android?.versionCode;
  if (!Number.isInteger(baseCode) || baseCode < 1 || baseCode > 209999999) {
    throw new Error('Android base versionCode must fit the 10 * base + ABI scheme');
  }
  config = withGradleProperties(config, (config) => {
    const properties = {
      'android.enableMinifyInReleaseBuilds': 'true',
      'android.enableShrinkResourcesInReleaseBuilds': 'false',
    };
    config.modResults = config.modResults.filter(
      (item) => item.type !== 'property' || !(item.key.trim() in properties),
    );
    for (const [key, value] of Object.entries(properties)) {
      config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('with-android-release-packaging requires Groovy app build.gradle');
    }
    if (!config.modResults.contents.includes(MARKER)) {
      const offsets = Object.entries(abis).map(([abi, code]) => `'${abi}': ${code}`).join(', ');
      config.modResults.contents += `
${MARKER}
def homeLibraryAbiCodes = [${offsets}]
def homeLibraryArchitectures = (findProperty('reactNativeArchitectures') ?: homeLibraryAbiCodes.keySet().join(',')).split(',').collect { it.trim() }
if (homeLibraryArchitectures.isEmpty() || homeLibraryArchitectures.any { !homeLibraryAbiCodes.containsKey(it) } || homeLibraryArchitectures.toSet().size() != homeLibraryArchitectures.size()) {
    throw new GradleException('Unsupported or duplicate HomeLibrary release ABI')
}
// A universal developer/smoke APK uses suffix 0. Official release APKs each
// contain one ABI, with suffix 1..4 in F-Droid preference order.
android {
    defaultConfig {
        versionCode ${baseCode} * 10 + (homeLibraryArchitectures.size() == 1 ? homeLibraryAbiCodes[homeLibraryArchitectures[0]] : 0)
    }
    buildTypes {
        release {
            minifyEnabled true
            shrinkResources false
            // Keep Expo/RN's app rules and all dependency consumer rules.
            setProguardFiles([getDefaultProguardFile('proguard-android-optimize.txt'), file('proguard-rules.pro')])
        }
    }
}
`;
    }
    return config;
  });
};
