#!/usr/bin/env bash
set -euo pipefail

BACKEND_IMAGE="${BACKEND_IMAGE:-homelibrary-backend:ci}"
WEB_IMAGE="${WEB_IMAGE:-homelibrary-web:ci}"
PB_VERSION="${PB_VERSION:-0.40.1}"

suffix="$(date +%s)-$$"
source_volume="homelibrary-ci-source-${suffix}"
restore_volume="homelibrary-ci-restore-${suffix}"
source_container="homelibrary-ci-source-${suffix}"
replacement_container="homelibrary-ci-replacement-${suffix}"
restore_container="homelibrary-ci-restore-${suffix}"
web_container="homelibrary-ci-web-${suffix}"
invalid_web_container="homelibrary-ci-web-invalid-${suffix}"
tmp_dir="$(mktemp -d)"
old_migrations="${tmp_dir}/old-migrations"

admin_email="ci-${suffix}@example.invalid"
admin_password="HomeLibrary-CI-${suffix}-Aa9!"

cleanup() {
  docker rm -f \
    "${source_container}" "${replacement_container}" "${restore_container}" \
    "${web_container}" "${invalid_web_container}" >/dev/null 2>&1 || true
  docker volume rm "${source_volume}" "${restore_volume}" >/dev/null 2>&1 || true
  rm -rf "${tmp_dir}"
}
trap cleanup EXIT

fail() {
  echo "[FAIL] $*" >&2
  exit 1
}

container_base_url() {
  local container="$1"
  local port="$2"
  local published
  published="$(docker port "${container}" "${port}/tcp" | head -n1)"
  [ -n "${published}" ] || fail "No published port for ${container}:${port}"
  printf 'http://%s\n' "${published}"
}

wait_for_health() {
  local container="$1"
  local base_url="$2"
  for _ in $(seq 1 60); do
    if [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "${container}" 2>/dev/null || true)" = "healthy" ] \
      && curl -fsS "${base_url}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  docker logs "${container}" >&2 || true
  fail "${container} did not become healthy"
}

start_backend() {
  local container="$1"
  local volume="$2"
  docker run -d \
    --name "${container}" \
    -p 127.0.0.1::8090 \
    -v "${volume}:/pb_data" \
    "${BACKEND_IMAGE}" >/dev/null
}

create_superuser_offline() {
  local volume="$1"
  local email="$2"
  local password="$3"
  docker run --rm \
    -v "${volume}:/pb_data" \
    "${BACKEND_IMAGE}" \
    superuser create "${email}" "${password}" --dir=/pb_data >/dev/null
}

auth_superuser() {
  local base_url="$1"
  local email="$2"
  local password="$3"
  curl -fsS \
    -H 'Content-Type: application/json' \
    -d "$(jq -cn --arg identity "${email}" --arg password "${password}" '{identity:$identity,password:$password}')" \
    "${base_url}/api/collections/_superusers/auth-with-password" \
    | jq -er '.token'
}

echo "Validating Compose example..."
HOMELIBRARY_VERSION=1.0.0 \
POCKETBASE_URL=https://library.example.invalid \
docker compose -f compose.example.yml config >/dev/null

echo "Building backend image..."
docker build \
  --build-arg "PB_VERSION=${PB_VERSION}" \
  -f docker/backend/Dockerfile \
  -t "${BACKEND_IMAGE}" \
  .

echo "Building web image..."
docker build \
  -f docker/web/Dockerfile \
  -t "${WEB_IMAGE}" \
  .

echo "Preparing a database with only the original schema migration applied..."
mkdir -p "${old_migrations}"
cp pocketbase/pb_migrations/202609010000_initial_schema.js "${old_migrations}/"
docker volume create "${source_volume}" >/dev/null
docker run --rm \
  -v "${source_volume}:/pb_data" \
  -v "${old_migrations}:/old_migrations:ro" \
  "${BACKEND_IMAGE}" \
  migrate up --dir=/pb_data --migrationsDir=/old_migrations >/dev/null

echo "Starting current backend against the pre-upgrade data volume..."
start_backend "${source_container}" "${source_volume}"
source_url="$(container_base_url "${source_container}" 8090)"
wait_for_health "${source_container}" "${source_url}"

echo "Creating an initial superuser without storing credentials in the image or Compose..."
docker rm -f "${source_container}" >/dev/null
create_superuser_offline "${source_volume}" "${admin_email}" "${admin_password}"
start_backend "${source_container}" "${source_volume}"
source_url="$(container_base_url "${source_container}" 8090)"
wait_for_health "${source_container}" "${source_url}"
source_token="$(auth_superuser "${source_url}" "${admin_email}" "${admin_password}")"

echo "Verifying the forward migration configured scheduled backup defaults..."
settings="$(curl -fsS -H "Authorization: ${source_token}" "${source_url}/api/settings")"
jq -e '.backups.cron == "0 3 * * *" and .backups.cronMaxKeep >= 14' <<<"${settings}" >/dev/null

echo "Locating the configured backup cron..."
crons="$(curl -fsS -H "Authorization: ${source_token}" "${source_url}/api/crons")"
backup_cron_id="$(
  jq -r '.[] | select((.id | ascii_downcase | contains("backup")) and .expression == "0 3 * * *") | .id' \
    <<<"${crons}" | head -n1
)"
[ -n "${backup_cron_id}" ] || fail "Scheduled backup cron was not registered"

echo "Creating representative record and uploaded cover..."
printf '%s' \
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZbWQAAAAASUVORK5CYII=' \
  | base64 -d > "${tmp_dir}/cover.png"

book_json="$(
  curl -fsS \
    -H "Authorization: ${source_token}" \
    -F 'title=Container restore verification' \
    -F "cover=@${tmp_dir}/cover.png;type=image/png" \
    "${source_url}/api/collections/books/records"
)"
book_id="$(jq -er '.id' <<<"${book_json}")"
cover_name="$(jq -er '.cover' <<<"${book_json}")"

echo "Triggering the configured backup cron and verifying it produced a restore point..."
backups_before="$(curl -fsS -H "Authorization: ${source_token}" "${source_url}/api/backups")"
[ "$(jq 'length' <<<"${backups_before}")" -eq 0 ] || fail "Expected no backups in the disposable pre-test volume"

curl -fsS -X POST \
  -H "Authorization: ${source_token}" \
  "${source_url}/api/crons/${backup_cron_id}" >/dev/null

# Cron execution is intentionally fire-and-forget in PocketBase, so the 204
# response only confirms that the job was accepted. Poll until the backup
# generated by the job is visible rather than racing the background task.
scheduled_backups='[]'
for _ in $(seq 1 60); do
  scheduled_backups="$(curl -fsS -H "Authorization: ${source_token}" "${source_url}/api/backups")"
  if [ "$(jq 'length' <<<"${scheduled_backups}")" -eq 1 ]; then
    break
  fi
  sleep 1
done
[ "$(jq 'length' <<<"${scheduled_backups}")" -eq 1 ] || fail "Scheduled backup cron did not produce exactly one restore point"
scheduled_backup_key="$(jq -er '.[0].key' <<<"${scheduled_backups}")"

echo "Creating a second restore point on demand..."
curl -fsS -X POST \
  -H "Authorization: ${source_token}" \
  -H 'Content-Type: application/json' \
  -d '{"name":"ci_restore_2.zip"}' \
  "${source_url}/api/backups" >/dev/null

backups="$(curl -fsS -H "Authorization: ${source_token}" "${source_url}/api/backups")"
[ "$(jq 'length' <<<"${backups}")" -ge 2 ] || fail "Expected at least two backup restore points"
jq -e '.[] | select(.key == "ci_restore_2.zip")' <<<"${backups}" >/dev/null

echo "Downloading the scheduled backup outside the production data volume..."
file_token="$(
  curl -fsS -X POST \
    -H "Authorization: ${source_token}" \
    "${source_url}/api/files/token" \
    | jq -er '.token'
)"
scheduled_backup_path="${tmp_dir}/${scheduled_backup_key}"
curl -fsS \
  "${source_url}/api/backups/${scheduled_backup_key}?token=${file_token}" \
  -o "${scheduled_backup_path}"
test -s "${scheduled_backup_path}"

echo "Replacing the backend container while retaining the same data volume..."
docker rm -f "${source_container}" >/dev/null
start_backend "${replacement_container}" "${source_volume}"
replacement_url="$(container_base_url "${replacement_container}" 8090)"
wait_for_health "${replacement_container}" "${replacement_url}"
replacement_token="$(auth_superuser "${replacement_url}" "${admin_email}" "${admin_password}")"
curl -fsS \
  -H "Authorization: ${replacement_token}" \
  "${replacement_url}/api/collections/books/records/${book_id}" \
  | jq -e --arg id "${book_id}" '.id == $id' >/dev/null

echo "Restoring the downloaded backup into an isolated data volume..."
docker volume create "${restore_volume}" >/dev/null
start_backend "${restore_container}" "${restore_volume}"
restore_url="$(container_base_url "${restore_container}" 8090)"
wait_for_health "${restore_container}" "${restore_url}"
docker rm -f "${restore_container}" >/dev/null

restore_admin_email="restore-${admin_email}"
restore_admin_password="Restore-${admin_password}"
create_superuser_offline "${restore_volume}" "${restore_admin_email}" "${restore_admin_password}"
start_backend "${restore_container}" "${restore_volume}"
restore_url="$(container_base_url "${restore_container}" 8090)"
wait_for_health "${restore_container}" "${restore_url}"
restore_token="$(auth_superuser "${restore_url}" "${restore_admin_email}" "${restore_admin_password}")"

curl -fsS \
  -X POST \
  -H "Authorization: ${restore_token}" \
  -F "file=@${scheduled_backup_path};type=application/zip" \
  "${restore_url}/api/backups/upload" >/dev/null

# Restore restarts PocketBase. Depending on timing, curl can observe the server
# closing the connection after it has accepted the request, so don't treat that
# connection close itself as a restore failure.
curl -sS -X POST \
  -H "Authorization: ${restore_token}" \
  "${restore_url}/api/backups/${scheduled_backup_key}/restore" >/dev/null || true

restored_token=""
for _ in $(seq 1 60); do
  if curl -fsS "${restore_url}/api/health" >/dev/null 2>&1; then
    restored_token="$(auth_superuser "${restore_url}" "${admin_email}" "${admin_password}" 2>/dev/null || true)"
    [ -n "${restored_token}" ] && break
  fi
  sleep 1
done
[ -n "${restored_token}" ] || fail "Restored instance did not accept the original superuser"

restored_book="$(
  curl -fsS \
    -H "Authorization: ${restored_token}" \
    "${restore_url}/api/collections/books/records/${book_id}"
)"
jq -e \
  --arg id "${book_id}" \
  --arg cover "${cover_name}" \
  '.id == $id and .title == "Container restore verification" and .cover == $cover' \
  <<<"${restored_book}" >/dev/null

restored_file_token="$(
  curl -fsS -X POST \
    -H "Authorization: ${restored_token}" \
    "${restore_url}/api/files/token" \
    | jq -er '.token'
)"
curl -fsS \
  "${restore_url}/api/files/books/${book_id}/${cover_name}?token=${restored_file_token}" \
  -o "${tmp_dir}/restored-cover.png"
cmp "${tmp_dir}/cover.png" "${tmp_dir}/restored-cover.png"

echo "Verifying the same web image can switch PocketBase endpoints at runtime..."
docker run -d \
  --name "${web_container}" \
  -p 127.0.0.1::8080 \
  -e POCKETBASE_URL=https://one.example.invalid \
  "${WEB_IMAGE}" >/dev/null
web_url="$(container_base_url "${web_container}" 8080)"
for _ in $(seq 1 30); do
  curl -fsS "${web_url}/" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "${web_url}/runtime-config.js" | grep -F 'https://one.example.invalid' >/dev/null

docker rm -f "${web_container}" >/dev/null
docker run -d \
  --name "${web_container}" \
  -p 127.0.0.1::8080 \
  -e POCKETBASE_URL=https://two.example.invalid \
  "${WEB_IMAGE}" >/dev/null
web_url="$(container_base_url "${web_container}" 8080)"
for _ in $(seq 1 30); do
  curl -fsS "${web_url}/" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "${web_url}/runtime-config.js" | grep -F 'https://two.example.invalid' >/dev/null

echo "Verifying missing runtime configuration serves the setup flow..."
docker rm -f "${web_container}" >/dev/null
docker run -d \
  --name "${web_container}" \
  -p 127.0.0.1::8080 \
  "${WEB_IMAGE}" >/dev/null
web_url="$(container_base_url "${web_container}" 8080)"
for _ in $(seq 1 30); do
  curl -fsS "${web_url}/runtime-config.js" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "${web_url}/runtime-config.js" | grep -F 'POCKETBASE_URL: null' >/dev/null

echo "Verifying invalid runtime configuration fails explicitly..."
if docker run \
  --name "${invalid_web_container}" \
  -e POCKETBASE_URL=ftp://invalid.example \
  "${WEB_IMAGE}" >/dev/null 2>&1; then
  fail "Web image accepted an invalid POCKETBASE_URL"
fi

echo "[PASS] Docker self-hosting smoke test completed"
