#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PATCHED_JAR="$ROOT/build/repro-maven/com/github/bumptech/glide/ksp/5.0.5-homelibrary-repro1/ksp-5.0.5-homelibrary-repro1.jar"
test -f "$PATCHED_JAR"
echo "=== use prebuilt deterministic Glide 5.0.5 KSP processor ==="
sha256sum "$PATCHED_JAR"

echo "=== Expo 57 prebuild ==="
rm -rf android
npx expo prebuild --clean --platform android --no-install

EXPO_IMAGE_GRADLE="$ROOT/node_modules/expo-image/android/build.gradle"
test -f "$EXPO_IMAGE_GRADLE"
grep -F 'def GLIDE_VERSION = "5.0.5"' "$EXPO_IMAGE_GRADLE"

python3 - "$EXPO_IMAGE_GRADLE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text()
needle='ksp "com.github.bumptech.glide:ksp:$GLIDE_VERSION"'
replacement='ksp files(rootProject.file("../build/repro-maven/com/github/bumptech/glide/ksp/5.0.5-homelibrary-repro1/ksp-5.0.5-homelibrary-repro1.jar"))'
if s.count(needle) != 1:
    raise SystemExit("expected expo-image Glide KSP dependency exactly once")
p.write_text(s.replace(needle,replacement))
PY
grep -nF 'ksp files' "$EXPO_IMAGE_GRADLE"

echo "=== run expo-image KSP only ==="
(
  cd android
  ./gradlew --no-daemon --max-workers=1 :expo-image:kspReleaseKotlin
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
