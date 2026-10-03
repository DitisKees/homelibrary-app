#!/usr/bin/env bash
set -euo pipefail

GLIDE_TAG=v5.0.5
WORK="${TMPDIR:-/tmp}/homelibrary-glide-ksp"
ROOT="$(pwd)"

rm -rf "$WORK" "$ROOT/build/repro-tools"
mkdir -p "$ROOT/build/repro-tools"

git clone --quiet --depth 1 --branch "$GLIDE_TAG" https://github.com/bumptech/glide.git "$WORK"
FILE="$WORK/annotation/ksp/src/main/kotlin/com/bumptech/glide/annotation/ksp/LibraryGlideModules.kt"

python3 - "$FILE" <<'PY'
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

grep -F 'values.sortedBy { it.name.qualifiedName }' "$FILE"

cd "$WORK"
./gradlew --no-daemon --max-workers=1 :annotation:ksp:jar

JAR="$(find annotation/ksp/build/libs -maxdepth 1 -type f -name '*.jar' ! -name '*sources*' ! -name '*javadoc*' | head -1)"
test -n "$JAR"

cp "$JAR" "$ROOT/build/repro-tools/glide-ksp-5.0.5-homelibrary-repro1.raw.jar"
mkdir -p "$ROOT/build/repro-tools/unpacked"
(cd "$ROOT/build/repro-tools/unpacked" && jar xf ../glide-ksp-5.0.5-homelibrary-repro1.raw.jar)

(
  cd "$ROOT/build/repro-tools/unpacked"
  find . -type f -print0 | sort -z | xargs -0 sha256sum > ../glide-ksp-entry-hashes.txt
)

test -s "$ROOT/build/repro-tools/glide-ksp-entry-hashes.txt"
grep -F 'LibraryGlideModulesParser.class' "$ROOT/build/repro-tools/glide-ksp-entry-hashes.txt"
sha256sum "$ROOT/build/repro-tools/glide-ksp-5.0.5-homelibrary-repro1.raw.jar"

# Produce deterministic local Maven artifact from the verified unpacked contents.
MAVEN_DIR="$ROOT/build/repro-maven/com/github/bumptech/glide/ksp/5.0.5-homelibrary-repro1"
mkdir -p "$MAVEN_DIR"
NORMALIZED="$MAVEN_DIR/ksp-5.0.5-homelibrary-repro1.jar"
rm -f "$NORMALIZED"
(
  cd "$ROOT/build/repro-tools/unpacked"
  find . -type f -print0 | sort -z | xargs -0 touch -h -d '@315532800'
  find . -type f -print0 | sort -z | sed -z 's#^./##' | zip -X -q -@ "$NORMALIZED"
)
cat > "$MAVEN_DIR/ksp-5.0.5-homelibrary-repro1.pom" <<'POM'
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.github.bumptech.glide</groupId>
  <artifactId>ksp</artifactId>
  <version>5.0.5-homelibrary-repro1</version>
</project>
POM
sha256sum "$NORMALIZED"
