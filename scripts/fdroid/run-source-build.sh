#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-buildserver.sh"

SOURCE_REF="${1:-}"
METADATA_SOURCE="${2:-${REPO_ROOT}/.fdroid.yml}"
EXPORT_APK="${FDROID_EXPORT_APK:-}"

if [[ ! "${SOURCE_REF}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[FAIL] Source build requires a full 40-character Git commit SHA." >&2
  exit 2
fi
if [[ ! -f "${METADATA_SOURCE}" ]]; then
  echo "[FAIL] Canonical F-Droid metadata not found: ${METADATA_SOURCE}" >&2
  exit 2
fi

fdroid_reset
trap fdroid_collect_diagnostics EXIT
fdroid_prepare_environment

VERSION_CODE="$(fdroid_version_code)"
DERIVED_METADATA="${WORK_ROOT}/source-metadata.yml"

fdroid_python "${SCRIPT_DIR}/test-derive-source-metadata.py"
fdroid_python   "${SCRIPT_DIR}/derive-source-metadata.py"   "${METADATA_SOURCE}"   "${DERIVED_METADATA}"   "${SOURCE_REF}"   "${VERSION_CODE}"

fdroid_install_metadata "${DERIVED_METADATA}"
fdroid_assert_metadata_canonical
fdroid_lint_metadata
fdroid_build "${VERSION_CODE}"

if [[ -n "${EXPORT_APK}" ]]; then
  fdroid_export_unsigned_apk "${VERSION_CODE}" "${EXPORT_APK}"
fi

echo "[PASS] F-Droid source build succeeded for ${APP_ID}:${VERSION_CODE} at ${SOURCE_REF}."
