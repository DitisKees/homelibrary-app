#!/usr/bin/env bash
# Run as root inside a disposable Linux x64 build container. Execute the exact metadata sudo block before using app dependencies.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
python3 - "$ROOT/.fdroid.yml" <<'PY'
import subprocess
import sys
import yaml
with open(sys.argv[1]) as handle:
    builds = yaml.safe_load(handle)['Builds']
assert len(builds) == 4, 'Expected one recipe per ABI'
commands = builds[0]['sudo']
assert all(build['sudo'] == commands for build in builds), 'ABI toolchain recipes differ'
subprocess.run(['bash', '-e', '-u', '-o', 'pipefail', '-c', '; '.join(commands)], check=True)
PY
node "$ROOT/scripts/check-node-toolchain.mjs"
