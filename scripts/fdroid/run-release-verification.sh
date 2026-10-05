#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib-buildserver.sh"

METADATA_SOURCE="${1:-${REPO_ROOT}/.fdroid.yml}"

if [[ ! -f "${METADATA_SOURCE}" ]]; then
  echo "[FAIL] Canonical F-Droid metadata not found: ${METADATA_SOURCE}" >&2
  exit 2
fi

VERSION_CODE="$(fdroid_version_code)"

fdroid_reset
trap fdroid_collect_diagnostics EXIT
fdroid_prepare_environment


fdroid_install_metadata "${METADATA_SOURCE}"
fdroid_assert_metadata_canonical
fdroid_lint_metadata
fdroid_checkupdates
fdroid_build "${VERSION_CODE}"

echo "[PASS] F-Droid signed-reference release verification succeeded for ${APP_ID}:${VERSION_CODE}."
