#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
APP_ID="io.github.ditiskees.homelibrary"
VERSION_CODE="9"
SOURCE_SHA="f5a6762bc092c3f9295658354aeaa76315fa84ec"
FDROIDDATA_SHA="b8e54df427e099162d372cea8bbaf61bdafa18b3"
FDROIDSERVER_SHA="a35fdfddd9c66823987a410566a6101186e39c84"
CI_ROOT="/builds/fdroid/fdroiddata"
home_vagrant="/home/vagrant"

rm -rf /builds/fdroid
mkdir -p "$CI_ROOT"

git init -q "$CI_ROOT"
git -C "$CI_ROOT" remote add origin https://gitlab.com/fdroid/fdroiddata.git
git -C "$CI_ROOT" fetch -q --depth 1 origin "$FDROIDDATA_SHA"
git -C "$CI_ROOT" checkout -q --detach FETCH_HEAD

cp "$ROOT/.fdroid.yml" "$CI_ROOT/metadata/$APP_ID.yml"
sed -i "s/^    commit: v1.0.8$/    commit: $SOURCE_SHA/" "$CI_ROOT/metadata/$APP_ID.yml"

if [[ -n "${AGP_OVERRIDE:-}" ]]; then
  python3 - "$CI_ROOT/metadata/$APP_ID.yml" "$AGP_OVERRIDE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
target = sys.argv[2]
text = path.read_text()
needle = "      - npm ci\n"
injected = """      - npm ci
      - grep -RIl '8\\.12\\.0' node_modules/@react-native node_modules/react-native node_modules/expo-modules-autolinking 2>/dev/null | sort -u | tee /tmp/homelibrary-agp-files
      - test -s /tmp/homelibrary-agp-files
      - xargs -r sed -i -e 's/8\\.12\\.0/TARGET_AGP/g' < /tmp/homelibrary-agp-files
      - echo "AGP override files:"
      - cat /tmp/homelibrary-agp-files
      - grep -RIn 'TARGET_AGP' $(cat /tmp/homelibrary-agp-files)
""".replace("TARGET_AGP", target)
if text.count(needle) != 1:
    raise SystemExit("[FAIL] Expected exactly one npm ci insertion point")
path.write_text(text.replace(needle, injected))
PY

  echo "=== AGP override metadata ==="
  grep -A12 '^    init:' "$CI_ROOT/metadata/$APP_ID.yml"
fi

if [[ -n "${DIRENT_ORDER:-}" ]]; then
  case "$DIRENT_ORDER" in
    sorted|reversed) ;;
    *)
      echo "[FAIL] Unsupported DIRENT_ORDER: $DIRENT_ORDER" >&2
      exit 2
      ;;
  esac

  cat > /tmp/reorder-dirents.py <<'PY'
#!/usr/bin/env python3
import os
import sys

order = sys.argv[1]
root = os.path.abspath(sys.argv[2])
reverse = order == "reversed"
marker = ".fdroid-dirent-reorder-tmp"
processed = 0

for current, _dirs, _files in os.walk(root, topdown=False):
    names = [name for name in os.listdir(current) if name != marker]
    if len(names) < 2:
        continue

    tmp = os.path.join(current, marker)
    os.mkdir(tmp)
    try:
        for name in names:
            os.rename(os.path.join(current, name), os.path.join(tmp, name))
        for name in sorted(names, reverse=reverse):
            os.rename(os.path.join(tmp, name), os.path.join(current, name))
    finally:
        if os.path.isdir(tmp):
            leftovers = os.listdir(tmp)
            for name in leftovers:
                os.rename(os.path.join(tmp, name), os.path.join(current, name))
            os.rmdir(tmp)
    processed += 1

print(f"[INFO] Reordered directory entries in {processed} directories: {order}")
PY
  chmod 0755 /tmp/reorder-dirents.py

  python3 - "$CI_ROOT/metadata/$APP_ID.yml" "$DIRENT_ORDER" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
order = sys.argv[2]
text = path.read_text()
needle = "    build:\n      - cd android/app\n"
replacement = (
    "    build:\n"
    f"      - python3 /tmp/reorder-dirents.py {order} .\n"
    "      - cd android/app\n"
)
if text.count(needle) != 1:
    raise SystemExit("[FAIL] Expected exactly one build block insertion point")
path.write_text(text.replace(needle, replacement))
PY

  echo "=== controlled directory-order build block ==="
  grep -A4 '^    build:' "$CI_ROOT/metadata/$APP_ID.yml"
fi

export CI_PROJECT_DIR="$CI_ROOT"
export CI_PROJECT_PATH="fdroid/fdroiddata"
export CI_PIPELINE_SOURCE="merge_request_event"
export CI_COMMIT_SHA="a9aabe7320b8a21b63f93378aaba528fd90b0ffe"
export CI_COMMIT_REF_NAME="refs/merge-requests/48673/head"
export CI_MERGE_REQUEST_TARGET_BRANCH_NAME="master"
export GITLAB_CI="true"
export CI="true"
export TERM="dumb"

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y dist-upgrade

# Same image-provided environment variables as the parent job.
# shellcheck disable=SC1091
source /etc/profile.d/bsenv.sh
export ANDROID_HOME="/opt/android-sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
sdkmanager "platform-tools" "build-tools;31.0.0" >/dev/null

# Match fdroiddata's install_fdroid_server anchor, while fixing the exact
# revision observed in the parent job trace.
rm -rf "$fdroidserver"
mkdir -p "$fdroidserver"
curl --fail --silent --show-error   "https://gitlab.com/fdroid/fdroidserver/-/archive/$FDROIDSERVER_SHA/fdroidserver-$FDROIDSERVER_SHA.tar.gz"   | tar -xz --directory="$fdroidserver" --strip-components=1
export PATH="$fdroidserver:$PATH"
export PYTHONPATH="$fdroidserver:$fdroidserver/examples"
export PYTHONUNBUFFERED=true
export serverwebroot=/tmp

git -C "$home_vagrant/gradlew-fdroid" pull

curl --fail --silent --show-error   https://gitlab.com/fdroid/fdroid-bootstrap-buildserver/-/raw/master/roles/production_hardening/files/gitconfig   > /builds/fdroid/.gitconfig

pushd "$CI_ROOT" >/dev/null
for d in logs tmp unsigned "$home_vagrant/.android" "$home_vagrant/.gradle" "$home_vagrant/metadata"; do
  test -d "$d" || mkdir -p "$d"
  chown -R vagrant "$d"
done
popd >/dev/null

rm -f "$CI_ROOT/.gradle" 2>/dev/null || true
rm -rf "$home_vagrant/tmp" "$home_vagrant/srclibs"
ln -s "$home_vagrant/.gradle" "$CI_ROOT/.gradle"
ln -s "$CI_ROOT/tmp" "$home_vagrant/tmp"
mkdir -p "$CI_ROOT/srclibs"
ln -s "$CI_ROOT/srclibs" "$home_vagrant/srclibs"

export GRADLE_USER_HOME="$home_vagrant/.gradle"
export fdroid="sudo --preserve-env --user vagrant env PATH=$fdroidserver:$PATH env PYTHONPATH=$fdroidserver:$fdroidserver/examples env PYTHONUNBUFFERED=true env TERM=$TERM env HOME=$home_vagrant fdroid"

apt-get install -y sudo openjdk-21-jdk-headless >/dev/null
update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java

rm -rf "$home_vagrant/build/$APP_ID"
cp -R "$CI_ROOT/build" "$home_vagrant/build" 2>/dev/null || true
cp "$CI_ROOT/metadata/$APP_ID.yml" "$home_vagrant/metadata/$APP_ID.yml"
chown -R vagrant "$home_vagrant" "$CI_ROOT"

pushd "$home_vagrant" >/dev/null
rm -f "$home_vagrant/fdroiddata" "$home_vagrant/.gitconfig"
ln -s "$CI_ROOT" "$home_vagrant/fdroiddata"
ln -s /builds/fdroid/.gitconfig "$home_vagrant/.gitconfig"

$fdroid fetchsrclibs "$APP_ID:$VERSION_CODE" --verbose

# This is an important parent-CI detail: fdroiddata and gitconfig are detached
# before the actual build command.
rm "$home_vagrant/fdroiddata" "$home_vagrant/.gitconfig"

# Remove GitHub-specific CI identity for this process; the real parent build
# has GitLab variables but no GITHUB_*/RUNNER_*/ACTIONS_* variables.
for name in $(env | cut -d= -f1 | grep -E '^(GITHUB|RUNNER|ACTIONS)_'); do
  unset "$name"
done

set +e
(
  unset CI
  $fdroid build --verbose --test --refresh-scanner --on-server --no-tarball "$APP_ID:$VERSION_CODE"
)
status=$?
set -e
popd >/dev/null

mkdir -p "$ROOT/diagnostic-output"
{
  echo "fdroid_exit_status=$status"
  echo "java=$(java -version 2>&1 | head -n 1)"
  echo "fdroidserver_sha=$FDROIDSERVER_SHA"
  echo "fdroiddata_sha=$FDROIDDATA_SHA"
  echo "gradlew_fdroid_sha=$(git -C "$home_vagrant/gradlew-fdroid" rev-parse HEAD)"
} | tee "$ROOT/diagnostic-output/exact-parent-env.txt"

found=0
for apk in   "$CI_ROOT/tmp/${APP_ID}_${VERSION_CODE}.apk"   "$home_vagrant/build/$APP_ID/android/app/build/outputs/apk/release/app-release-unsigned.apk"
do
  if [[ -f "$apk" ]]; then
    found=1
    echo "APK candidate: $apk"
    sha256sum "$apk" | tee -a "$ROOT/diagnostic-output/exact-parent-env.txt"
    cp "$apk" "$ROOT/diagnostic-output/$(basename "$apk")"
  fi
done

if [[ "$found" -ne 1 ]]; then
  echo "[FAIL] No APK candidate found." >&2
  exit 2
fi
