#!/usr/bin/env bash
set -euo pipefail

FDROID_HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "${FDROID_HARNESS_DIR}/../.." && pwd -P)"
# shellcheck disable=SC1091
source "${FDROID_HARNESS_DIR}/pins.env"

APP_ID="io.github.ditiskees.homelibrary"
WORK_ROOT="${REPO_ROOT}/.fdroid-buildserver"
DIAG_ROOT="${REPO_ROOT}/fdroid-buildserver-diagnostics"
FDROIDSERVER_DIR="${WORK_ROOT}/fdroidserver"
FDROIDDATA_DIR="${WORK_ROOT}/fdroiddata"
CANDIDATE_METADATA="${WORK_ROOT}/${APP_ID}.yml"
BUILD_LOG="${DIAG_ROOT}/fdroid-build.log"
home_vagrant="${home_vagrant:-/home/vagrant}"

fdroid_version_code() {
  python3 - "${REPO_ROOT}/app.json" "${FDROID_ABI:-}" "${REPO_ROOT}/scripts/android-release-abis.json" <<'PY'
import json
import sys
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    base = json.load(handle)["expo"]["android"]["versionCode"]
with open(sys.argv[3], "r", encoding="utf-8") as handle:
    abis = json.load(handle)
abi = sys.argv[2]
if abi not in abis:
    raise SystemExit("FDROID_ABI must select a supported release ABI")
print(base * 10 + abis[abi])
PY
}

fdroid_reset() {
  rm -rf "${WORK_ROOT}" "${DIAG_ROOT}"
  mkdir -p "${WORK_ROOT}" "${DIAG_ROOT}"
}

fdroid_clone_exact() {
  local url="$1"
  local destination="$2"
  local commit="$3"

  rm -rf "${destination}"
  git init -q "${destination}"
  git -C "${destination}" remote add origin "${url}"
  git -C "${destination}" fetch -q --depth 1 origin "${commit}"
  git -C "${destination}" checkout -q --detach FETCH_HEAD
  test "$(git -C "${destination}" rev-parse HEAD)" = "${commit}"
}

fdroid_prepare_environment() {
  for command in git python3 sudo java; do
    command -v "${command}" >/dev/null || {
      echo "[FAIL] Required buildserver command is missing: ${command}" >&2
      exit 2
    }
  done

  if [[ -f /etc/profile.d/bsenv.sh ]]; then
    # shellcheck disable=SC1091
    source /etc/profile.d/bsenv.sh
  fi

  export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
  export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME}}"

  local sdkmanager
  sdkmanager="$(command -v sdkmanager || true)"
  if [[ -z "${sdkmanager}" && -x "${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager" ]]; then
    sdkmanager="${ANDROID_HOME}/cmdline-tools/latest/bin/sdkmanager"
  fi
  if [[ -z "${sdkmanager}" ]]; then
    echo "[FAIL] sdkmanager is unavailable in the pinned F-Droid buildserver image." >&2
    exit 2
  fi

  "${sdkmanager}" "platform-tools" "build-tools;${FDROID_BOOTSTRAP_BUILD_TOOLS}" >/dev/null

  fdroid_clone_exact     "https://gitlab.com/fdroid/fdroidserver.git"     "${FDROIDSERVER_DIR}"     "${FDROIDSERVER_COMMIT}"

  fdroid_clone_exact     "https://gitlab.com/fdroid/fdroiddata.git"     "${FDROIDDATA_DIR}"     "${FDROIDDATA_COMMIT}"

  mkdir -p     "${home_vagrant}/build"     "${home_vagrant}/logs"     "${home_vagrant}/tmp"     "${home_vagrant}/unsigned"     "${home_vagrant}/.android"     "${home_vagrant}/.gradle"     "${home_vagrant}/metadata"

  if [[ ! -d "${home_vagrant}/gradlew-fdroid" ]]; then
    echo "[FAIL] Pinned buildserver image does not contain /home/vagrant/gradlew-fdroid." >&2
    exit 2
  fi

  rm -f "${home_vagrant}/fdroiddata"
  ln -s "${FDROIDDATA_DIR}" "${home_vagrant}/fdroiddata"
  chmod 600 "${home_vagrant}/config.yml" 2>/dev/null || true

  chown -R vagrant     "${home_vagrant}"     "${FDROIDDATA_DIR}"     "${FDROIDSERVER_DIR}"

  export GRADLE_USER_HOME="${home_vagrant}/.gradle"
}

fdroid_as_vagrant() {
  sudo --preserve-env --user vagrant     env       PATH="${FDROIDSERVER_DIR}:${PATH}"       PYTHONPATH="${FDROIDSERVER_DIR}:${FDROIDSERVER_DIR}/examples"       PYTHONUNBUFFERED=true       TERM="${TERM:-xterm}"       HOME="${home_vagrant}"       ANDROID_HOME="${ANDROID_HOME}"       ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT}"       GRADLE_USER_HOME="${GRADLE_USER_HOME}"       fdroid "$@"
}

fdroid_python() {
  PYTHONPATH="${FDROIDSERVER_DIR}:${FDROIDSERVER_DIR}/examples" python3 "$@"
}

fdroid_install_metadata() {
  local metadata_file="$1"
  cp "${metadata_file}" "${CANDIDATE_METADATA}"
  cp "${metadata_file}" "${home_vagrant}/metadata/${APP_ID}.yml"
  cp "${metadata_file}" "${FDROIDDATA_DIR}/metadata/${APP_ID}.yml"
  chown vagrant "${home_vagrant}/metadata/${APP_ID}.yml" "${FDROIDDATA_DIR}/metadata/${APP_ID}.yml"
}

fdroid_assert_metadata_canonical() {
  local before="${DIAG_ROOT}/metadata-before-rewritemeta.yml"
  local after="${FDROIDDATA_DIR}/metadata/${APP_ID}.yml"

  cp "${after}" "${before}"
  pushd "${FDROIDDATA_DIR}" >/dev/null
  fdroid_as_vagrant rewritemeta "${APP_ID}"
  popd >/dev/null

  if ! cmp --silent "${before}" "${after}"; then
    cp "${after}" "${DIAG_ROOT}/metadata-after-rewritemeta.yml"
    echo "[FAIL] F-Droid metadata is not canonical for the pinned fdroidserver." >&2
    diff -u "${before}" "${after}" || true
    exit 2
  fi
}

fdroid_lint_metadata() {
  pushd "${FDROIDDATA_DIR}" >/dev/null
  fdroid_as_vagrant lint "${APP_ID}"
  popd >/dev/null
}

fdroid_checkupdates() {
  pushd "${FDROIDDATA_DIR}" >/dev/null
  fdroid_as_vagrant checkupdates --allow-dirty -v "${APP_ID}"
  popd >/dev/null
}

fdroid_build() {
  local version_code="$1"
  local build_spec="${APP_ID}:${version_code}"

  pushd "${home_vagrant}" >/dev/null
  fdroid_as_vagrant fetchsrclibs "${build_spec}" --verbose

  set +e
  (
    unset CI
    fdroid_as_vagrant build       --verbose       --test       --refresh-scanner       --on-server       --no-tarball       "${build_spec}"
  ) 2>&1 | tee "${BUILD_LOG}"
  local status=${PIPESTATUS[0]}
  set -e
  popd >/dev/null

  if [[ "${status}" -ne 0 ]]; then
    echo "[FAIL] F-Droid build failed for ${build_spec}." >&2
    exit "${status}"
  fi

  # Run the separate binary scanner before exporting or publishing any APK.
  local apk
  apk="$(fdroid_find_unsigned_apk "${version_code}")"
  bash "${REPO_ROOT}/scripts/scan-fdroid-apk.sh" "${apk}" 2>&1 | tee "${DIAG_ROOT}/fdroid-unsigned-apk-scan.log"
  local reference="${home_vagrant}/tmp/binaries/${APP_ID}_${version_code}.binary.apk"
  if [[ -f "${reference}" ]]; then
    bash "${REPO_ROOT}/scripts/scan-fdroid-apk.sh" "${reference}" 2>&1 | tee "${DIAG_ROOT}/fdroid-reference-apk-scan.log"
  fi
}

fdroid_find_unsigned_apk() {
  local version_code="$1"
  local candidates=(
    "${home_vagrant}/unsigned/${APP_ID}_${version_code}.apk"
    "${home_vagrant}/build/${APP_ID}/android/app/build/outputs/apk/release/app-release-unsigned.apk"
    "${home_vagrant}/tmp/${APP_ID}_${version_code}.apk"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done
  return 1
}

fdroid_export_unsigned_apk() {
  local version_code="$1"
  local destination="$2"
  local apk

  apk="$(fdroid_find_unsigned_apk "${version_code}" || true)"
  if [[ -z "${apk}" ]]; then
    echo "[FAIL] F-Droid build succeeded but its unsigned APK could not be located." >&2
    exit 2
  fi

  mkdir -p "$(dirname "${destination}")"
  cp "${apk}" "${destination}"
  local mapping="${home_vagrant}/build/${APP_ID}/android/app/build/outputs/mapping/release/mapping.txt"
  test -s "${mapping}"
  cp "${mapping}" "$(dirname "${destination}")/mapping.txt"
  sha256sum "${destination}"
}

fdroid_collect_diagnostics() {
  set +e
  mkdir -p "${DIAG_ROOT}"
  cp -f "${CANDIDATE_METADATA}" "${DIAG_ROOT}/metadata-used.yml" 2>/dev/null || true

  local version_code=""
  version_code="$(fdroid_version_code 2>/dev/null || true)"
  if [[ -n "${version_code}" ]]; then
    local apk=""
    apk="$(fdroid_find_unsigned_apk "${version_code}" 2>/dev/null || true)"
    if [[ -n "${apk}" ]]; then
      cp -f "${apk}" "${DIAG_ROOT}/fdroid-unsigned.apk" 2>/dev/null || true
      sha256sum "${apk}" > "${DIAG_ROOT}/fdroid-unsigned.apk.sha256" 2>/dev/null || true
    fi
  fi

  local build_root="${home_vagrant}/build/${APP_ID}"
  if [[ -d "${build_root}" ]]; then
    for rel in       android/settings.gradle       android/app/build.gradle       android/gradle.properties       node_modules/@react-native-async-storage/async-storage/android/build.gradle       node_modules/react-native-safe-area-context/android/build.gradle       node_modules/react-native-screens/android/build.gradle
    do
      if [[ -f "${build_root}/${rel}" ]]; then
        mkdir -p "${DIAG_ROOT}/source/$(dirname "${rel}")"
        cp -f "${build_root}/${rel}" "${DIAG_ROOT}/source/${rel}"
      fi
    done
  fi

  {
    echo "buildserver_image=${FDROID_BUILDSERVER_IMAGE}"
    echo "fdroidserver_pin=${FDROIDSERVER_COMMIT}"
    echo "fdroiddata_pin=${FDROIDDATA_COMMIT}"
    echo "bootstrap_build_tools=${FDROID_BOOTSTRAP_BUILD_TOOLS}"
    printf 'java='; java -version 2>&1 | head -n 1 || true
    printf 'fdroidserver_actual='; git -C "${FDROIDSERVER_DIR}" rev-parse HEAD 2>/dev/null || true
    printf 'fdroiddata_actual='; git -C "${FDROIDDATA_DIR}" rev-parse HEAD 2>/dev/null || true
    if [[ -d "${home_vagrant}/gradlew-fdroid/.git" ]]; then
      printf 'gradlew_fdroid_image_commit='
      git -C "${home_vagrant}/gradlew-fdroid" rev-parse HEAD 2>/dev/null || true
    fi
  } > "${DIAG_ROOT}/toolchain.txt"

  if [[ -d "${home_vagrant}/logs" ]]; then
    find "${home_vagrant}/logs" -maxdepth 2 -type f -size -10M -exec cp -t "${DIAG_ROOT}" {} + 2>/dev/null || true
  fi
}
