#!/usr/bin/env bash
# Validate the exact immutable image before scheduling eight Android builders.
# Inspect only registry manifests; never pull the multi-GB F-Droid image here.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
# shellcheck disable=SC1091
source "${root}/scripts/fdroid/pins.env"

pinned="${FDROID_BUILDSERVER_IMAGE}"
upstream="registry.gitlab.com/fdroid/fdroidserver:buildserver-trixie"

if [[ ! "${pinned}" =~ ^registry\.gitlab\.com/fdroid/fdroidserver:buildserver-trixie@sha256:[0-9a-f]{64}$ ]]; then
  echo "[FAIL] F-Droid image must be the official trixie tag with a full sha256 digest: ${pinned}" >&2
  exit 1
fi

# The same digest must be used in every container declaration, including
# the signed-reference parity stage. A partial update must fail before any build.
for item in \
  ".github/workflows/fdroid-buildserver-simulation.yml:1" \
  ".github/workflows/android-release.yml:2"; do
  workflow="${item%:*}"
  expected="${item##*:}"
  actual="$(grep -Fc "      image: ${pinned}" "${root}/${workflow}" || true)"
  total="$(grep -Ec '^[[:space:]]+image: registry[.]gitlab[.]com/fdroid/fdroidserver:buildserver-trixie@' "${root}/${workflow}" || true)"
  if [[ "${actual}" != "${expected}" || "${total}" != "${expected}" ]]; then
    echo "[FAIL] ${workflow}: expected ${expected} exact pinned image reference(s), got ${actual} correct out of ${total}." >&2
    exit 1
  fi
done

echo "Verifying immutable F-Droid image manifest: ${pinned}"
if ! docker buildx imagetools inspect "${pinned}"; then
  echo "[FAIL] Pinned F-Droid image is unavailable; NOT starting the build matrix." >&2
  echo "For an intentional refresh, inspect the currently published upstream tag:" >&2
  docker buildx imagetools inspect "${upstream}" || true
  echo "Record the upstream digest, update all three pins, and rerun this preflight." >&2
  exit 1
fi

echo "[PASS] Pinned upstream F-Droid buildserver manifest is reachable."
