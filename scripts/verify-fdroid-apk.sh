#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK="${1:-$ROOT/android/app/build/outputs/apk/release/app-release.apk}"
EXPECTED_PACKAGE="io.github.ditiskees.homelibrary"
EXPECTED_TARGET_SDK="36"

if [[ ! -f "$APK" ]]; then
  echo "[FAIL] Release APK not found: $APK" >&2
  exit 1
fi

SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$SDK_ROOT" || ! -d "$SDK_ROOT/build-tools" ]]; then
  echo "[FAIL] ANDROID_HOME or ANDROID_SDK_ROOT must point to an Android SDK with build-tools installed." >&2
  exit 2
fi

AAPT="$(find "$SDK_ROOT/build-tools" -maxdepth 2 -type f -name aapt | sort -V | tail -n 1)"
if [[ -z "$AAPT" ]]; then
  echo "[FAIL] Could not locate aapt in $SDK_ROOT/build-tools." >&2
  exit 2
fi

BADGING="$($AAPT dump badging "$APK")"

if ! grep -Fq "package: name='$EXPECTED_PACKAGE'" <<<"$BADGING"; then
  echo "[FAIL] APK package name is not $EXPECTED_PACKAGE." >&2
  grep -m1 '^package:' <<<"$BADGING" >&2 || true
  exit 1
fi

if ! grep -Fq "targetSdkVersion:'$EXPECTED_TARGET_SDK'" <<<"$BADGING"; then
  echo "[FAIL] APK targetSdkVersion is not $EXPECTED_TARGET_SDK." >&2
  grep -m1 '^targetSdkVersion:' <<<"$BADGING" >&2 || true
  exit 1
fi

SHA256="$(sha256sum "$APK" | awk '{print $1}')"
echo "[PASS] Source-built release APK package: $EXPECTED_PACKAGE"
echo "[PASS] Source-built release APK targetSdkVersion: $EXPECTED_TARGET_SDK"
echo "APK SHA-256: $SHA256"
