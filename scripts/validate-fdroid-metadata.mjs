import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const fdroidPath = path.join(root, '.fdroid.yml');
const buildScriptPath = path.join(root, 'scripts', 'build-fdroid-recipe-android.sh');
const canonicalBuildScriptPath = path.join(root, 'scripts', 'build-fdroid-android.sh');
const gradlePropertiesGuardPath = path.join(root, 'scripts', 'prepare-android-gradle-properties.sh');
const verifyApkScriptPath = path.join(root, 'scripts', 'verify-fdroid-apk.sh');
const normalizeScriptPath = path.join(root, 'scripts', 'normalize-fdroid-apk-build-ids.py');
const reproduciblePluginPath = path.join(root, 'plugins', 'with-reproducible-native-builds.js');
const releaseWorkflowPath = path.join(root, '.github', 'workflows', 'android-release.yml');
const buildserverSimulationWorkflowPath = path.join(root, '.github', 'workflows', 'fdroid-buildserver-simulation.yml');
const buildserverSimulationScriptPath = path.join(root, 'scripts', 'run-fdroid-buildserver-simulation.sh');
const errors = [];
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

const expo = app.expo ?? {};
const android = expo.android ?? {};
const versionName = expo.version;
const versionCode = android.versionCode;

expect(typeof versionName === 'string' && /^\d+\.\d+\.\d+$/.test(versionName), 'app.json expo.version must be semantic x.y.z');
expect(Number.isInteger(versionCode) && versionCode > 0, 'app.json android.versionCode must be a positive integer');
expect(android.package === 'io.github.ditiskees.homelibrary', 'Android package must remain io.github.ditiskees.homelibrary');

const buildFromSource = pkg.expo?.autolinking?.android?.buildFromSource ?? [];
expect(Array.isArray(buildFromSource) && buildFromSource.includes('.*'), 'Expo Android autolinking must build all native modules from source using buildFromSource [".*"]');

const localeSpecs = [
  ['en-US', 'English'],
  ['nl-NL', 'Dutch'],
  ['de-DE', 'German'],
  ['fr-FR', 'French'],
];

for (const [locale, label] of localeSpecs) {
  const dir = path.join(root, 'fastlane', 'metadata', 'android', locale);
  const shortPath = path.join(dir, 'short_description.txt');
  const fullPath = path.join(dir, 'full_description.txt');
  const changelogPath = path.join(dir, 'changelogs', `${versionCode}.txt`);

  expect(fs.existsSync(shortPath), `${label} short_description.txt is missing`);
  expect(fs.existsSync(fullPath), `${label} full_description.txt is missing`);
  expect(fs.existsSync(changelogPath), `${label} changelog for versionCode ${versionCode} is missing`);

  if (fs.existsSync(shortPath)) {
    const shortDescription = fs.readFileSync(shortPath, 'utf8').trim();
    expect(shortDescription.length >= 30, `${label} short description should be at least 30 characters`);
    expect(shortDescription.length < 80, `${label} short description must be under 80 characters`);
    expect(!shortDescription.endsWith('.'), `${label} short description must not end with a period`);
  }

  if (fs.existsSync(fullPath)) {
    const fullDescription = fs.readFileSync(fullPath, 'utf8').trim();
    expect(fullDescription.length >= 200, `${label} full description is unexpectedly short`);
  }

  if (fs.existsSync(changelogPath)) {
    const changelog = fs.readFileSync(changelogPath, 'utf8').trim();
    expect(changelog.length > 0, `${label} changelog is empty`);
    expect(changelog.length <= 500, `${label} changelog exceeds F-Droid's 500-character limit`);
  }
}

expect(fs.existsSync(fdroidPath), '.fdroid.yml is missing');
expect(fs.existsSync(buildScriptPath), 'scripts/build-fdroid-recipe-android.sh is missing');
expect(fs.existsSync(canonicalBuildScriptPath), 'scripts/build-fdroid-android.sh is missing');
expect(fs.existsSync(gradlePropertiesGuardPath), 'scripts/prepare-android-gradle-properties.sh is missing');
expect(fs.existsSync(verifyApkScriptPath), 'scripts/verify-fdroid-apk.sh is missing');
expect(fs.existsSync(normalizeScriptPath), 'scripts/normalize-fdroid-apk-build-ids.py is missing');
expect(fs.existsSync(reproduciblePluginPath), 'plugins/with-reproducible-native-builds.js is missing');
expect(fs.existsSync(releaseWorkflowPath), '.github/workflows/android-release.yml is missing');
expect(fs.existsSync(buildserverSimulationWorkflowPath), '.github/workflows/fdroid-buildserver-simulation.yml is missing');
expect(fs.existsSync(buildserverSimulationScriptPath), 'scripts/run-fdroid-buildserver-simulation.sh is missing');

if (fs.existsSync(fdroidPath)) {
  const fdroid = fs.readFileSync(fdroidPath, 'utf8');
  expect(fdroid.includes(`versionName: ${versionName}`) || fdroid.includes(`versionName: '${versionName}'`), `.fdroid.yml must use versionName ${versionName}`);
  expect(fdroid.includes(`versionCode: ${versionCode}`), `.fdroid.yml must use versionCode ${versionCode}`);
  expect(fdroid.includes(`commit: v${versionName}`), `.fdroid.yml must build tag v${versionName}`);
  expect(fdroid.includes('ndk: r27b'), '.fdroid.yml must pin Android NDK r27b for Expo SDK 57 / React Native 0.86');
  expect(fdroid.includes('AuthorName: Kees van \'t Slot'), '.fdroid.yml must declare the upstream author');
  expect(fdroid.includes('RepoType: git'), '.fdroid.yml must declare RepoType: git');
  expect(fdroid.includes('https://github.com/DitisKees/homelibrary-app'), '.fdroid.yml must reference the public upstream repository');
  expect(fdroid.includes('https://github.com/DitisKees/homelibrary-app/releases/download/v%v/HomeLibrary-%v.apk'), '.fdroid.yml must point reproducible verification at the immutable versioned GitHub Release APK');
  expect(!/^\s*subdir:/m.test(fdroid), '.fdroid.yml must not declare subdir because Expo generates android/ after checkout');
  expect(fdroid.includes('output: android/app/build/outputs/apk/release/app-release-unsigned.apk'), '.fdroid.yml must declare the generated unsigned APK output');
  expect(fdroid.includes('cd android/app'), '.fdroid.yml must build from the generated Android app directory');
  expect(fdroid.includes('gradle assembleRelease'), '.fdroid.yml must use F-Droid system Gradle after scanner removes the wrapper');
  expect(fdroid.includes("jvmToolchain\\|JavaVersion/s/17/21/"), '.fdroid.yml must apply F-Droid React Native Java 17-to-21 toolchain compatibility');
  expect(fdroid.includes('bash scripts/prepare-android-gradle-properties.sh'), '.fdroid.yml must guard Expo Camera Gradle properties before and after appending build settings');
  expect(fdroid.includes('bash scripts/check-fdroid-android-dependencies.sh'), '.fdroid.yml must audit the final Android runtime dependency graph');
  expect(fdroid.includes('bash scripts/verify-fdroid-apk.sh'), '.fdroid.yml must verify the final APK for forbidden barcode artifacts');
  expect(fdroid.includes('node_modules/hermes-compiler/hermesc/linux64-bin/hermesc'), '.fdroid.yml must use the current Hermes scanner path');
  expect(fdroid.includes('node_modules/@react-native-async-storage/async-storage/android/build.gradle'), '.fdroid.yml must preserve the reviewed AsyncStorage Gradle file from scanner rewriting');
  expect(fdroid.includes('node_modules/react-native-safe-area-context/android/build.gradle'), '.fdroid.yml must preserve the reviewed Safe Area Context Gradle file from scanner rewriting');
  expect(fdroid.includes('node_modules/react-native-screens/android/build.gradle'), '.fdroid.yml must preserve the reviewed Screens Gradle file from scanner rewriting');
  expect(fdroid.includes('python3 scripts/normalize-fdroid-apk-build-ids.py'), '.fdroid.yml must call the checked-in APK build-id normalization helper');
  expect(!/python3\s+-[^\n]*<<['"]?PY/m.test(fdroid), '.fdroid.yml must not embed Python scripts');
  expect(!fdroid.includes('externalNativeBuild {'), '.fdroid.yml must not patch externalNativeBuild in metadata; keep it upstream');
  expect(fdroid.includes('UpdateCheckMode: Tags'), '.fdroid.yml must check tagged releases');
  expect(fdroid.includes('AutoUpdateMode: Version'), '.fdroid.yml must enable version autoupdates');
  expect(fdroid.includes(`CurrentVersion: ${versionName}`), `.fdroid.yml CurrentVersion must be ${versionName}`);
  expect(fdroid.includes(`CurrentVersionCode: ${versionCode}`), `.fdroid.yml CurrentVersionCode must be ${versionCode}`);
}

if (fs.existsSync(releaseWorkflowPath)) {
  const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, 'utf8');
  expect(releaseWorkflow.includes("tags:\n      - 'v*.*.*'"), 'Android release workflow must run for immutable semantic-version tags');
  expect(releaseWorkflow.includes('release_tag:'), 'Android release workflow must support recovery from an existing immutable release tag');
  expect(releaseWorkflow.includes("ref: ${{ inputs.release_tag || github.ref }}"), 'Android release workflow must check out the explicitly requested immutable tag during recovery');
  expect(releaseWorkflow.includes("SDKMANAGER=\"${SDK_ROOT}/cmdline-tools/latest/bin/sdkmanager\""), 'Android release workflow must resolve sdkmanager from the Android SDK instead of assuming it is on PATH');
  expect(releaseWorkflow.includes('build-tools;34.0.0'), 'Android release workflow must use apksigner from Android build-tools 34.0.0 for F-Droid signature-copy compatibility');
  expect(releaseWorkflow.includes('HomeLibrary-${HOMELIBRARY_RELEASE_VERSION}.apk'), 'Android release workflow must produce a versioned stable APK filename');
  expect(releaseWorkflow.includes('gh release upload'), 'Android release workflow must publish the signed APK to the GitHub Release for the immutable tag');
}

if (fs.existsSync(buildserverSimulationWorkflowPath)) {
  const workflow = fs.readFileSync(buildserverSimulationWorkflowPath, 'utf8');
  expect(workflow.includes('registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie'), 'F-Droid simulation must use the production buildserver image');
  expect(workflow.includes('run-fdroid-buildserver-simulation.sh'), 'F-Droid simulation workflow must call the checked-in simulation script');
  expect(workflow.includes('github.event.pull_request.head.sha || github.sha'), 'F-Droid simulation must build the PR head/source commit rather than the synthetic merge commit');
}

if (fs.existsSync(buildserverSimulationScriptPath)) {
  const script = fs.readFileSync(buildserverSimulationScriptPath, 'utf8');
  expect(script.includes('fdroid_as_vagrant build'), 'F-Droid simulation script must invoke fdroid build through the vagrant buildserver user');
  expect(script.includes('--refresh-scanner'), 'F-Droid simulation must run the live F-Droid source scanner');
  expect(script.includes('--on-server'), 'F-Droid simulation must exercise the buildserver path');
  expect(script.includes('--no-tarball'), 'F-Droid simulation must mirror the parent fdroiddata build command');
  expect(script.includes('fetchsrclibs'), 'F-Droid simulation must run fdroid fetchsrclibs before building');
  expect(script.includes('a35fdfddd9c66823987a410566a6101186e39c84'), 'F-Droid simulation must use the same fdroidserver trust root as fdroiddata CI');
}

if (fs.existsSync(buildScriptPath)) {
  const buildScript = fs.readFileSync(buildScriptPath, 'utf8');
  expect(buildScript.includes('./gradlew :app:assembleRelease --no-daemon'), 'F-Droid recipe build script must assemble the release APK');
  expect(buildScript.includes('android/app/build/outputs/apk/release/app-release-unsigned.apk'), 'F-Droid recipe build script must use the exact unsigned release APK path');
  expect(!/python3\s+-[^\n]*<<['"]?PY/m.test(buildScript), 'F-Droid recipe build script must not embed Python scripts');
  expect(buildScript.includes('bash scripts/prepare-android-gradle-properties.sh'), 'F-Droid recipe build script must guard generated Expo Camera Gradle properties');
  expect(buildScript.includes('bash scripts/check-fdroid-android-dependencies.sh'), 'F-Droid recipe build script must audit the exact release runtime dependency graph');
  expect(buildScript.includes('bash scripts/verify-fdroid-apk.sh'), 'F-Droid recipe build script must audit final APK contents');
  expect(buildScript.includes('python3 scripts/normalize-fdroid-apk-build-ids.py'), 'F-Droid recipe build script must call the checked-in build-id normalization helper');
}

if (fs.existsSync(canonicalBuildScriptPath)) {
  const canonicalBuildScript = fs.readFileSync(canonicalBuildScriptPath, 'utf8');
  expect(canonicalBuildScript.includes('bash scripts/prepare-android-gradle-properties.sh'), 'canonical Android build must guard generated Expo Camera Gradle properties');
  expect(canonicalBuildScript.includes('bash scripts/check-fdroid-android-dependencies.sh'), 'canonical Android build must audit release runtime dependencies');
  expect(canonicalBuildScript.includes('bash scripts/verify-fdroid-apk.sh'), 'canonical Android build must audit final APK contents');
}

if (fs.existsSync(gradlePropertiesGuardPath)) {
  const guardScript = fs.readFileSync(gradlePropertiesGuardPath, 'utf8');
  expect(guardScript.includes('expo.camera.barcode-scanner-enabled=false'), 'Gradle-properties guard must require Expo Camera barcode scanning to remain disabled');
  expect(guardScript.includes("printf '\\n'"), 'Gradle-properties guard must normalize a missing trailing newline before release settings are appended');
}

if (fs.existsSync(verifyApkScriptPath)) {
  const verifyApkScript = fs.readFileSync(verifyApkScriptPath, 'utf8');
  expect(verifyApkScript.includes('libbarhopper_v3.so'), 'APK verification must reject the ML Kit Barhopper native library');
  expect(verifyApkScript.includes('assets/mlkit_barcode_models/'), 'APK verification must reject ML Kit barcode models');
  expect(verifyApkScript.includes('play-services-code-scanner.properties'), 'APK verification must reject Google code-scanner metadata');
}

if (fs.existsSync(reproduciblePluginPath)) {
  const plugin = fs.readFileSync(reproduciblePluginPath, 'utf8');
  expect(plugin.includes('externalNativeBuild {'), 'reproducible native build plugin must configure app externalNativeBuild upstream');
  expect(plugin.includes('cppFlags'), 'reproducible native build plugin must configure C++ prefix-map flags');
  expect(plugin.includes('cFlags'), 'reproducible native build plugin must configure C prefix-map flags');
  expect(plugin.includes('-ffile-prefix-map='), 'reproducible native build plugin must configure file prefix mapping');
  expect(plugin.includes('-fdebug-prefix-map='), 'reproducible native build plugin must configure debug prefix mapping');
}

if (fs.existsSync(normalizeScriptPath)) {
  const normalizeScript = fs.readFileSync(normalizeScriptPath, 'utf8');
  expect(normalizeScript.includes('GNU SHA-1 build-id'), 'APK normalization helper must document GNU SHA-1 build-id normalization');
  expect(normalizeScript.includes('zlib.crc32'), 'APK normalization helper must refresh ZIP CRCs');
}

if (errors.length > 0) {
  process.stderr.write('F-Droid metadata validation failed:\n');
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(`F-Droid metadata OK for HomeLibrary ${versionName} (${versionCode}).\n`);
process.stdout.write('Fastlane text metadata exists for en-US, nl-NL, de-DE, and fr-FR.\n');
process.stdout.write('Expo native modules are configured for source builds, and CI includes reproducibility plus a production-buildserver simulation.\n');
