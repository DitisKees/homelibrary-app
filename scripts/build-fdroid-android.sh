#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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
bash scripts/check-fdroid-android-dependencies.sh

(
  cd android
  ./gradlew :app:assembleRelease --no-daemon
)

bash scripts/verify-fdroid-apk.sh

echo "[PASS] Clean Android source build completed without bundled Expo AARs, EAS, private registries, private files, or signing secrets."
