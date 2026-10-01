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
PY

grep -E '(^|/)(build.gradle|build.gradle.kts|settings.gradle|settings.gradle.kts|gradle.properties|libs.versions.toml)$' "$OUT_DIR/prebuild-manifest.txt" > "$OUT_DIR/prebuild-gradle-files.txt" || true
sha256sum "$OUT_DIR/prebuild-manifest.txt" | tee "$OUT_DIR/prebuild-manifest.sha256"
