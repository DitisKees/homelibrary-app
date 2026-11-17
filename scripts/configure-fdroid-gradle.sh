#!/usr/bin/env bash
# Preserve the production buildserver settings and guard the generated config
# both before and after appending them.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROPERTIES_FILE="${1:-$ROOT/android/gradle.properties}"
bash "$ROOT/scripts/prepare-android-gradle-properties.sh" "$PROPERTIES_FILE"
cat >> "$PROPERTIES_FILE" <<'EOF'
org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8
org.gradle.workers.max=2
kotlin.compiler.execution.strategy=in-process
EOF
bash "$ROOT/scripts/prepare-android-gradle-properties.sh" "$PROPERTIES_FILE"
