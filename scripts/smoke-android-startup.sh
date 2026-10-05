#!/usr/bin/env bash
set -euo pipefail
APK="${1:?Signed x86_64 APK required}"
PACKAGE=io.github.ditiskees.homelibrary
adb install -r "$APK"
adb logcat -c
adb shell am start -W -n "$PACKAGE/.MainActivity"
APP_PID="$(adb shell pidof "$PACKAGE" | tr -d '\r')"
test -n "$APP_PID"
# Require rendered React Native content rather than merely a surviving splash
# activity. SecureStore/native module registration occurs before this UI.
for attempt in $(seq 1 30); do
  adb shell uiautomator dump /sdcard/homelibrary-ui.xml >/dev/null 2>&1 || true
  if adb shell cat /sdcard/homelibrary-ui.xml 2>/dev/null | grep -Eq 'text="[^"]*(HomeLibrary|PocketBase)[^"]*"'; then
    adb logcat -d --pid="$APP_PID" > android-startup.log
    if [[ "$(adb shell pidof "$PACKAGE" 2>/dev/null | tr -d '\r')" != "$APP_PID" ]] || grep -Eq 'FATAL EXCEPTION|Fatal signal|ReactNativeJS.*(Error:|Exception)' android-startup.log; then
      tail -n 200 android-startup.log >&2
      exit 1
    fi
    echo '[PASS] R8 release installed and rendered its initial screen.'
    exit 0
  fi
  sleep 2
done
adb logcat -d --pid="$APP_PID" > android-startup.log
tail -n 200 android-startup.log >&2
echo '[FAIL] R8 release did not render its initial screen.' >&2
exit 1
