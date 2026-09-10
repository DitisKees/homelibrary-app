#!/usr/bin/env bash
set -euo pipefail

PB_BIN="${PB_BIN:-/tmp/pocketbase/pocketbase}"
DATA_DIR="${DATA_DIR:-${RUNNER_TEMP:-/tmp}/homelibrary-pb-schema-test}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-${GITHUB_WORKSPACE:-$(pwd)}/pocketbase/pb_migrations}"
BASE_URL="http://127.0.0.1:8090"
ADMIN_EMAIL="schema-test@example.invalid"
ADMIN_PASSWORD="HomeLibrary-Schema-Test-Aa9!"
SERVER_PID=""

cleanup() {
  if [ -n "${SERVER_PID}" ]; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${DATA_DIR}"
}
trap cleanup EXIT

rm -rf "${DATA_DIR}"
mkdir -p "${DATA_DIR}"

"${PB_BIN}" migrate up \
  --dir "${DATA_DIR}" \
  --migrationsDir "${MIGRATIONS_DIR}" >/dev/null

"${PB_BIN}" superuser create \
  "${ADMIN_EMAIL}" "${ADMIN_PASSWORD}" \
  --dir "${DATA_DIR}" >/dev/null

"${PB_BIN}" serve \
  --http=127.0.0.1:8090 \
  --dir "${DATA_DIR}" \
  --migrationsDir "${MIGRATIONS_DIR}" \
  --automigrate=0 >/tmp/homelibrary-pocketbase-schema-test.log 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 30); do
  if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "${BASE_URL}/api/health" >/dev/null

TOKEN="$(
  curl -fsS \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --arg identity "${ADMIN_EMAIL}" --arg password "${ADMIN_PASSWORD}" '{identity:$identity,password:$password}')" \
    "${BASE_URL}/api/collections/_superusers/auth-with-password" \
    | jq -er '.token'
)"

for collection_name in books reading_status loans; do
  schema="$(curl -fsS -H "Authorization: ${TOKEN}" "${BASE_URL}/api/collections/${collection_name}")"

  jq -e \
    '.fields | any(.name == "created" and .type == "autodate" and .onCreate == true)' \
    <<<"${schema}" >/dev/null
  jq -e \
    '.fields | any(.name == "updated" and .type == "autodate" and .onCreate == true and .onUpdate == true)' \
    <<<"${schema}" >/dev/null
done

book="$(
  curl -fsS \
    -H "Authorization: ${TOKEN}" \
    -H 'Content-Type: application/json' \
    -d '{"title":"Timestamp schema verification"}' \
    "${BASE_URL}/api/collections/books/records"
)"
book_id="$(jq -er '.id' <<<"${book}")"
jq -e '.created != "" and .updated != ""' <<<"${book}" >/dev/null

sorted="$(
  curl -fsS \
    -H "Authorization: ${TOKEN}" \
    "${BASE_URL}/api/collections/books/records?page=1&perPage=30&sort=title%2Cauthor%2Ccreated"
)"
jq -e --arg id "${book_id}" '.items | any(.id == $id)' <<<"${sorted}" >/dev/null

echo "[PASS] PocketBase timestamps and book sorting validated"
