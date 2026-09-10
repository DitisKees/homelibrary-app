#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d node_modules ]]; then
  echo "[FAIL] node_modules is missing; run npm ci first." >&2
  exit 2
fi

mapfile -t bundled_maven_repos < <(find node_modules -type d -name local-maven-repo -print | sort)

if (( ${#bundled_maven_repos[@]} > 0 )); then
  echo "Removing bundled Expo local Maven repositories so F-Droid cannot consume precompiled AARs:"
  printf '  - %s\n' "${bundled_maven_repos[@]}"
  for repo in "${bundled_maven_repos[@]}"; do
    rm -rf "$repo"
  done
fi

if find node_modules -type d -name local-maven-repo -print -quit | grep -q .; then
  echo "[FAIL] A bundled local-maven-repo remains under node_modules." >&2
  exit 1
fi

echo "[PASS] Expo bundled local Maven repositories removed; native modules must build from source."
