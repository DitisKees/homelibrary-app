#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Normalize absolute checkout paths embedded by native C/C++ compilation. CMake
# reads these flags when each Android native project is configured, so builds
# from different checkout directories produce the same object code/build IDs.
MAP_ROOT="/homelibrary-src"
PREFIX_MAP_FLAGS="-ffile-prefix-map=$ROOT=$MAP_ROOT -fdebug-prefix-map=$ROOT=$MAP_ROOT"
export CFLAGS="${CFLAGS:-} $PREFIX_MAP_FLAGS"
export CXXFLAGS="${CXXFLAGS:-} $PREFIX_MAP_FLAGS"
export CPPFLAGS="${CPPFLAGS:-} $PREFIX_MAP_FLAGS"

# Mirror the fdroiddata React Native recipe. Keep this deliberately simple:
# dependency install, Expo source build/prebuild, signing cleanup, then Gradle.
# Debian forky supplies Node.js/npm in CI and on the F-Droid builder.

# Forky's Node may be newer than the conservative upper bound on the release tag.
# Match the fdroiddata recipe by removing only that upper bound.
sed -i -e 's/"node": ">=22.13.0 <23"/"node": ">=22.13.0"/' package.json

npm ci

# F-Droid's React Native template builds Expo native modules from source.
# package.json already contains this setting, but enforce it for parity.
node - <<'NODE'
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.expo ??= {};
p.expo.autolinking ??= {};
p.expo.autolinking.android ??= {};
p.expo.autolinking.android.buildFromSource = ['.*'];
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
NODE

# Do not use bundled Expo Maven AARs.
find node_modules -type d -name local-maven-repo -prune -exec rm -rf {} +

npx expo prebuild -p android --clean

# Verify Expo Camera's source-build switch before appending release-only Gradle
# settings, and normalize the generated file's trailing newline so the appended
# properties cannot become part of the barcode-scanner value.
bash scripts/prepare-android-gradle-properties.sh

# GitHub-hosted runners have limited memory. Source-building every Expo/React
# Native module can exhaust the Kotlin compiler's default metaspace. Keep the
# build bounded and avoid parallel compiler/Gradle workers competing for RAM.
cat >> android/gradle.properties <<'EOF'
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
org.gradle.workers.max=1
kotlin.daemon.jvmargs=-Xmx1536m
EOF

# Re-check after the append and audit the exact runtime graph that will be
# packaged into the release APK.
bash scripts/prepare-android-gradle-properties.sh
bash scripts/check-fdroid-android-dependencies.sh

# externalNativeBuild prefix maps are generated upstream by
# plugins/with-reproducible-native-builds.js during Expo prebuild. Keep this
# recipe free of generated-Gradle patching so F-Droid metadata can use the
# source-controlled configuration directly.
sed -i -e '/signingConfig /d' android/app/build.gradle

(
  cd android
  ./gradlew :app:assembleRelease --no-daemon
)

APK="$ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
test -f "$APK"

# Normalize remaining GNU SHA-1 build-id notes with the checked-in helper.
python3 scripts/normalize-fdroid-apk-build-ids.py "$APK"
bash scripts/verify-fdroid-apk.sh "$APK"

echo "[PASS] F-Droid recipe-compatible unsigned Android build completed."
