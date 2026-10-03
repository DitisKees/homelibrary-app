#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROPERTIES_FILE="${1:-$ROOT/android/gradle.properties}"

if [[ ! -f "$PROPERTIES_FILE" ]]; then
  echo "[FAIL] Android Gradle properties file not found: $PROPERTIES_FILE" >&2
  exit 1
fi

BARCODE_PROPERTY='expo.camera.barcode-scanner-enabled=false'

# The config plugin must generate exactly one canonical override. Reject stale
# or conflicting generated projects before any resource compilation starts.
if [[ "$(grep -Ec '^[[:space:]]*reactNativeDevServerIp([[:space:]]|=|:|$)' "$PROPERTIES_FILE" || true)" != 1 ]] ||
   ! grep -qxF 'reactNativeDevServerIp=localhost' "$PROPERTIES_FILE"; then
  echo "[FAIL] Expected exactly one reactNativeDevServerIp=localhost in $PROPERTIES_FILE; rerun Expo prebuild." >&2
  exit 1
fi

if ! grep -qxF "$BARCODE_PROPERTY" "$PROPERTIES_FILE"; then
  echo "[FAIL] Expo Camera barcode scanning is not explicitly disabled in $PROPERTIES_FILE." >&2
  grep -nF 'expo.camera.barcode-scanner-enabled' "$PROPERTIES_FILE" >&2 || true
  exit 1
fi

# Expo's Gradle-properties serializer may leave the final property without a
# trailing newline. Appending release-only Gradle settings directly after that
# line would concatenate onto the value and turn "false" into a different
# string, which makes expo-camera enable its ML Kit barcode dependencies.
if [[ -s "$PROPERTIES_FILE" ]] && [[ "$(tail -c 1 "$PROPERTIES_FILE" | od -An -t x1 | tr -d '[:space:]')" != "0a" ]]; then
  printf '\n' >> "$PROPERTIES_FILE"
fi

if ! grep -qxF "$BARCODE_PROPERTY" "$PROPERTIES_FILE"; then
  echo "[FAIL] Expo Camera barcode-scanner property was corrupted while normalizing Gradle properties." >&2
  exit 1
fi

echo "[PASS] Expo Camera barcode scanning remains disabled and Gradle properties are safe to append."
