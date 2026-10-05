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
const fdroidPinsPath = path.join(root, 'scripts', 'fdroid', 'pins.env');
const fdroidLibPath = path.join(root, 'scripts', 'fdroid', 'lib-buildserver.sh');
const fdroidSourceRunnerPath = path.join(root, 'scripts', 'fdroid', 'run-source-build.sh');
const fdroidReleaseRunnerPath = path.join(root, 'scripts', 'fdroid', 'run-release-verification.sh');
const fdroidDerivePath = path.join(root, 'scripts', 'fdroid', 'derive-source-metadata.py');
const fdroidDeriveTestPath = path.join(root, 'scripts', 'fdroid', 'test-derive-source-metadata.py');
const legacyBuildserverScriptPath = path.join(root, 'scripts', 'run-fdroid-buildserver-simulation.sh');
const errors = [];
let fdroidPinnedImage = null;
let fdroidserverPin = null;
let fdroiddataPin = null;
if (fs.existsSync(fdroidPinsPath)) {
  const pins = fs.readFileSync(fdroidPinsPath, 'utf8');
  fdroidPinnedImage = pins.match(/^FDROID_BUILDSERVER_IMAGE="([^"]+)"$/m)?.[1] ?? null;
  fdroidserverPin = pins.match(/^FDROIDSERVER_COMMIT="([0-9a-f]{40})"$/m)?.[1] ?? null;
  fdroiddataPin = pins.match(/^FDROIDDATA_COMMIT="([0-9a-f]{40})"$/m)?.[1] ?? null;
}
const expect = (condition, message) => {
  if (!condition) errors.push(message);
};

const expo = app.expo ?? {};
const android = expo.android ?? {};
const versionName = expo.version;
const versionCode = android.versionCode;
const abis = JSON.parse(fs.readFileSync(path.join(root, "scripts/android-release-abis.json"), "utf8"));
const splitCodes = Object.values(abis).map((offset) => versionCode * 10 + offset);

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
  const changelogPath = path.join(dir, 'changelogs', `${splitCodes[0]}.txt`);

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
expect(fs.existsSync(fdroidPinsPath), 'scripts/fdroid/pins.env is missing');
expect(fs.existsSync(fdroidLibPath), 'scripts/fdroid/lib-buildserver.sh is missing');
expect(fs.existsSync(fdroidSourceRunnerPath), 'scripts/fdroid/run-source-build.sh is missing');
expect(fs.existsSync(fdroidReleaseRunnerPath), 'scripts/fdroid/run-release-verification.sh is missing');
expect(fs.existsSync(fdroidDerivePath), 'scripts/fdroid/derive-source-metadata.py is missing');
expect(fs.existsSync(fdroidDeriveTestPath), 'scripts/fdroid/test-derive-source-metadata.py is missing');
expect(!fs.existsSync(legacyBuildserverScriptPath), 'legacy mode-switching F-Droid simulation script must remain removed');

if (fs.existsSync(fdroidPath)) {
  const fdroid = fs.readFileSync(fdroidPath, 'utf8');
  expect(fdroid.includes(`versionName: ${versionName}`) || fdroid.includes(`versionName: '${versionName}'`), `.fdroid.yml must use versionName ${versionName}`);
  for (const code of splitCodes) expect(fdroid.includes(`versionCode: ${code}\n`), `.fdroid.yml must include ABI versionCode ${code}`);
  expect(fdroid.includes(`commit: v${versionName}`), `.fdroid.yml must build tag v${versionName}`);
  expect(fdroid.includes('ndk: r27b'), '.fdroid.yml must pin Android NDK r27b for Expo SDK 57 / React Native 0.86');
  expect(fdroid.includes('AuthorName: Kees van \'t Slot'), '.fdroid.yml must declare the upstream author');
  expect(fdroid.includes('RepoType: git'), '.fdroid.yml must declare RepoType: git');
  expect(fdroid.includes('https://github.com/DitisKees/homelibrary-app'), '.fdroid.yml must reference the public upstream repository');
  expect(!/^Binaries:/m.test(fdroid), '.fdroid.yml must use per-ABI binary URLs, not a universal Binaries URL');
  for (const abi of Object.keys(abis)) {
    expect(fdroid.includes(`HomeLibrary-%v-${abi}.apk`), `missing signed binary URL for ${abi}`);
    expect(fdroid.includes(`-PreactNativeArchitectures=${abi}`), `missing native build selection for ${abi}`);
    for (const locale of localeSpecs.map(([locale]) => locale)) {
      for (const code of splitCodes) expect(fs.existsSync(path.join(root, 'fastlane/metadata/android', locale, 'changelogs', `${code}.txt`)), `missing ${locale} split changelog ${code}`);
    }
  }
  expect(!/^\s*subdir:/m.test(fdroid), '.fdroid.yml must not declare subdir because Expo generates android/ after checkout');
  expect(fdroid.includes('output: android/app/build/outputs/apk/release/app-release-unsigned.apk'), '.fdroid.yml must declare the generated unsigned APK output');
  expect(fdroid.includes('cd android/app'), '.fdroid.yml must build from the generated Android app directory');
  expect(fdroid.includes('gradle assembleRelease'), '.fdroid.yml must use F-Droid system Gradle after scanner removes the wrapper');
  expect(fdroid.includes("jvmToolchain\\|JavaVersion/s/17/21/"), '.fdroid.yml must apply F-Droid React Native Java 17-to-21 toolchain compatibility');
  expect(fdroid.indexOf('sed -i -e \'s/"node"') < fdroid.indexOf('npm ci'), '.fdroid.yml must relax the Node engine ceiling before npm ci');
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
  expect(fdroid.includes(`CurrentVersionCode: ${Math.max(...splitCodes)}`), `.fdroid.yml CurrentVersionCode must be ${versionCode}`);
}

if (fs.existsSync(releaseWorkflowPath)) {
  const releaseWorkflow = fs.readFileSync(releaseWorkflowPath, 'utf8');
  expect(releaseWorkflow.includes("tags:\n      - 'v*.*.*'"), 'Android release workflow must run for immutable semantic-version tags');
  expect(releaseWorkflow.includes('release_tag:'), 'Android release workflow must support recovery from an existing immutable release tag');
  expect(releaseWorkflow.includes("ref: ${{ inputs.release_tag && github.sha || github.ref }}"), 'Android release recovery must use current main harness tooling while F-Droid builds the immutable tag SHA');
  expect(releaseWorkflow.includes('build-tools;34.0.0'), 'Android release workflow must use apksigner from Android build-tools 34.0.0 for F-Droid signature-copy compatibility');
  expect(releaseWorkflow.includes('HomeLibrary-${HOMELIBRARY_RELEASE_VERSION}-${ABI}.apk'), 'Android release workflow must produce a versioned stable APK filename');
  expect(fdroidPinnedImage && releaseWorkflow.includes(fdroidPinnedImage), 'Android release workflow must use the image declared in scripts/fdroid/pins.env');
  expect(releaseWorkflow.includes('scripts/fdroid/run-source-build.sh'), 'Android release workflow must build unsigned APKs through the explicit source runner');
  expect(releaseWorkflow.includes('FDROID_RELEASE_SOURCE_SHA'), 'Android release workflow must pass the resolved immutable source SHA into the source runner');
  expect(releaseWorkflow.includes('git fetch --force origin "refs/tags/${RELEASE_TAG}:refs/tags/${RELEASE_TAG}"'), 'Android release recovery must resolve the immutable tag explicitly rather than running harness code from the old tag');
  expect(releaseWorkflow.includes('scripts/fdroid/run-release-verification.sh'), 'Android release workflow must verify published APKs through the explicit release runner');
  expect(!releaseWorkflow.includes('run-fdroid-buildserver-simulation.sh'), 'Android release workflow must not use the legacy mode-switching harness');
  expect(!releaseWorkflow.includes('FDROID_SIMULATION_'), 'Android release workflow must not use legacy mode-switching environment variables');
  expect(releaseWorkflow.includes('fdroid-buildserver-output/app-release-unsigned.apk'), 'Android release workflow must sign the APK produced by the F-Droid buildserver path');
  expect(releaseWorkflow.includes('verify-fdroid-release-parity'), 'Android release workflow must run F-Droid signed-reference parity verification');
  expect(releaseWorkflow.includes('inputs.release_tag && github.sha || needs.sign-and-publish.outputs.release_tag'), 'release recovery parity must use current main tooling while metadata targets the immutable tag');
  expect(releaseWorkflow.includes('gh release upload'), 'Android release workflow must publish the signed APK to the GitHub Release for the immutable tag');
  expect(!releaseWorkflow.includes('--clobber'), 'Android release workflow must never overwrite immutable release assets');
  expect(releaseWorkflow.includes('Refusing to overwrite an immutable release asset'), 'Android release recovery must fail when an existing APK differs');
}

if (fs.existsSync(buildserverSimulationWorkflowPath)) {
  const workflow = fs.readFileSync(buildserverSimulationWorkflowPath, 'utf8');
  expect(fdroidPinnedImage && workflow.includes(fdroidPinnedImage), 'F-Droid simulation must use the image declared in scripts/fdroid/pins.env');
  expect(workflow.includes('scripts/fdroid/run-source-build.sh'), 'F-Droid simulation must call the explicit source-build runner');
  expect(!workflow.includes('run-fdroid-buildserver-simulation.sh'), 'F-Droid simulation must not call the legacy mode-switching harness');
  expect(!workflow.includes('FDROID_SIMULATION_'), 'F-Droid simulation must not use legacy mode-switching environment variables');
  expect(workflow.includes('github.event.pull_request.head.sha || github.sha'), 'F-Droid simulation must build the PR head/source commit rather than the synthetic merge commit');
  expect(workflow.includes('matrix:\n        copy: [a, b]'), 'F-Droid simulation must run two independent buildserver copies');
  expect(workflow.includes('cmp --silent'), 'F-Droid simulation must byte-compare the independent buildserver APKs');
  expect(workflow.includes('Verify container checkout Git access'), 'F-Droid simulation must regression-test Git workspace ownership inside the buildserver container');
}

if (fs.existsSync(fdroidPinsPath)) {
  expect(fdroidPinnedImage?.includes('@sha256:'), 'F-Droid buildserver image must be pinned by digest');
  expect(Boolean(fdroidserverPin), 'fdroidserver must be pinned to a full commit SHA');
  expect(Boolean(fdroiddataPin), 'fdroiddata must be pinned to a full commit SHA');
}

if (fs.existsSync(fdroidLibPath)) {
  const lib = fs.readFileSync(fdroidLibPath, 'utf8');
  expect(lib.includes('fdroid_clone_exact'), 'F-Droid harness must clone exact pinned commits');
  expect(lib.includes('FDROIDSERVER_COMMIT'), 'F-Droid harness must consume the fdroidserver pin');
  expect(lib.includes('FDROIDDATA_COMMIT'), 'F-Droid harness must consume the fdroiddata pin');
  expect(lib.includes('--refresh-scanner'), 'F-Droid harness must run the live source scanner');
  expect(lib.includes('--on-server'), 'F-Droid harness must exercise the buildserver path');
  expect(lib.includes('--no-tarball'), 'F-Droid harness must mirror the fdroiddata build command');
  expect(!lib.includes('git pull'), 'F-Droid harness must never git-pull moving branches during a build');
  expect(!lib.includes('dist-upgrade'), 'F-Droid harness must never dist-upgrade the pinned buildserver image during a build');
}

if (fs.existsSync(fdroidDerivePath)) {
  const derive = fs.readFileSync(fdroidDerivePath, 'utf8');
  expect(derive.includes('metadata.parse_metadata'), 'source metadata must be parsed structurally with fdroidserver');
  expect(derive.includes('metadata.write_metadata'), 'source metadata must be written canonically with fdroidserver');
  expect(derive.includes('app.pop("Binaries", None)'), 'source metadata derivation must remove Binaries structurally');
  expect(derive.includes('app.pop("AllowedAPKSigningKeys", None)'), 'source metadata derivation must remove AllowedAPKSigningKeys structurally');
  expect(!derive.includes('re.sub'), 'source metadata derivation must not edit YAML with regexes');
}

if (fs.existsSync(fdroidSourceRunnerPath)) {
  const sourceRunner = fs.readFileSync(fdroidSourceRunnerPath, 'utf8');
  expect(sourceRunner.includes('test-derive-source-metadata.py'), 'source runner must execute fast metadata-derivation tests before Android work');
  expect(sourceRunner.includes('derive-source-metadata.py'), 'source runner must structurally derive candidate metadata');
  expect(sourceRunner.includes('fdroid_assert_metadata_canonical'), 'source runner must require canonical generated metadata');
  expect(!sourceRunner.includes('run-release-verification.sh'), 'source runner must not share release-verification control flow');
}

if (fs.existsSync(fdroidReleaseRunnerPath)) {
  const releaseRunner = fs.readFileSync(fdroidReleaseRunnerPath, 'utf8');
  expect(releaseRunner.includes('fdroid_install_metadata "${METADATA_SOURCE}"'), 'release runner must install canonical metadata without transformation');
  expect(releaseRunner.includes('fdroid_checkupdates'), 'release runner must mirror F-Droid update checks');
  expect(releaseRunner.includes('fdroid_build'), 'release runner must execute the F-Droid signed-reference build');
  expect(!releaseRunner.includes('derive-source-metadata.py'), 'release verification must never derive or mutate source-test metadata');
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
process.stdout.write('F-Droid harness OK: canonical metadata, pinned toolchain inputs, separate source/release runners, structural source-metadata derivation, and two-build reproducibility are enforced.\n');
