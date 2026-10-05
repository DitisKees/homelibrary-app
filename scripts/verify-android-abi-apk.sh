#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK="${1:?APK required}"
ABI="${2:?ABI required}"
SDK_ROOT="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
AAPT="$(find "$SDK_ROOT/build-tools" -maxdepth 2 -type f -name aapt | sort -V | tail -n 1)"
test -x "$AAPT"
python3 "$ROOT/scripts/verify-android-abi-apk.py" "$APK" "$ABI" "$ROOT" "$AAPT"
