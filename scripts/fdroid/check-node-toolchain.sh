#!/usr/bin/env bash
# Run only inside a disposable production buildserver container, as root.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
bash "$ROOT/scripts/fdroid/install-node-toolchain.sh"
# Exercise the actual installer and lockfile before launching the ABI matrix.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$WORK/"
cd "$WORK"
if ! npm ci --ignore-scripts --no-audit --no-fund; then
  find /root/.npm/_logs -type f -name '*debug-0.log' -exec tail -n 80 {} +
  exit 1
fi

if [[ -f /etc/profile.d/bsenv.sh ]]; then
  # shellcheck disable=SC1091
  source /etc/profile.d/bsenv.sh
fi
python3 "$ROOT/scripts/fdroid/test-glide-repository.py" "$(command -v gradle)"
