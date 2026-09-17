#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Native React Native/Expo builds embed absolute source paths in ELF objects.
# Compiler-prefix-map injection is not reliable across all of the independently
# configured CMake projects in the React Native dependency graph. Build from one
# fixed absolute path instead. This removes the checkout directory itself as an
# input to the native binaries, both in CI and on the F-Droid builder.
CANONICAL_ROOT="/tmp/homelibrary-fdroid-source"

if [[ "${HOMELIBRARY_CANONICAL_BUILD:-0}" != "1" ]]; then
  echo "Staging source at canonical build root: ${CANONICAL_ROOT}"
  rm -rf "$CANONICAL_ROOT"
  mkdir -p "$CANONICAL_ROOT"

  # Copy only source-controlled/build-input content. In particular, never carry
  # node_modules, generated android output, Gradle state, or Git metadata from
  # the caller into the canonical build.
  tar \
    --exclude='./.git' \
    --exclude='./node_modules' \
    --exclude='./android' \
    --exclude='./.gradle' \
    -C "$ROOT" -cf - . | tar -C "$CANONICAL_ROOT" -xf -

  HOMELIBRARY_CANONICAL_BUILD=1 bash "$CANONICAL_ROOT/scripts/build-fdroid-android.sh"

  BUILT_APK="$CANONICAL_ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
  test -f "$BUILT_APK"
  mkdir -p "$ROOT/android/app/build/outputs/apk/release"
  cp "$BUILT_APK" "$ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
  echo "[PASS] Canonical-path APK copied back to caller checkout."
  exit 0
fi

cd "$ROOT"
if [[ "$ROOT" != "$CANONICAL_ROOT" ]]; then
  echo "Canonical build guard failed: expected $CANONICAL_ROOT, got $ROOT" >&2
  exit 1
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

APK="$ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
bash scripts/verify-fdroid-apk.sh "$APK"

echo "[PASS] Clean reproducible Android source build completed from canonical source root without bundled Expo AARs, EAS, private registries, private files, or signing secrets."
