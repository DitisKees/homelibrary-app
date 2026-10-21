#!/bin/sh
set -eu

# This is intentionally destructive. Refuse to start if this marker is absent.
if [ "${HOMELIBRARY_DEMO:-}" != "1" ]; then
  echo "Refusing to reset data: HOMELIBRARY_DEMO marker is missing" >&2
  exit 1
fi
if [ ! -d /pb_data ] || [ ! -f /pb_migrations/209901010000_demo_seed.js ]; then
  echo "Expected disposable PocketBase paths are missing" >&2
  exit 1
fi

# Wipe *all* state, including hidden files, uploaded covers, WAL files and
# migration history. Each process start generates a new seeded demo.
# NEVER mount a real household data volume in the demo container.
find /pb_data -mindepth 1 -maxdepth 1 -exec rm -rf {} \;
echo "Starting a freshly initialized, disposable HomeLibrary demo database"
exec pocketbase serve --http=0.0.0.0:8090 --dir=/pb_data --migrationsDir=/pb_migrations --automigrate=0
