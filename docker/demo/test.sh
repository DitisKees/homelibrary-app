#!/usr/bin/env bash
set -euo pipefail

BASE_IMAGE=homelibrary-backend:demo-ci
DEMO_IMAGE=homelibrary-demo:ci
SUFFIX="$(date +%s)-${RANDOM}"
VOLUME="homelibrary-demo-ci-${SUFFIX}"
CONTAINER="homelibrary-demo-ci-${SUFFIX}"
cleanup() {
  docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true
  docker volume rm "${VOLUME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT
fail() { echo "[FAIL] $*" >&2; exit 1; }

echo "Building current backend and disposable demo images"
docker build -f docker/backend/Dockerfile -t "${BASE_IMAGE}" .
docker build -f docker/demo/Dockerfile --build-arg "BASE_IMAGE=${BASE_IMAGE}" -t "${DEMO_IMAGE}" .
docker volume create "${VOLUME}" >/dev/null
start() {
  docker run -d --name "${CONTAINER}" -p 127.0.0.1::8090 \
    -v "${VOLUME}:/pb_data" "${DEMO_IMAGE}" >/dev/null
  local address
  address="$(docker port "${CONTAINER}" 8090/tcp | head -n1)"
  URL="http://${address}"
  for _ in $(seq 1 90); do
    if curl -fsS "${URL}/api/health" >/dev/null 2>&1; then return; fi
    sleep 1
  done
  docker logs "${CONTAINER}" >&2 || true
  fail "Demo failed to start"
}
auth() {
  curl -fsS -H 'Content-Type: application/json' \
    -d '{"identity":"demo1@example.invalid","password":"HomeLibrary-Demo-2026!"}' \
    "${URL}/api/collections/users/auth-with-password" | jq -er '.token'
}

start
TOKEN="$(auth)"
BOOKS="$(curl -fsS -H "Authorization: ${TOKEN}" "${URL}/api/collections/books/records?perPage=50")"
jq -e '.totalItems == 16' <<<"${BOOKS}" >/dev/null || fail "Missing demo catalog"
USER_ID="$(curl -fsS -X POST -H "Authorization: ${TOKEN}" "${URL}/api/collections/users/auth-refresh" | jq -er '.record.id')"
# Explicitly test public account cannot change its known credentials.
STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X PATCH \
  -H "Authorization: ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"email":"stolen@example.invalid"}' \
  "${URL}/api/collections/users/records/${USER_ID}")"
[[ "${STATUS}" =~ ^(400|401|403|404)$ ]] || fail "Demo user update unexpectedly succeeded (${STATUS})"

CREATED="$(curl -fsS -H "Authorization: ${TOKEN}" -H 'Content-Type: application/json' \
  -d '{"title":"Temporary test book","author":"Demo Tester"}' \
  "${URL}/api/collections/books/records")"
CREATED_ID="$(jq -er '.id' <<<"${CREATED}")"
OLD_TOKEN="${TOKEN}"
echo "Stopping demo and restarting against the SAME volume"
# A token issued by the previous database should no longer authorize reads.
# PocketBase represents an unsatisfied listRule as 200 with zero results,
# which is why the app must verify stale credentials instead of showing an
# empty library.
docker rm -f "${CONTAINER}" >/dev/null
start
TOKEN="$(auth)"
STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: ${TOKEN}" \
  "${URL}/api/collections/books/records/${CREATED_ID}")"
[ "${STATUS}" = 404 ] || fail "Temporary test book survived reset (${STATUS})"
COUNT="$(curl -fsS -H "Authorization: ${TOKEN}" \
  "${URL}/api/collections/books/records?perPage=50" | jq -er '.totalItems')"
[ "${COUNT}" = 16 ] || fail "Fresh database was not re-seeded"

STALE_BOOKS="$(curl -fsS -H "Authorization: ${OLD_TOKEN}" \
  "${URL}/api/collections/books/records?perPage=50" | jq -er '.totalItems')"
[ "${STALE_BOOKS}" = 0 ] || fail "Stale token unexpectedly sees seeded books"
STALE_REFRESH_STATUS="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  -H "Authorization: ${OLD_TOKEN}" \
  "${URL}/api/collections/users/auth-refresh")"
[ "${STALE_REFRESH_STATUS}" = 401 ] || fail "Stale token refresh did not return 401"

echo "[PASS] Demo startup, seeded login, permissions, writes and reset"
