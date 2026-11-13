#!/usr/bin/env bash
# Run only inside a disposable production buildserver container, as root.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
python3 - "$ROOT/.fdroid.yml" <<'PY'
import subprocess
import sys
import yaml
with open(sys.argv[1]) as handle:
    builds = yaml.safe_load(handle)['Builds']
commands = builds[0]['sudo']
assert all(build['sudo'] == commands for build in builds)
try:
    subprocess.run(['bash', '-e', '-u', '-o', 'pipefail', '-c', '; '.join(commands)], check=True)
except subprocess.CalledProcessError:
    # Retain the actual image package inventory for local solver reproduction.
    print('BUILDSERVER_DPKG_STATUS_BEGIN', flush=True)
    with open('/var/lib/dpkg/status') as handle:
        print(handle.read(), flush=True)
    print('BUILDSERVER_DPKG_STATUS_END', flush=True)
    raise
PY
node --version
npm --version
dpkg-query -W nodejs libnode137 npm libc6 libc-bin

# npm --version does not load all Debian-split dependencies. Exercise the real
# installer against the candidate lock before launching the ABI build matrix.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cp "$ROOT/package.json" "$ROOT/package-lock.json" "$WORK/"
cd "$WORK"
if ! npm ci --ignore-scripts --no-audit --no-fund; then
  find /root/.npm/_logs -type f -name '*debug-0.log' -exec tail -n 80 {} +
  exit 1
fi
