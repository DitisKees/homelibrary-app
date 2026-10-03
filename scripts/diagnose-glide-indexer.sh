#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PATCHED_JAR="$ROOT/build/repro-maven/com/github/bumptech/glide/ksp/5.0.5/ksp-5.0.5.jar"
test -f "$PATCHED_JAR"
echo "=== use prebuilt deterministic Glide 5.0.5 KSP processor ==="
sha256sum "$PATCHED_JAR"

echo "=== Expo 57 prebuild ==="
rm -rf android
npx expo prebuild --clean --platform android --no-install
bash scripts/prepare-android-gradle-properties.sh
echo "=== generated Android toolchain ==="
grep distributionUrl android/gradle/wrapper/gradle-wrapper.properties
grep -E 'android\.(compileSdkVersion|targetSdkVersion|buildToolsVersion)' android/gradle.properties || true

echo "=== verify stock Expo image dependency remains untouched ==="
EXPO_IMAGE_GRADLE="$ROOT/node_modules/expo-image/android/build.gradle"
test -f "$EXPO_IMAGE_GRADLE"
grep -F 'def GLIDE_VERSION = "5.0.5"' "$EXPO_IMAGE_GRADLE"
grep -F 'ksp "com.github.bumptech.glide:ksp:' "$EXPO_IMAGE_GRADLE"

echo "=== verify declarative dependency redirect on actual resolvable KSP classpath ==="
(
  cd android
  ./gradlew -I ../scripts/glide-ksp-repro.init.gradle :expo-image:homeLibraryGlideKspResolution |
    tee "$ROOT/diagnostic-output-glide-dependencies.txt"
)
grep -F 'HOMELIBRARY_KSP_RESOLVED=com.github.bumptech.glide:ksp:5.0.5' "$ROOT/diagnostic-output-glide-dependencies.txt"
grep -F 'HOMELIBRARY_KSP_PATCHED=' "$ROOT/diagnostic-output-glide-dependencies.txt"
grep -F 'HOMELIBRARY_KSP_KOTLINPOET=' "$ROOT/diagnostic-output-glide-dependencies.txt"

echo "=== run expo-image KSP only ==="
(
  cd android
  ./gradlew -I ../scripts/glide-ksp-repro.init.gradle --no-daemon --max-workers=1 :expo-image:kspReleaseKotlin
)

OUT="$ROOT/diagnostic-output/glide-indexer"
rm -rf "$OUT"
mkdir -p "$OUT"
find "$ROOT/node_modules/expo-image/android/build" -type f \( -name 'GlideIndexer_*.java' -o -name 'GlideIndexer_*.kt' -o -name 'GlideIndexer_*.class' \) -print0 |
  sort -z |
  while IFS= read -r -d '' f; do
    rel="${f#"$ROOT/"}"
    printf '%s  %s\n' "$(sha256sum "$f" | awk '{print $1}')" "$rel"
  done | tee "$OUT/hashes.txt"

test -s "$OUT/hashes.txt"
echo "=== generated Glide indexers ==="
cat "$OUT/hashes.txt"
