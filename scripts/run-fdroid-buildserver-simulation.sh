#!/usr/bin/env bash
set -euo pipefail

APP_ID="io.github.ditiskees.homelibrary"
SOURCE_REF="${1:-${FDROID_SIMULATION_SOURCE_REF:-}}"
METADATA_SOURCE="${2:-.fdroid.yml}"
MODE="${3:-${FDROID_SIMULATION_MODE:-source}}"
EXPORT_APK="${FDROID_SIMULATION_EXPORT_APK:-}"

if [[ "$MODE" != "source" && "$MODE" != "release" ]]; then
  echo "[FAIL] FDROID_SIMULATION_MODE must be 'source' or 'release'." >&2
  exit 2
fi

if [[ "$MODE" == "source" && -z "$SOURCE_REF" ]]; then
  echo "[FAIL] A source commit SHA is required for source mode." >&2
  exit 2
fi

if [[ ! -f "$METADATA_SOURCE" ]]; then
  echo "[FAIL] F-Droid metadata not found: $METADATA_SOURCE" >&2
  exit 2
fi

ROOT="${GITHUB_WORKSPACE:-$(pwd)}"
SIM_ROOT="$ROOT/.fdroid-buildserver-simulation"
DIAG_ROOT="$ROOT/fdroid-buildserver-diagnostics"
FDROIDDATA_DIR="$SIM_ROOT/fdroiddata"
FDROIDSERVER_DIR="$SIM_ROOT/fdroidserver"
CANDIDATE_METADATA="$SIM_ROOT/${APP_ID}.yml"
BUILD_LOG="$DIAG_ROOT/fdroid-build.log"

rm -rf "$SIM_ROOT" "$DIAG_ROOT"
mkdir -p "$SIM_ROOT" "$DIAG_ROOT"

VERSION_CODE="$(python3 - <<'PY'
import json
with open("app.json", "r", encoding="utf-8") as handle:
    print(json.load(handle)["expo"]["android"]["versionCode"])
PY
)"
BUILD_SPEC="${APP_ID}:${VERSION_CODE}"

find_unsigned_apk() {
  local candidates=(
    "/home/vagrant/unsigned/${APP_ID}_${VERSION_CODE}.apk"
    "/home/vagrant/build/${APP_ID}/android/app/build/outputs/apk/release/app-release-unsigned.apk"
    "/home/vagrant/tmp/${APP_ID}_${VERSION_CODE}.apk"
  )
  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

collect_diagnostics() {
  set +e
  mkdir -p "$DIAG_ROOT"
  cp -f "$CANDIDATE_METADATA" "$DIAG_ROOT/metadata-used.yml" 2>/dev/null || true

  local build_root="/home/vagrant/build/$APP_ID"
  if [[ -d "$build_root" ]]; then
    for rel in \
      android/settings.gradle \
      android/app/build.gradle \
      android/gradle.properties \
      node_modules/@react-native-async-storage/async-storage/android/build.gradle \
      node_modules/react-native-safe-area-context/android/build.gradle \
      node_modules/react-native-screens/android/build.gradle
    do
      if [[ -f "$build_root/$rel" ]]; then
        mkdir -p "$DIAG_ROOT/source/$(dirname "$rel")"
        cp -f "$build_root/$rel" "$DIAG_ROOT/source/$rel"
      fi
    done
  fi

  {
    echo "mode=$MODE"
    echo "build_spec=$BUILD_SPEC"
    echo "source_ref=$SOURCE_REF"
    printf 'node='; node --version 2>/dev/null || true
    printf 'npm='; npm --version 2>/dev/null || true
    printf 'java='; java -version 2>&1 | head -n 1 || true
    if command -v gradle >/dev/null 2>&1; then
      gradle --version 2>/dev/null | sed -n '1,8p' || true
    fi
    if [[ -d "$FDROIDSERVER_DIR/.git" ]]; then
      echo "fdroidserver=$(git -C "$FDROIDSERVER_DIR" rev-parse HEAD 2>/dev/null || true)"
    fi
    if [[ -d "$FDROIDDATA_DIR/.git" ]]; then
      echo "fdroiddata=$(git -C "$FDROIDDATA_DIR" rev-parse HEAD 2>/dev/null || true)"
    fi
  } > "$DIAG_ROOT/toolchain.txt"

  local apk=""
  apk="$(find_unsigned_apk 2>/dev/null || true)"
  if [[ -n "$apk" ]]; then
    cp -f "$apk" "$DIAG_ROOT/fdroid-unsigned.apk" 2>/dev/null || true
    sha256sum "$apk" > "$DIAG_ROOT/fdroid-unsigned.apk.sha256" 2>/dev/null || true
  fi

  if [[ -d /home/vagrant/logs ]]; then
    find /home/vagrant/logs -maxdepth 2 -type f -size -10M -exec cp -t "$DIAG_ROOT" {} + 2>/dev/null || true
  fi
}
trap collect_diagnostics EXIT

echo "[INFO] Preparing F-Droid buildserver simulation for $BUILD_SPEC in $MODE mode"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y dist-upgrade
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  ca-certificates git sudo openjdk-21-jdk-headless python3

if [[ -f /etc/profile.d/bsenv.sh ]]; then
  # shellcheck disable=SC1091
  source /etc/profile.d/bsenv.sh
fi

home_vagrant="${home_vagrant:-/home/vagrant}"
ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export ANDROID_HOME ANDROID_SDK_ROOT

SDKMANAGER="$(command -v sdkmanager || true)"
if [[ -z "$SDKMANAGER" && -x "$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager" ]]; then
  SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
fi
if [[ -z "$SDKMANAGER" ]]; then
  echo "[FAIL] sdkmanager is unavailable in the F-Droid buildserver image." >&2
  exit 2
fi
"$SDKMANAGER" "platform-tools" "build-tools;31.0.0" >/dev/null

rm -rf "$FDROIDSERVER_DIR"
git clone --quiet --shallow-since=2026-07-13 https://gitlab.com/fdroid/fdroidserver.git "$FDROIDSERVER_DIR"
git -C "$FDROIDSERVER_DIR" config transfer.fsckObjects true
git -C "$FDROIDSERVER_DIR" checkout --quiet -B master a35fdfddd9c66823987a410566a6101186e39c84
git -C "$FDROIDSERVER_DIR" pull --quiet origin master --ff-only

rm -rf "$FDROIDDATA_DIR"
git clone --quiet --depth 1 https://gitlab.com/fdroid/fdroiddata.git "$FDROIDDATA_DIR"

if [[ -d "$home_vagrant/gradlew-fdroid/.git" ]]; then
  git -C "$home_vagrant/gradlew-fdroid" pull --quiet --ff-only
fi

python3 - "$METADATA_SOURCE" "$CANDIDATE_METADATA" "$SOURCE_REF" "$MODE" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1]).read_text(encoding="utf-8")
out = Path(sys.argv[2])
ref = sys.argv[3]
mode = sys.argv[4]

if mode == "source":
    source = re.sub(r"(?m)^(    commit:)\s+.*$", rf"\1 {ref}", source, count=1)
    source = re.sub(r"(?m)^Binaries:\n  https://[^\n]+\n", "", source, count=1)
    source = re.sub(r"(?m)^AllowedAPKSigningKeys:[^\n]+\n\n?", "", source, count=1)
else:
    if "Binaries:" not in source or "AllowedAPKSigningKeys:" not in source:
        raise SystemExit("release mode requires Binaries and AllowedAPKSigningKeys")

out.write_text(source, encoding="utf-8")
PY

mkdir -p \
  "$home_vagrant/build" \
  "$home_vagrant/logs" \
  "$home_vagrant/tmp" \
  "$home_vagrant/unsigned" \
  "$home_vagrant/.android" \
  "$home_vagrant/.gradle" \
  "$home_vagrant/metadata"

cp "$CANDIDATE_METADATA" "$home_vagrant/metadata/$APP_ID.yml"
cp "$CANDIDATE_METADATA" "$FDROIDDATA_DIR/metadata/$APP_ID.yml"

rm -f "$home_vagrant/fdroiddata"
ln -s "$FDROIDDATA_DIR" "$home_vagrant/fdroiddata"

chown -R vagrant "$home_vagrant" "$FDROIDDATA_DIR" "$FDROIDSERVER_DIR"
export GRADLE_USER_HOME="$home_vagrant/.gradle"

fdroid_as_vagrant() {
  sudo --preserve-env --user vagrant \
    env \
      PATH="$FDROIDSERVER_DIR:$PATH" \
      PYTHONPATH="$FDROIDSERVER_DIR:$FDROIDSERVER_DIR/examples" \
      PYTHONUNBUFFERED=true \
      TERM="${TERM:-xterm}" \
      HOME="$home_vagrant" \
      ANDROID_HOME="$ANDROID_HOME" \
      ANDROID_SDK_ROOT="$ANDROID_SDK_ROOT" \
      GRADLE_USER_HOME="$GRADLE_USER_HOME" \
      fdroid "$@"
}

# Mirror the parent fdroiddata metadata jobs before doing the expensive build.
# Fail if our checked-in/effective recipe is not already in fdroidserver's
# canonical rewritemeta form; this prevents formatting-only remote failures.
cp "$FDROIDDATA_DIR/metadata/$APP_ID.yml" "$DIAG_ROOT/metadata-before-rewritemeta.yml"
pushd "$FDROIDDATA_DIR" >/dev/null
fdroid_as_vagrant lint "$APP_ID"
fdroid_as_vagrant rewritemeta "$APP_ID"
if ! cmp --silent "$DIAG_ROOT/metadata-before-rewritemeta.yml" "$FDROIDDATA_DIR/metadata/$APP_ID.yml"; then
  cp -f "$FDROIDDATA_DIR/metadata/$APP_ID.yml" "$DIAG_ROOT/metadata-after-rewritemeta.yml"
  echo "[FAIL] Effective F-Droid metadata is not canonical according to fdroid rewritemeta." >&2
  diff -u "$DIAG_ROOT/metadata-before-rewritemeta.yml" "$FDROIDDATA_DIR/metadata/$APP_ID.yml" || true
  exit 2
fi
popd >/dev/null

pushd "$home_vagrant" >/dev/null
fdroid_as_vagrant fetchsrclibs "$BUILD_SPEC" --verbose

set +e
(
  unset CI
  fdroid_as_vagrant build \
    --verbose \
    --test \
    --refresh-scanner \
    --on-server \
    --no-tarball \
    "$BUILD_SPEC"
) 2>&1 | tee "$BUILD_LOG"
status=${PIPESTATUS[0]}
set -e
popd >/dev/null

if [[ "$status" -ne 0 ]]; then
  echo "[FAIL] F-Droid buildserver simulation failed for $BUILD_SPEC in $MODE mode." >&2
  exit "$status"
fi

if [[ "$MODE" == "release" ]]; then
  # Mirror the parent checkupdates job once the immutable tag exists. --allow-dirty
  # prevents the check from rejecting our temporary effective metadata.
  pushd "$FDROIDDATA_DIR" >/dev/null
  fdroid_as_vagrant checkupdates --allow-dirty -v "$APP_ID"
  popd >/dev/null
fi

if [[ -n "$EXPORT_APK" ]]; then
  apk="$(find_unsigned_apk || true)"
  if [[ -z "$apk" ]]; then
    echo "[FAIL] F-Droid build succeeded but its unsigned APK could not be located." >&2
    exit 2
  fi
  mkdir -p "$(dirname "$EXPORT_APK")"
  cp -f "$apk" "$EXPORT_APK"
  sha256sum "$EXPORT_APK"
fi

if [[ "$MODE" == "release" ]]; then
  echo "[PASS] F-Droid signed-reference parity verification succeeded for $BUILD_SPEC."
else
  echo "[PASS] F-Droid source buildserver simulation succeeded for $BUILD_SPEC."
fi
