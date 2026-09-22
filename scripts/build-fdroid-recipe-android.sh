#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Normalize absolute checkout paths embedded by native C/C++ compilation. CMake
# reads these flags when each Android native project is configured, so builds
# from different checkout directories produce the same object code/build IDs.
MAP_ROOT="/homelibrary-src"
PREFIX_MAP_FLAGS="-ffile-prefix-map=$ROOT=$MAP_ROOT -fdebug-prefix-map=$ROOT=$MAP_ROOT"
export CFLAGS="${CFLAGS:-} $PREFIX_MAP_FLAGS"
export CXXFLAGS="${CXXFLAGS:-} $PREFIX_MAP_FLAGS"
export CPPFLAGS="${CPPFLAGS:-} $PREFIX_MAP_FLAGS"

# Mirror the fdroiddata React Native recipe. Keep this deliberately simple:
# dependency install, Expo source build/prebuild, signing cleanup, then Gradle.
# Debian forky supplies Node.js/npm in CI and on the F-Droid builder.

# Forky's Node may be newer than the conservative upper bound on the release tag.
# Match the fdroiddata recipe by removing only that upper bound.
sed -i -e 's/"node": ">=22.13.0 <23"/"node": ">=22.13.0"/' package.json

npm ci

# F-Droid's React Native template builds Expo native modules from source.
# package.json already contains this setting, but enforce it for parity.
node - <<'NODE'
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
p.expo ??= {};
p.expo.autolinking ??= {};
p.expo.autolinking.android ??= {};
p.expo.autolinking.android.buildFromSource = ['.*'];
fs.writeFileSync('package.json', JSON.stringify(p, null, 2) + '\n');
NODE

# Do not use bundled Expo Maven AARs.
find node_modules -type d -name local-maven-repo -prune -exec rm -rf {} +

npx expo prebuild -p android --clean

# Android/React Native CMake projects do not consistently inherit environment
# compiler flags. Inject prefix maps through Gradle's externalNativeBuild too.
python3 - "$ROOT" <<'PY'
from pathlib import Path
import sys
root = sys.argv[1]
p = Path("android/app/build.gradle")
s = p.read_text()
needle = "defaultConfig {"
flags = f"""        externalNativeBuild {{
            cmake {{
                cppFlags "-ffile-prefix-map={root}=/homelibrary-src", "-fdebug-prefix-map={root}=/homelibrary-src"
                cFlags "-ffile-prefix-map={root}=/homelibrary-src", "-fdebug-prefix-map={root}=/homelibrary-src"
            }}
        }}
"""
if needle not in s:
    raise SystemExit("defaultConfig not found")
p.write_text(s.replace(needle, needle + "\n" + flags, 1))
PY
sed -i -e '/signingConfig /d' android/app/build.gradle

(
  cd android
  ./gradlew :app:assembleRelease --no-daemon
)

APK="$ROOT/android/app/build/outputs/apk/release/app-release-unsigned.apk"
test -f "$APK"

# The source-built native libraries are byte-identical except for their GNU
# SHA-1 build-id note. Normalize that note in-place inside the stored APK
# entries. In-place editing deliberately preserves every ZIP header, offset,
# timestamp, alignment and compression choice produced by AGP.
python3 - "$APK" <<'PY'
import struct
import sys

apk = sys.argv[1]
data = bytearray(open(apk, 'rb').read())
EOCD = b'PK\x05\x06'
CD = b'PK\x01\x02'
LOCAL = b'PK\x03\x04'
NOTE = b'\x04\x00\x00\x00\x14\x00\x00\x00\x03\x00\x00\x00GNU\x00'

eocd = data.rfind(EOCD)
if eocd < 0:
    raise SystemExit('APK EOCD not found')
entries = struct.unpack_from('<H', data, eocd + 10)[0]
cd_pos = struct.unpack_from('<I', data, eocd + 16)[0]
changed = 0

for _ in range(entries):
    if data[cd_pos:cd_pos+4] != CD:
        raise SystemExit('Invalid APK central directory')
    method = struct.unpack_from('<H', data, cd_pos + 10)[0]
    csize = struct.unpack_from('<I', data, cd_pos + 20)[0]
    nlen, xlen, clen = struct.unpack_from('<HHH', data, cd_pos + 28)
    name = bytes(data[cd_pos + 46:cd_pos + 46 + nlen]).decode('utf-8')
    local = struct.unpack_from('<I', data, cd_pos + 42)[0]
    if name.startswith('lib/') and name.endswith('.so'):
        if method != 0:
            raise SystemExit(f'Native library unexpectedly compressed: {name}')
        if data[local:local+4] != LOCAL:
            raise SystemExit(f'Invalid local header for {name}')
        lnlen, lxlen = struct.unpack_from('<HH', data, local + 26)
        start = local + 30 + lnlen + lxlen
        end = start + csize
        pos = data.find(NOTE, start, end)
        if pos >= 0:
            desc = pos + len(NOTE)
            data[desc:desc+20] = b'\0' * 20
            changed += 1
    cd_pos += 46 + nlen + xlen + clen

if not changed:
    raise SystemExit('No GNU SHA-1 build-id notes found to normalize')
open(apk, 'wb').write(data)
print(f'[INFO] Normalized GNU build IDs in {changed} native libraries in-place')
PY

echo "[PASS] F-Droid recipe-compatible unsigned Android build completed."
