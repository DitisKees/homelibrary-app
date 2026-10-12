#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SOURCE="${1:?Pass the F-Droid Glide srclib source directory}"
PIN=ebbf7e2680e0a5812bdb428034aa38fb9260dba7
# F-Droid fetches the srclib before prebuild. Reject a different source revision.
test "$(git -C "$SOURCE" rev-parse HEAD)" = "$PIN"
WORK="$ROOT/build/glide-source"
rm -rf "$WORK"
mkdir -p "$WORK/annotation/src/main" "$WORK/ksp/src/main" "$WORK/gradle/wrapper"
cp -R "$ROOT/scripts/glide-ksp/." "$WORK/"
cp -R "$SOURCE/annotation/src/main/java" "$WORK/annotation/src/main/"
cp -R "$SOURCE/annotation/ksp/src/main/kotlin" "$WORK/ksp/src/main/"
cp "$SOURCE/LICENSE" "$WORK/LICENSE"
# Text version declaration only: the F-Droid launcher selects controlled Gradle.
cp "$SOURCE/gradle/wrapper/gradle-wrapper.properties" "$WORK/gradle/wrapper/"
python3 - "$WORK/ksp/src/main/kotlin/com/bumptech/glide/annotation/ksp/LibraryGlideModules.kt" <<'PY'
from pathlib import Path
import sys
p = Path(sys.argv[1])
s = p.read_text()
old = "allLibraryGlideModules.associateBy { it.name }.values.toList()"
new = "allLibraryGlideModules.associateBy { it.name }.values.sortedBy { it.name.qualifiedName }"
if s.count(old) != 1:
    raise SystemExit("unexpected Glide 5.0.5 parseUnique source")
p.write_text(s.replace(old, new))
PY
printf '%s\n' "$PIN" > "$WORK/upstream-commit.txt"
echo "Glide processor sources staged for F-Droid scanning: $WORK"
