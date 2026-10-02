#!/usr/bin/env bash
set -euo pipefail

APP_ID="io.github.ditiskees.homelibrary"
SOURCE_SHA="f5a6762bc092c3f9295658354aeaa76315fa84ec"
SOURCE_DIR="/home/vagrant/build/$APP_ID"
OUT_DIR="${GITHUB_WORKSPACE:-$PWD}/diagnostic-output"
AGP_OVERRIDE="${AGP_OVERRIDE:-}"
DETERMINISTIC_AGP_WORKAROUNDS="${DETERMINISTIC_AGP_WORKAROUNDS:-0}"
FULL_BUILD_DIAGNOSTIC="${FULL_BUILD_DIAGNOSTIC:-0}"
ORDER_TRACE="${ORDER_TRACE:-0}"
SORT_DIRENTS_PRELOAD="${SORT_DIRENTS_PRELOAD:-0}"
RESOURCE_TASK_TRACE="${RESOURCE_TASK_TRACE:-0}"
RESOURCE_ONLY_DIAGNOSTIC="${RESOURCE_ONLY_DIAGNOSTIC:-0}"
RESOURCE_MAX_WORKERS="${RESOURCE_MAX_WORKERS:-2}"

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
  runuser -u vagrant -- env \
    HOME=/home/vagrant \
    PATH="$PATH" \
    LD_PRELOAD="${LD_PRELOAD:-}" \
    bash -lc "$1"
}

run_as_vagrant "cd '$SOURCE_DIR' && node --version && npm --version" | tee "$OUT_DIR/node-toolchain.txt"

run_as_vagrant "cd '$SOURCE_DIR' && sed -i -e 's/\"node\":\ \">=22.13.0 <23\"/\"node\":\ \">=22.13.0\"/' package.json && npm ci"

if [[ -n "$AGP_OVERRIDE" ]]; then
  echo "=== AGP override: 8.12.0 -> $AGP_OVERRIDE ==="
  run_as_vagrant "cd '$SOURCE_DIR' && grep -RIl '8\\.12\\.0' node_modules/@react-native node_modules/react-native | sort -u | tee /tmp/homelibrary-agp-files"
  test -s /tmp/homelibrary-agp-files
  run_as_vagrant "cd '$SOURCE_DIR' && xargs -r sed -i -e 's/8\\.12\\.0/$AGP_OVERRIDE/g' < /tmp/homelibrary-agp-files && xargs -r grep -nH '$AGP_OVERRIDE' < /tmp/homelibrary-agp-files"
fi

run_as_vagrant "cd '$SOURCE_DIR' && find node_modules -type d -name local-maven-repo -prune -exec rm -rf {} +"
run_as_vagrant "cd '$SOURCE_DIR' && sed -i '/jvmToolchain\|JavaVersion/s/17/21/' node_modules/@react-native/gradle-plugin/*/build.gradle.kts node_modules/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/utils/JdkConfiguratorUtils.kt"
run_as_vagrant "cd '$SOURCE_DIR' && npx expo prebuild -p android --clean"
run_as_vagrant "cd '$SOURCE_DIR' && bash scripts/prepare-android-gradle-properties.sh"
run_as_vagrant "cd '$SOURCE_DIR' && printf '%s\n' 'org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8' 'org.gradle.workers.max=$RESOURCE_MAX_WORKERS' 'kotlin.compiler.execution.strategy=in-process' >> android/gradle.properties"
run_as_vagrant "cd '$SOURCE_DIR' && bash scripts/prepare-android-gradle-properties.sh"

if [[ "$SORT_DIRENTS_PRELOAD" == "1" ]]; then
  echo "=== deterministic sorted readdir preload ==="
  if ! command -v gcc >/dev/null 2>&1; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y gcc libc6-dev
  fi
  cat > /tmp/homelibrary-sortdir-preload.c <<'C'
#define _GNU_SOURCE
#include <dirent.h>
#include <dlfcn.h>
#include <errno.h>
#include <pthread.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

typedef struct SortEntry {
    uint64_t ino;
    int64_t off;
    unsigned short reclen;
    unsigned char type;
    char *name;
} SortEntry;

typedef struct SortState {
    DIR *dir;
    SortEntry *entries;
    size_t count;
    size_t capacity;
    size_t index;
    int loaded;
    struct SortState *next;
} SortState;

static pthread_mutex_t state_lock = PTHREAD_MUTEX_INITIALIZER;
static pthread_once_t init_once = PTHREAD_ONCE_INIT;
static SortState *states = NULL;

static struct dirent *(*real_readdir_fn)(DIR *);
static struct dirent64 *(*real_readdir64_fn)(DIR *);
static int (*real_closedir_fn)(DIR *);
static void (*real_rewinddir_fn)(DIR *);
static long (*real_telldir_fn)(DIR *);
static void (*real_seekdir_fn)(DIR *, long);

static void init_real(void) {
    real_readdir_fn = dlsym(RTLD_NEXT, "readdir");
    real_readdir64_fn = dlsym(RTLD_NEXT, "readdir64");
    real_closedir_fn = dlsym(RTLD_NEXT, "closedir");
    real_rewinddir_fn = dlsym(RTLD_NEXT, "rewinddir");
    real_telldir_fn = dlsym(RTLD_NEXT, "telldir");
    real_seekdir_fn = dlsym(RTLD_NEXT, "seekdir");
    if (!real_readdir_fn || !real_readdir64_fn || !real_closedir_fn) {
        const char msg[] = "sortdir-preload: failed to resolve libc directory functions\n";
        write(2, msg, sizeof(msg) - 1);
        _exit(127);
    }
}

static int entry_cmp(const void *a, const void *b) {
    const SortEntry *ea = a;
    const SortEntry *eb = b;
    return strcmp(ea->name, eb->name);
}

static SortState *find_state(DIR *dir) {
    for (SortState *s = states; s; s = s->next) {
        if (s->dir == dir) return s;
    }
    return NULL;
}

static SortState *get_state(DIR *dir) {
    SortState *s = find_state(dir);
    if (s) return s;
    s = calloc(1, sizeof(*s));
    if (!s) return NULL;
    s->dir = dir;
    s->next = states;
    states = s;
    return s;
}

static int append_entry(SortState *s, uint64_t ino, int64_t off,
                        unsigned short reclen, unsigned char type,
                        const char *name) {
    if (s->count == s->capacity) {
        size_t cap = s->capacity ? s->capacity * 2 : 32;
        SortEntry *p = realloc(s->entries, cap * sizeof(*p));
        if (!p) return -1;
        s->entries = p;
        s->capacity = cap;
    }
    SortEntry *e = &s->entries[s->count++];
    e->ino = ino;
    e->off = off;
    e->reclen = reclen;
    e->type = type;
    e->name = strdup(name);
    return e->name ? 0 : -1;
}

static int load_entries(DIR *dir, SortState *s, int use64) {
    errno = 0;
    if (use64) {
        struct dirent64 *d;
        while ((d = real_readdir64_fn(dir)) != NULL) {
            if (append_entry(s, d->d_ino, d->d_off, d->d_reclen, d->d_type, d->d_name) != 0)
                return -1;
        }
    } else {
        struct dirent *d;
        while ((d = real_readdir_fn(dir)) != NULL) {
            if (append_entry(s, d->d_ino, d->d_off, d->d_reclen, d->d_type, d->d_name) != 0)
                return -1;
        }
    }
    if (errno != 0) return -1;
    qsort(s->entries, s->count, sizeof(*s->entries), entry_cmp);
    s->loaded = 1;
    s->index = 0;
    return 0;
}

static void free_state(SortState *s) {
    if (!s) return;
    for (size_t i = 0; i < s->count; ++i) free(s->entries[i].name);
    free(s->entries);
    free(s);
}

struct dirent *readdir(DIR *dir) {
    static __thread struct dirent out;
    pthread_once(&init_once, init_real);
    pthread_mutex_lock(&state_lock);
    SortState *s = get_state(dir);
    if (!s || (!s->loaded && load_entries(dir, s, 0) != 0)) {
        pthread_mutex_unlock(&state_lock);
        return NULL;
    }
    if (s->index >= s->count) {
        pthread_mutex_unlock(&state_lock);
        errno = 0;
        return NULL;
    }
    SortEntry *e = &s->entries[s->index++];
    memset(&out, 0, sizeof(out));
    out.d_ino = (ino_t)e->ino;
    out.d_off = (off_t)e->off;
    out.d_reclen = e->reclen;
    out.d_type = e->type;
    strncpy(out.d_name, e->name, sizeof(out.d_name) - 1);
    pthread_mutex_unlock(&state_lock);
    errno = 0;
    return &out;
}

struct dirent64 *readdir64(DIR *dir) {
    static __thread struct dirent64 out;
    pthread_once(&init_once, init_real);
    pthread_mutex_lock(&state_lock);
    SortState *s = get_state(dir);
    if (!s || (!s->loaded && load_entries(dir, s, 1) != 0)) {
        pthread_mutex_unlock(&state_lock);
        return NULL;
    }
    if (s->index >= s->count) {
        pthread_mutex_unlock(&state_lock);
        errno = 0;
        return NULL;
    }
    SortEntry *e = &s->entries[s->index++];
    memset(&out, 0, sizeof(out));
    out.d_ino = (ino64_t)e->ino;
    out.d_off = (off64_t)e->off;
    out.d_reclen = e->reclen;
    out.d_type = e->type;
    strncpy(out.d_name, e->name, sizeof(out.d_name) - 1);
    pthread_mutex_unlock(&state_lock);
    errno = 0;
    return &out;
}

int closedir(DIR *dir) {
    pthread_once(&init_once, init_real);
    pthread_mutex_lock(&state_lock);
    SortState **pp = &states;
    SortState *found = NULL;
    while (*pp) {
        if ((*pp)->dir == dir) {
            found = *pp;
            *pp = found->next;
            break;
        }
        pp = &(*pp)->next;
    }
    pthread_mutex_unlock(&state_lock);
    free_state(found);
    return real_closedir_fn(dir);
}

void rewinddir(DIR *dir) {
    pthread_once(&init_once, init_real);
    pthread_mutex_lock(&state_lock);
    SortState *s = find_state(dir);
    if (s && s->loaded) {
        s->index = 0;
        pthread_mutex_unlock(&state_lock);
        return;
    }
    pthread_mutex_unlock(&state_lock);
    if (real_rewinddir_fn) real_rewinddir_fn(dir);
}

long telldir(DIR *dir) {
    pthread_once(&init_once, init_real);
    pthread_mutex_lock(&state_lock);
    SortState *s = find_state(dir);
    if (s && s->loaded) {
        long pos = (long)s->index;
        pthread_mutex_unlock(&state_lock);
        return pos;
    }
    pthread_mutex_unlock(&state_lock);
    return real_telldir_fn ? real_telldir_fn(dir) : -1;
}

void seekdir(DIR *dir, long loc) {
    pthread_once(&init_once, init_real);
    pthread_mutex_lock(&state_lock);
    SortState *s = find_state(dir);
    if (s && s->loaded && loc >= 0 && (size_t)loc <= s->count) {
        s->index = (size_t)loc;
        pthread_mutex_unlock(&state_lock);
        return;
    }
    pthread_mutex_unlock(&state_lock);
    if (real_seekdir_fn) real_seekdir_fn(dir, loc);
}
C
  gcc -shared -fPIC -O2 -Wall -Wextra \
    -o /tmp/homelibrary-sortdir-preload.so /tmp/homelibrary-sortdir-preload.c \
    -ldl -pthread
  chmod 0755 /tmp/homelibrary-sortdir-preload.so
  export LD_PRELOAD=/tmp/homelibrary-sortdir-preload.so
  echo "sortdir_preload=$LD_PRELOAD"
  run_as_vagrant "python3 - <<'PY'
import os, tempfile
with tempfile.TemporaryDirectory() as d:
    for n in ['z','b','a','m']:
        open(os.path.join(d,n),'w').close()
    print('sortdir_probe=' + ','.join(x.name for x in os.scandir(d)))
PY"
fi

if [[ "$DETERMINISTIC_AGP_WORKAROUNDS" == "1" ]]; then
  echo "=== deterministic AGP workarounds ==="
  run_as_vagrant "cd '$SOURCE_DIR' && printf '%s\\n' 'android.enableResourceOptimizations=false' 'android.useFullClasspathForDexingTransform=true' >> android/gradle.properties"
  run_as_vagrant "cd '$SOURCE_DIR' && tail -n 10 android/gradle.properties"
fi
if [[ "$AGP_OVERRIDE" == "8.13.2" ]]; then
  echo "=== preinstall NDK 27.1.12297006 for AGP 8.13.2 ==="
  source /etc/profile.d/bsenv.sh
  export ANDROID_HOME=/opt/android-sdk
  export ANDROID_SDK_ROOT=/opt/android-sdk
  rm -rf /opt/android-sdk/ndk/27.1.12297006 /github/home/.cache/sdkmanager/ndk-27.1.12297006* || true
  for attempt in 1 2 3; do
    echo "ndk_install_attempt=$attempt"
    rm -f /github/home/.cache/sdkmanager/ndk-27.1.12297006* || true
    yes | sdkmanager "ndk;27.1.12297006" || true
    if [[ -x /opt/android-sdk/ndk/27.1.12297006/ndk-build ]]; then
      echo "ndk_install_verified=true"
      break
    fi
    rm -rf /opt/android-sdk/ndk/27.1.12297006 /github/home/.cache/sdkmanager/ndk-27.1.12297006* || true
    if [[ "$attempt" == "3" ]]; then
      echo "[FAIL] Unable to install NDK 27.1.12297006 cleanly." >&2
      exit 9
    fi
  done
  /opt/android-sdk/ndk/27.1.12297006/ndk-build --version | head -n 1 || true
fi
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

if [[ "$DETERMINISTIC_AGP_WORKAROUNDS" == "1" || "$FULL_BUILD_DIAGNOSTIC" == "1" ]]; then
  echo "=== full-build APK entry checkpoint ==="
  DEBIAN_FRONTEND=noninteractive apt-get install -y sudo openjdk-21-jdk-headless unzip
  update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java
  source /etc/profile.d/bsenv.sh
  export ANDROID_HOME=/opt/android-sdk
  export ANDROID_SDK_ROOT=/opt/android-sdk
  export GRADLE_USER_HOME=/home/vagrant/.gradle
  mkdir -p "$GRADLE_USER_HOME"

  if [[ "$AGP_OVERRIDE" == "8.13.2" ]]; then
    echo "=== ensure clean CMake 3.22.1 for AGP 8.13.2 ==="
    rm -rf /opt/android-sdk/cmake/3.22.1 /opt/android-sdk/.temp /root/.android/cache /home/vagrant/.android/cache /github/home/.cache/sdkmanager || true
    for attempt in 1 2 3; do
      echo "cmake_install_attempt=$attempt"
      rm -f /github/home/.cache/sdkmanager/cmake-3.22.1-linux.zip || true
      yes | sdkmanager "cmake;3.22.1" || true
      if [[ -x /opt/android-sdk/cmake/3.22.1/bin/cmake ]]; then
        echo "cmake_install_verified=true"
        break
      fi
      rm -rf /opt/android-sdk/cmake/3.22.1 /opt/android-sdk/.temp /github/home/.cache/sdkmanager/cmake-3.22.1-linux.zip || true
      if [[ "$attempt" == "3" ]]; then
        echo "[FAIL] Unable to install CMake 3.22.1 cleanly." >&2
        exit 8
      fi
    done
    /opt/android-sdk/cmake/3.22.1/bin/cmake --version
  fi
  chown -R vagrant:vagrant "$GRADLE_USER_HOME"

  run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle assembleRelease --no-daemon"

  APK="$SOURCE_DIR/android/app/build/outputs/apk/release/app-release-unsigned.apk"
  test -f "$APK"
  python3 - "$APK" "$OUT_DIR/final-apk-entry-manifest.txt" <<'PY'
from pathlib import Path
import hashlib
import sys
import zipfile

apk = Path(sys.argv[1])
out = Path(sys.argv[2])
wanted = [
    "classes.dex",
    "classes2.dex",
    "classes3.dex",
    "assets/dexopt/baseline.prof",
    "assets/dexopt/baseline.profm",
    "resources.arsc",
]
rows = []
with zipfile.ZipFile(apk) as zf:
    names = set(zf.namelist())
    for name in wanted:
        if name not in names:
            continue
        data = zf.read(name)
        rows.append(f"{hashlib.sha256(data).hexdigest()}  {name}")
out.write_text("\n".join(rows) + "\n")
print(f"final_apk_sha256={hashlib.sha256(apk.read_bytes()).hexdigest()}")
print(f"final_entry_manifest_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")
for row in rows:
    print(row)
PY
  exit 0
fi

echo "=== Gradle pre-DEX checkpoint ==="
DEBIAN_FRONTEND=noninteractive apt-get install -y sudo openjdk-21-jdk-headless
update-alternatives --set java /usr/lib/jvm/java-21-openjdk-amd64/bin/java
source /etc/profile.d/bsenv.sh
export ANDROID_HOME=/opt/android-sdk
export ANDROID_SDK_ROOT=/opt/android-sdk
export GRADLE_USER_HOME=/home/vagrant/.gradle
mkdir -p "$GRADLE_USER_HOME"
chown -R vagrant:vagrant "$GRADLE_USER_HOME"

RESOURCE_TRACE_ARGS=""
if [[ "$RESOURCE_TASK_TRACE" == "1" ]]; then
  echo "=== processReleaseResources input tracing ==="
  cat > /tmp/homelibrary-resource-task-trace.init.gradle <<'GROOVY'
import java.security.MessageDigest
import org.gradle.api.file.FileCollection
import org.gradle.api.file.FileSystemLocation
import org.gradle.api.provider.Provider

def sha256 = { File f ->
  if (!f.isFile()) return "-"
  def md = MessageDigest.getInstance("SHA-256")
  f.withInputStream { input ->
    byte[] buf = new byte[1024 * 1024]
    int n
    while ((n = input.read(buf)) > 0) md.update(buf, 0, n)
  }
  md.digest().encodeHex().toString()
}

gradle.allprojects { p ->
  p.tasks.configureEach { t ->
    if (t.name != "processReleaseResources") return
    t.doFirst {
      def outDir = new File(System.getenv("RESOURCE_TRACE_DIR"))
      outDir.mkdirs()
      def out = new File(outDir, "processReleaseResources-task-inputs.txt")
      out.withPrintWriter("UTF-8") { pw ->
        pw.println("task=" + t.path)
        pw.println("class=" + t.class.name)
        pw.println("projectDir=" + t.project.projectDir)
        pw.println("=== inputs.files iteration order ===")
        int i = 0
        t.inputs.files.each { File f ->
          pw.println(String.format("%06d\t%s\t%d\t%s", i++, f.absolutePath, f.isFile() ? f.length() : -1L, sha256(f)))
        }
        pw.println("=== inputs.properties ===")
        t.inputs.properties.keySet().toList().sort().each { k ->
          try { pw.println(k + "=" + String.valueOf(t.inputs.properties[k])) }
          catch (Throwable e) { pw.println(k + "=<error:" + e.class.name + ">") }
        }
        pw.println("=== task FileCollection-like properties ===")
        t.properties.keySet().toList().sort().each { k ->
          try {
            def v = t.properties[k]
            if (v instanceof FileCollection) {
              pw.println("PROPERTY " + k + " " + v.class.name)
              int j = 0
              v.each { File f ->
                pw.println(String.format("  %06d\t%s\t%d\t%s", j++, f.absolutePath, f.isFile() ? f.length() : -1L, sha256(f)))
              }
            } else if (v instanceof Provider) {
              def q = v.orNull
              if (q instanceof FileSystemLocation) {
                def f = q.asFile
                pw.println("PROPERTY " + k + " Provider<FileSystemLocation> " + f.absolutePath + "\t" + (f.isFile() ? f.length() : -1L) + "\t" + sha256(f))
              }
            }
          } catch (Throwable e) {
            pw.println("PROPERTY " + k + " <error:" + e.class.name + ">")
          }
        }
      }
      println("RESOURCE_TRACE " + t.path + " -> " + out.absolutePath)
    }
  }
}
GROOVY
  RESOURCE_TRACE_DIR="/tmp/homelibrary-resource-trace"
  rm -rf "$RESOURCE_TRACE_DIR"
  mkdir -p "$RESOURCE_TRACE_DIR"
  chown -R vagrant:vagrant "$RESOURCE_TRACE_DIR"
  chmod 0644 /tmp/homelibrary-resource-task-trace.init.gradle
  RESOURCE_TRACE_ARGS="-I /tmp/homelibrary-resource-task-trace.init.gradle"
fi

if [[ "$RESOURCE_TASK_TRACE" == "1" ]]; then
  run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle RESOURCE_TRACE_DIR='$RESOURCE_TRACE_DIR'; cd '$SOURCE_DIR/android/app' && gradle processReleaseResources compileReleaseKotlin compileReleaseJavaWithJavac --no-daemon $RESOURCE_TRACE_ARGS --info" | tee "$OUT_DIR/processReleaseResources-info.log"
  cp "$RESOURCE_TRACE_DIR/processReleaseResources-task-inputs.txt" "$OUT_DIR/"
else
  run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle processReleaseResources compileReleaseKotlin compileReleaseJavaWithJavac --no-daemon"
fi

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

echo "=== linked resource archive checkpoint ==="
python3 - "$SOURCE_DIR/android/app/build/intermediates/linked_resources_binary_format/release/processReleaseResources/linked-resources-binary-format-release.ap_" "$OUT_DIR/linked-resource-archive-manifest.txt" <<'PY'
from pathlib import Path
import hashlib
import sys
import zipfile

archive = Path(sys.argv[1])
out = Path(sys.argv[2])
rows = []
with zipfile.ZipFile(archive) as zf:
    for i, info in enumerate(zf.infolist()):
        data = zf.read(info.filename)
        rows.append(
            f"{i:06d}\t{info.filename}\t{info.file_size}\t{info.compress_type}\t"
            f"{hashlib.sha256(data).hexdigest()}"
        )

out.write_text("\n".join(rows) + "\n")
print(f"linked_resource_archive_sha256={hashlib.sha256(archive.read_bytes()).hexdigest()}")
print(f"linked_resource_entry_count={len(rows)}")
print(f"linked_resource_manifest_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")
for row in rows:
    print(row)
PY
sha256sum "$OUT_DIR/linked-resource-archive-manifest.txt"

echo "=== AAPT2 resource-table semantic checkpoint ==="
LINKED_RESOURCE_ARCHIVE="$SOURCE_DIR/android/app/build/intermediates/linked_resources_binary_format/release/processReleaseResources/linked-resources-binary-format-release.ap_"
AAPT2_BIN="/opt/android-sdk/build-tools/36.0.0/aapt2"
if [[ ! -x "$AAPT2_BIN" ]]; then
  echo "[FAIL] Installed Android Build Tools AAPT2 not found at $AAPT2_BIN." >&2
  exit 12
fi
echo "aapt2_bin=$AAPT2_BIN"
"$AAPT2_BIN" dump resources "$LINKED_RESOURCE_ARCHIVE" > "$OUT_DIR/aapt2-resources-dump.txt"
echo "aapt2_resources_dump_sha256=$(sha256sum "$OUT_DIR/aapt2-resources-dump.txt" | awk '{print $1}')"
LC_ALL=C sort "$OUT_DIR/aapt2-resources-dump.txt" > "$OUT_DIR/aapt2-resources-dump.sorted.txt"
echo "aapt2_resources_dump_sorted_sha256=$(sha256sum "$OUT_DIR/aapt2-resources-dump.sorted.txt" | awk '{print $1}')"
sed -E 's/0x[0-9a-fA-F]{8}/0xRESOURCE_ID/g' "$OUT_DIR/aapt2-resources-dump.txt" | LC_ALL=C sort > "$OUT_DIR/aapt2-resources-dump.ids-normalized.sorted.txt"
echo "aapt2_resources_dump_ids_normalized_sorted_sha256=$(sha256sum "$OUT_DIR/aapt2-resources-dump.ids-normalized.sorted.txt" | awk '{print $1}')"
echo "aapt2_resources_dump_lines=$(wc -l < "$OUT_DIR/aapt2-resources-dump.txt")"

if [[ "$RESOURCE_ONLY_DIAGNOSTIC" == "1" ]]; then
  echo "resource_only_diagnostic_complete=true"
  exit 0
fi

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

echo "=== native filesystem DEX enumeration checkpoint ==="
python3 - "$SOURCE_DIR" "$OUT_DIR/dex-native-enumeration-manifest.txt" <<'PY'
from pathlib import Path
import hashlib
import os
import sys

root = Path(sys.argv[1])
out = Path(sys.argv[2])

roots = [
    root / "android/app/build/intermediates/project_dex_archive/release/dexBuilderRelease/out",
    root / "android/app/build/intermediates/mixed_scope_dex_archive/release/dexBuilderRelease/out",
    root / "android/app/build/intermediates/external_libs_dex/release/mergeExtDexRelease",
]

for base in [
    root / "node_modules",
    root / "modules",
]:
    if not base.exists():
        continue
    for dirpath, dirnames, filenames in os.walk(base):
        p = Path(dirpath)
        if p.name == "bundleLibRuntimeToDirRelease_dex":
            roots.append(p)
            dirnames[:] = []

rows = []
for root_index, dex_root in enumerate(roots):
    if not dex_root.exists():
        continue
    rows.append(f"ROOT\t{root_index:03d}\t{dex_root.relative_to(root).as_posix()}")
    stack = [(dex_root, "")]
    while stack:
        current, relprefix = stack.pop()
        entries = list(os.scandir(current))
        for idx, entry in enumerate(entries):
            rel = f"{relprefix}/{entry.name}".lstrip("/")
            p = Path(entry.path)
            if entry.is_file(follow_symlinks=False):
                h = hashlib.sha256(p.read_bytes()).hexdigest()
                rows.append(f"FILE\t{root_index:03d}\t{idx:06d}\t{rel}\t{p.stat().st_size}\t{h}")
            elif entry.is_dir(follow_symlinks=False):
                rows.append(f"DIR\t{root_index:03d}\t{idx:06d}\t{rel}")
        for entry in reversed(entries):
            if entry.is_dir(follow_symlinks=False):
                rel = f"{relprefix}/{entry.name}".lstrip("/")
                stack.append((Path(entry.path), rel))

out.write_text("\n".join(rows) + "\n")
print(f"dex_native_enumeration_rows={len(rows)}")
print(f"dex_native_enumeration_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")
for row in rows:
    print(row)
PY
sha256sum "$OUT_DIR/dex-native-enumeration-manifest.txt"



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

TRACE_GRADLE_ARGS=""
if [[ "$ORDER_TRACE" == "1" ]]; then
  echo "=== task input/order tracing enabled ==="
  cat > /tmp/homelibrary-task-input-trace.init.gradle <<'GROOVY'
import java.security.MessageDigest
import org.gradle.api.file.FileCollection
import org.gradle.api.file.FileSystemLocation
import org.gradle.api.provider.Provider

def sha256 = { File f ->
  if (!f.isFile()) return "-"
  def md = MessageDigest.getInstance("SHA-256")
  f.withInputStream { input ->
    byte[] buf = new byte[1024 * 1024]
    int n
    while ((n = input.read(buf)) > 0) md.update(buf, 0, n)
  }
  md.digest().encodeHex().toString()
}

gradle.allprojects { p ->
  p.tasks.configureEach { t ->
    if (!(t.name in ["mergeDexRelease", "optimizeReleaseResources"])) return
    t.doFirst {
      def outDir = new File(System.getenv("ORDER_TRACE_DIR"))
      outDir.mkdirs()
      def out = new File(outDir, t.name + "-task-inputs.txt")
      out.withPrintWriter("UTF-8") { pw ->
        pw.println("task=" + t.path)
        pw.println("class=" + t.class.name)
        pw.println("projectDir=" + t.project.projectDir)
        pw.println("=== inputs.files iteration order ===")
        int i = 0
        t.inputs.files.each { File f ->
          pw.println(String.format("%06d\t%s\t%d\t%s", i++, f.absolutePath, f.isFile() ? f.length() : -1L, sha256(f)))
        }
        pw.println("=== inputs.properties ===")
        t.inputs.properties.keySet().toList().sort().each { k ->
          try { pw.println(k + "=" + String.valueOf(t.inputs.properties[k])) }
          catch (Throwable e) { pw.println(k + "=<error:" + e.class.name + ">") }
        }
        pw.println("=== task FileCollection-like properties ===")
        t.properties.keySet().toList().sort().each { k ->
          try {
            def v = t.properties[k]
            if (v instanceof FileCollection) {
              pw.println("PROPERTY " + k + " " + v.class.name)
              int j = 0
              v.each { File f ->
                pw.println(String.format("  %06d\t%s\t%d\t%s", j++, f.absolutePath, f.isFile() ? f.length() : -1L, sha256(f)))
              }
            } else if (v instanceof Provider) {
              def q = v.orNull
              if (q instanceof FileSystemLocation) {
                def f = q.asFile
                pw.println("PROPERTY " + k + " Provider<FileSystemLocation> " + f.absolutePath + "\t" + (f.isFile() ? f.length() : -1L) + "\t" + sha256(f))
              }
            }
          } catch (Throwable e) {
            pw.println("PROPERTY " + k + " <error:" + e.class.name + ">")
          }
        }
      }
      println("ORDER_TRACE " + t.path + " -> " + out.absolutePath)
    }
  }
}
GROOVY
  chmod 0644 /tmp/homelibrary-task-input-trace.init.gradle
  TRACE_OUT_DIR="/tmp/homelibrary-order-trace"
  rm -rf "$TRACE_OUT_DIR"
  mkdir -p "$TRACE_OUT_DIR"
  chown -R vagrant:vagrant "$TRACE_OUT_DIR"
  TRACE_GRADLE_ARGS="-I /tmp/homelibrary-task-input-trace.init.gradle"
fi

echo "=== final DEX merge checkpoint ==="
if [[ "$ORDER_TRACE" == "1" ]]; then
  run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle ORDER_TRACE_DIR='$TRACE_OUT_DIR'; cd '$SOURCE_DIR/android/app' && gradle mergeDexRelease --no-daemon $TRACE_GRADLE_ARGS --info" | tee "$OUT_DIR/mergeDexRelease-info.log"
  cp "$TRACE_OUT_DIR/mergeDexRelease-task-inputs.txt" "$OUT_DIR/"
else
  run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle mergeDexRelease --no-daemon"
fi
python3 - "$SOURCE_DIR/android/app/build" "$OUT_DIR/merged-dex-manifest.txt" <<'PY'
from pathlib import Path
import hashlib
import sys

build = Path(sys.argv[1])
out = Path(sys.argv[2])

rows = []
for path in sorted(build.rglob("*.dex"), key=lambda p: p.as_posix()):
    rel = path.relative_to(build).as_posix()
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    rows.append(f"{h}  {rel}")

out.write_text("\n".join(rows) + "\n")
print(f"merged_dex_files={len(rows)}")
print(f"merged_dex_manifest_sha256={hashlib.sha256(out.read_bytes()).hexdigest()}")
for row in rows:
    print(row)
PY
sha256sum "$OUT_DIR/merged-dex-manifest.txt"

echo "=== ART profile merge checkpoint ==="
run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle mergeReleaseArtProfile compileReleaseArtProfile --no-daemon"
snapshot_matching_files "art-profile" "art_profile" "artprofile" "baseline.prof" "baseline.profm"

echo "=== optimized resources checkpoint ==="
if [[ "$ORDER_TRACE" == "1" ]]; then
  run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle ORDER_TRACE_DIR='$TRACE_OUT_DIR'; cd '$SOURCE_DIR/android/app' && gradle optimizeReleaseResources --no-daemon $TRACE_GRADLE_ARGS --info" | tee "$OUT_DIR/optimizeReleaseResources-info.log"
  cp "$TRACE_OUT_DIR/optimizeReleaseResources-task-inputs.txt" "$OUT_DIR/"
else
  run_as_vagrant "export ANDROID_HOME=/opt/android-sdk ANDROID_SDK_ROOT=/opt/android-sdk GRADLE_USER_HOME=/home/vagrant/.gradle; cd '$SOURCE_DIR/android/app' && gradle optimizeReleaseResources --no-daemon"
fi
snapshot_matching_files "optimized-resources" "optimized_processed_res" "optimizereleaseresources" "resources-release-optimize" "processed_res/release"
