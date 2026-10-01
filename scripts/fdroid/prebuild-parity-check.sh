#!/usr/bin/env bash
set -euo pipefail

APP_ID="io.github.ditiskees.homelibrary"
SOURCE_SHA="f5a6762bc092c3f9295658354aeaa76315fa84ec"
SOURCE_DIR="/home/vagrant/build/$APP_ID"
OUT_DIR="${GITHUB_WORKSPACE:-$PWD}/diagnostic-output"

mkdir -p "$OUT_DIR"
rm -rf "$SOURCE_DIR"
mkdir -p "$(dirname "$SOURCE_DIR")"

echo "=== host ===" | tee "$OUT_DIR/host.txt"
uname -a | tee -a "$OUT_DIR/host.txt"
echo "nproc=$(nproc)" | tee -a "$OUT_DIR/host.txt"
findmnt -T /home/vagrant | tee -a "$OUT_DIR/host.txt" || true

echo "=== package setup ==="
echo "deb https://deb.debian.org/debian forky main" > /etc/apt/sources.list.d/forky.list
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get -y dist-upgrade
DEBIAN_FRONTEND=noninteractive apt-get install -y -t forky npm

git clone --quiet https://github.com/DitisKees/homelibrary-app.git "$SOURCE_DIR"
git -C "$SOURCE_DIR" checkout --quiet --detach "$SOURCE_SHA"
chown -R vagrant:vagrant "$SOURCE_DIR"

run_as_vagrant() {
  runuser -u vagrant -- env     HOME=/home/vagrant     PATH="$PATH"     bash -lc "$1"
}

run_as_vagrant "cd '$SOURCE_DIR' && node --version && npm --version" | tee "$OUT_DIR/node-toolchain.txt"

run_as_vagrant "cd '$SOURCE_DIR' && sed -i -e 's/\"node\":\ \">=22.13.0 <23\"/\"node\":\ \">=22.13.0\"/' package.json && npm ci"

run_as_vagrant "cd '$SOURCE_DIR' && find node_modules -type d -name local-maven-repo -prune -exec rm -rf {} +"
run_as_vagrant "cd '$SOURCE_DIR' && sed -i '/jvmToolchain\|JavaVersion/s/17/21/' node_modules/@react-native/gradle-plugin/*/build.gradle.kts node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt"
run_as_vagrant "cd '$SOURCE_DIR' && npx expo prebuild -p android --clean"
run_as_vagrant "cd '$SOURCE_DIR' && bash scripts/prepare-android-gradle-properties.sh"
run_as_vagrant "cd '$SOURCE_DIR' && printf '%s\n' 'org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8' 'org.gradle.workers.max=2' 'kotlin.compiler.execution.strategy=in-process' >> android/gradle.properties"
run_as_vagrant "cd '$SOURCE_DIR' && bash scripts/prepare-android-gradle-properties.sh"
run_as_vagrant "cd '$SOURCE_DIR' && bash scripts/check-fdroid-android-dependencies.sh"
run_as_vagrant "cd '$SOURCE_DIR' && sed -i -e '/signingConfig /d' android/app/build.gradle"

python3 - "$SOURCE_DIR/android" "$OUT_DIR/prebuild-manifest.txt" <<'PY'
from pathlib import Path
import hashlib
import os
import sys

root = Path(sys.argv[1])
out = Path(sys.argv[2])

rows = []
for path in sorted(root.rglob("*"), key=lambda p: p.relative_to(root).as_posix()):
    rel = path.relative_to(root).as_posix()
    if rel.startswith(".gradle/") or rel.startswith("build/reports/"):
        continue
    if path.is_symlink():
        rows.append(f"SYMLINK {rel} -> {os.readlink(path)}")
    elif path.is_file():
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        rows.append(f"{h.hexdigest()}  {rel}")

out.write_text("\n".join(rows) + "\n")
print(f"manifest_files={sum(1 for row in rows if not row.startswith('SYMLINK '))}")
print(f"manifest_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")

stable = []
for row in rows:
    if row.startswith("SYMLINK "):
        path_text = row.split(" ", 1)[1].split(" -> ", 1)[0]
    else:
        path_text = row.split("  ", 1)[1]
    if path_text.startswith(".gradle/"):
        continue
    if path_text.startswith("build/reports/"):
        continue
    stable.append(row)

stable_path = out.with_name("prebuild-stable-manifest.txt")
stable_path.write_text("\n".join(stable) + "\n")
print(f"stable_manifest_files={len(stable)}")
print(f"stable_manifest_sha256={hashlib.sha256(stable_path.read_bytes()).hexdigest()}")
PY

grep -E '(^|/)(build\.gradle|build\.gradle\.kts|settings\.gradle|settings\.gradle\.kts|gradle\.properties|libs\.versions\.toml)$' "$OUT_DIR/prebuild-manifest.txt" > "$OUT_DIR/prebuild-gradle-files.txt" || true
sha256sum "$OUT_DIR/prebuild-manifest.txt" | tee "$OUT_DIR/prebuild-manifest.sha256"
sha256sum "$OUT_DIR/prebuild-stable-manifest.txt" | tee "$OUT_DIR/prebuild-stable-manifest.sha256"
echo "=== stable prebuild manifest ==="
cat "$OUT_DIR/prebuild-stable-manifest.txt"

echo "=== Gradle pre-DEX checkpoint ==="
DEBIAN_FRONTEND=noninteractive apt-get install -y sudo openjdk-21-jdk-headless
update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java
source /etc/profile.d/bsenv.sh
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export GRADLE_USER_HOME=/home/vagrant/.gradle
mkdir -p "$GRADLE_USER_HOME"
chown -R vagrant:vagrant "$GRADLE_USER_HOME"

run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle processReleaseResources compileReleaseKotlin compileReleaseJavaWithJavac --no-daemon"

python3 - "$SOURCE_DIR/android/app/build" "$OUT_DIR/predex-manifest.txt" <<'PY'
from pathlib import Path
import hashlib
import sys

build = Path(sys.argv[1])
out = Path(sys.argv[2])

roots = [
    build / "generated/source/buildConfig/release",
    build / "intermediates/processed_res/release",
    build / "intermediates/runtime_symbol_list/release",
    build / "intermediates/local_only_symbol_list/release",
    build / "intermediates/compile_and_runtime_not_namespaced_r_class_jar/release",
    build / "intermediates/javac/release/compileReleaseJavaWithJavac/classes",
    build / "tmp/kotlin-classes/release",
]

rows = []
for root in roots:
    if not root.exists():
        continue
    for path in sorted(root.rglob("*"), key=lambda p: p.as_posix()):
        if not path.is_file():
            continue
        rel = path.relative_to(build).as_posix()
        h = hashlib.sha256()
        with path.open("rb") as fh:
            for chunk in iter(lambda: fh.read(1024 * 1024), b""):
                h.update(chunk)
        rows.append(f"{h.hexdigest()}  {rel}")

out.write_text("\n".join(rows) + "\n")
print(f"predex_manifest_files={len(rows)}")
print(f"predex_manifest_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")
for row in rows:
    print(row)
PY

sha256sum "$OUT_DIR/predex-manifest.txt" | tee "$OUT_DIR/predex-manifest.sha256"
echo "=== ensure DEX has not run ==="
if find "$SOURCE_DIR/android/app/build" -type f \( -name '*.dex' -o -name 'classes*.dex' \) -print -quit | grep -q .; then
  echo "[FAIL] DEX output already exists at pre-DEX checkpoint." >&2
  find "$SOURCE_DIR/android/app/build" -type f \( -name '*.dex' -o -name 'classes*.dex' \) -print >&2
  exit 3
fi
echo "predex_no_dex_output=true"


snapshot_dex() {
  local label="$1"
  local outfile="$OUT_DIR/${label}-dex-manifest.txt"
  python3 - "$SOURCE_DIR/android/app/build" "$outfile" <<'PY'
from pathlib import Path
import hashlib
import sys

build = Path(sys.argv[1])
out = Path(sys.argv[2])

rows = []
for path in sorted(build.rglob("*"), key=lambda p: p.as_posix()):
    if not path.is_file():
        continue
    rel = path.relative_to(build).as_posix()
    if path.suffix != ".dex" and "/dex" not in f"/{rel.lower()}":
        continue
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    rows.append(f"{h.hexdigest()}  {rel}")

out.write_text("\n".join(rows) + "\n")
print(f"dex_manifest_files={len(rows)}")
print(f"dex_manifest_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")
for row in rows:
    print(row)
PY
  sha256sum "$outfile"
}

echo "=== D8 project checkpoint ==="
run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle dexBuilderRelease --no-daemon"
snapshot_dex "project"
if ! find "$SOURCE_DIR/android/app/build" -type f -name '*.dex' -print -quit | grep -q .; then
  echo "[FAIL] dexBuilderRelease produced no DEX files." >&2
  exit 4
fi

echo "=== D8 external dependency checkpoint ==="
run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle mergeExtDexRelease --no-daemon"
snapshot_dex "project-plus-ext"


snapshot_matching_files() {
  local label="$1"
  shift
  local outfile="$OUT_DIR/${label}-manifest.txt"
  python3 - "$SOURCE_DIR/android/app/build" "$outfile" "$@" <<'PY'
from pathlib import Path
import hashlib
import sys

build = Path(sys.argv[1])
out = Path(sys.argv[2])
needles = [x.lower() for x in sys.argv[3:]]

rows = []
for path in sorted(build.rglob("*"), key=lambda p: p.as_posix()):
    if not path.is_file():
        continue
    rel = path.relative_to(build).as_posix()
    low = rel.lower()
    if not any(n in low for n in needles):
        continue
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    rows.append(f"{h.hexdigest()}  {rel}")

out.write_text("\n".join(rows) + "\n")
print(f"checkpoint_label={out.stem}")
print(f"checkpoint_files={len(rows)}")
print(f"checkpoint_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")
for row in rows:
    print(row)
PY
  sha256sum "$outfile"
}

echo "=== final DEX merge checkpoint ==="
run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle mergeDexRelease --no-daemon"
snapshot_matching_files "merged-dex" "/merged_dex/" "/merged_dex/" "/merged_dex" "/mergeddex" "/merged_dex"

echo "=== ART profile merge checkpoint ==="
run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle mergeReleaseArtProfile compileReleaseArtProfile --no-daemon"
snapshot_matching_files "art-profile" "art_profile" "artprofile" "baseline.prof" "baseline.profm"

echo "=== optimized resources checkpoint ==="
run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle optimizeReleaseResources --no-daemon"
snapshot_matching_files "optimized-resources" "optimized_processed_res" "optimizereleaseresources" "resources-release-optimize" "processed_res/release"
