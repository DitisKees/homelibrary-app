#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
# shellcheck disable=SC1091
source "${ROOT}/scripts/fdroid/pins.env"
APK="$(realpath "${1:?Usage: scan-fdroid-apk.sh APK}")"
test -f "${APK}"
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
test -d "${SDK}/build-tools" || { echo '[FAIL] Android SDK build-tools are required.' >&2; exit 2; }
SCANNER_ROOT="${FDROID_APK_SCANNER_DIR:-${ROOT}/.fdroid-apk-scanner}"
if [[ ! -d "${SCANNER_ROOT}/.git" ]]; then
  git init -q "${SCANNER_ROOT}"
  git -C "${SCANNER_ROOT}" remote add origin https://gitlab.com/fdroid/fdroidserver.git
fi
if [[ "$(git -C "${SCANNER_ROOT}" rev-parse HEAD 2>/dev/null || true)" != "${FDROID_APK_SCANNER_COMMIT}" ]]; then
  git -C "${SCANNER_ROOT}" fetch -q --depth 1 origin "${FDROID_APK_SCANNER_COMMIT}"
  git -C "${SCANNER_ROOT}" checkout -q --detach FETCH_HEAD
fi
test "$(git -C "${SCANNER_ROOT}" rev-parse HEAD)" = "${FDROID_APK_SCANNER_COMMIT}"
test -z "$(git -C "${SCANNER_ROOT}" status --porcelain)" || { echo '[FAIL] APK scanner checkout is modified.' >&2; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT
cd "${WORK}"
/usr/bin/python3 - "${SDK}" <<'PY'
import json, sys
with open('config.yml', 'w', encoding='utf-8') as handle:
    handle.write('sdk_path: ' + json.dumps(sys.argv[1]) + '\n')
PY
chmod 600 config.yml
echo "F-Droid APK scanner revision: ${FDROID_APK_SCANNER_COMMIT}"
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH="${SCANNER_ROOT}:${SCANNER_ROOT}/examples" \
  "${FDROID_APK_SCANNER_PYTHON:-/usr/bin/python3}" "${SCANNER_ROOT}/fdroid" scanner --refresh --exit-code --verbose "${APK}"
echo '[PASS] F-Droid APK scanner found no problems.'
