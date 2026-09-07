#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"

if [[ ! -d "$ANDROID_DIR" ]]; then
  echo "android/ is missing; run 'npx expo prebuild --no-install --platform android' first." >&2
  exit 2
fi

TMP_OUTPUT="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT"' EXIT

(
  cd "$ANDROID_DIR"
  ./gradlew :app:dependencies \
    --configuration debugRuntimeClasspath \
    --console=plain \
    --no-daemon
) >"$TMP_OUTPUT"

for forbidden in \
  'com.google.android.gms:' \
  'com.google.firebase:' \
  'com.google.mlkit:' \
  'com.google.android.play:'
do
  if grep -Fq "$forbidden" "$TMP_OUTPUT"; then
    echo "[FAIL] Forbidden F-Droid dependency found: $forbidden" >&2
    grep -F "$forbidden" "$TMP_OUTPUT" >&2 || true
    exit 1
  fi
done

if ! grep -Fq 'com.google.zxing:core:3.5.4' "$TMP_OUTPUT"; then
  echo "[FAIL] Expected FOSS scanner dependency com.google.zxing:core:3.5.4 was not found." >&2
  exit 1
fi

echo "[PASS] Android runtime graph contains ZXing Core 3.5.4 and no Google Play Services, Firebase, ML Kit, or Play SDK artifacts."
