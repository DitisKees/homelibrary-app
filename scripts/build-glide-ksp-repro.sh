#!/usr/bin/env bash
set -euo pipefail

GLIDE_TAG=v5.0.5
WORK="${TMPDIR:-/tmp}/homelibrary-glide-ksp"
ROOT="$(pwd)"
TOOLS="$ROOT/build/repro-tools"
MAVEN_DIR="$ROOT/build/repro-maven/com/github/bumptech/glide/ksp/5.0.5-homelibrary-repro1"

rm -rf "$WORK" "$TOOLS" "$MAVEN_DIR"
mkdir -p "$TOOLS" "$MAVEN_DIR"

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

RAW="$(find annotation/ksp/build/libs -maxdepth 1 -type f -name '*.jar' ! -name '*sources*' ! -name '*javadoc*' | head -1)"
test -n "$RAW"
cp "$RAW" "$TOOLS/glide-ksp-5.0.5-homelibrary-repro1.raw.jar"

SERVICE='META-INF/services/com.google.devtools.ksp.processing.SymbolProcessorProvider'
jar tf "$RAW" | grep -Fx "$SERVICE"
PROVIDER="$(unzip -p "$RAW" "$SERVICE" | tr -d '\r')"
printf 'KSP provider: %s\n' "$PROVIDER"
test "$PROVIDER" = 'com.bumptech.glide.annotation.ksp.GlideSymbolProcessorProvider'

# Hash the logical contents of the working Gradle-produced JAR.
python3 - "$RAW" "$TOOLS/glide-ksp-entry-hashes.txt" <<'PY'
import hashlib, sys, zipfile
jar, out = sys.argv[1:]
with zipfile.ZipFile(jar) as z, open(out, "w") as f:
    for name in sorted(n for n in z.namelist() if not n.endswith("/")):
        f.write(f"{hashlib.sha256(z.read(name)).hexdigest()}  {name}\n")
PY
grep -F "$SERVICE" "$TOOLS/glide-ksp-entry-hashes.txt"

# Normalize the *working JAR itself*: preserve every entry byte-for-byte,
# sort names, and normalize only ZIP metadata.
NORMALIZED="$MAVEN_DIR/ksp-5.0.5-homelibrary-repro1.jar"
python3 - "$RAW" "$NORMALIZED" <<'PY'
import sys, zipfile
src, dst = sys.argv[1:]
with zipfile.ZipFile(src, "r") as zin, zipfile.ZipFile(
    dst, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
) as zout:
    for name in sorted(zin.namelist()):
        if name.endswith("/"):
            continue
        data = zin.read(name)
        info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        zout.writestr(info, data)
PY

# Prove normalization retained the KSP service contract.
jar tf "$NORMALIZED" | grep -Fx "$SERVICE"
test "$(unzip -p "$NORMALIZED" "$SERVICE" | tr -d '\r')" = 'com.bumptech.glide.annotation.ksp.GlideSymbolProcessorProvider'
jar tf "$NORMALIZED" | grep -Fx 'com/bumptech/glide/annotation/ksp/GlideSymbolProcessorProvider.class'

# Preserve Glide's published dependency metadata rather than inventing a POM.
# The Gradle build produces the publication POM from the same v5.0.5 source.
./gradlew --no-daemon --max-workers=1 :annotation:ksp:generatePomFileForReleasePublication
PUBLISHED_POM="$WORK/annotation/ksp/build/publications/release/pom-default.xml"
test -s "$PUBLISHED_POM"
python3 - "$PUBLISHED_POM" "$MAVEN_DIR/ksp-5.0.5-homelibrary-repro1.pom" <<'PY'
from pathlib import Path
import sys
src, dst = map(Path, sys.argv[1:])
s = src.read_text()
if "<version>5.0.5</version>" not in s:
    raise SystemExit("unexpected Glide KSP publication POM version")
s = s.replace("<version>5.0.5</version>", "<version>5.0.5-homelibrary-repro1</version>", 1)
dst.write_text(s)
PY

# Fail closed unless the copied publication metadata retains the processor's
# important transitive runtime dependencies.
grep -F '<artifactId>annotation</artifactId>' "$MAVEN_DIR/ksp-5.0.5-homelibrary-repro1.pom"
grep -F 'kotlinpoet' "$MAVEN_DIR/ksp-5.0.5-homelibrary-repro1.pom"
grep -F 'symbol-processing-api' "$MAVEN_DIR/ksp-5.0.5-homelibrary-repro1.pom"

sha256sum "$TOOLS/glide-ksp-5.0.5-homelibrary-repro1.raw.jar" "$NORMALIZED"
