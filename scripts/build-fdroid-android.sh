#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Native React Native/Expo modules can embed their absolute source checkout path
# in ELF objects (for example through __FILE__ and debug metadata). That makes
# otherwise identical builds differ when the repository is checked out in a
# different directory, which is exactly what happens between upstream and
# F-Droid builders.
#
# Map the checkout-specific prefix to one stable virtual source root. Clang
# consumes CFLAGS/CXXFLAGS when CMake initializes its compiler flags, including
# for the native dependency projects built by Gradle.
REPRO_SOURCE_ROOT="/build/homelibrary-app"
REPRO_PREFIX_FLAGS="-ffile-prefix-map=${ROOT}=${REPRO_SOURCE_ROOT} -fdebug-prefix-map=${ROOT}=${REPRO_SOURCE_ROOT} -fmacro-prefix-map=${ROOT}=${REPRO_SOURCE_ROOT}"
export CFLAGS="${CFLAGS:-} ${REPRO_PREFIX_FLAGS}"
export CXXFLAGS="${CXXFLAGS:-} ${REPRO_PREFIX_FLAGS}"

echo "Normalizing native source paths: ${ROOT} -> ${REPRO_SOURCE_ROOT}"

if [[ -d android ]]; then
  echo "Removing existing generated android/ tree to enforce a clean source build."
  rm -rf android
fi

npm ci
npm run audit:fdroid-npm
npm run validate:android-release
npm run check:fdroid-icons
npm run validate:fdroid-metadata
bash scripts/prepare-fdroid-source-tree.sh

npx expo prebuild --clean --no-install --platform android
# F-Droid/upstream reproducibility compares the unsigned release artifact.
sed -i -e '/signingConfig /d' android/app/build.gradle
bash scripts/check-fdroid-android-dependencies.sh

(
  cd android
  ./gradlew :app:assembleRelease --no-daemon
)

bash scripts/verify-fdroid-apk.sh

echo "[PASS] Clean reproducible Android source build completed without bundled Expo AARs, EAS, private registries, private files, or signing secrets."
