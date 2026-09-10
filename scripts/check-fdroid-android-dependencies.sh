#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
REVIEWED_GROUPS_FILE="$ROOT/scripts/fdroid-reviewed-native-groups.txt"

if [[ ! -d "$ANDROID_DIR" ]]; then
  echo "android/ is missing; run 'npx expo prebuild --no-install --platform android' first." >&2
  exit 2
fi

if [[ ! -f "$REVIEWED_GROUPS_FILE" ]]; then
  echo "[FAIL] Missing reviewed native dependency group policy: $REVIEWED_GROUPS_FILE" >&2
  exit 2
fi

TMP_OUTPUT="$(mktemp)"
TMP_MODULES="$(mktemp)"
trap 'rm -f "$TMP_OUTPUT" "$TMP_MODULES"' EXIT

(
  cd "$ANDROID_DIR"
  ./gradlew :app:dependencies \
    --configuration releaseRuntimeClasspath \
    --console=plain \
    --no-daemon
) >"$TMP_OUTPUT"

for forbidden in \
  'com.google.android.gms:' \
  'com.google.firebase:' \
  'com.google.mlkit:' \
  'com.google.android.play:'
do
  if grep -Fq "$forbidden" "$TMP_OUTPUT"; then
    echo "[FAIL] Forbidden F-Droid dependency found: $forbidden" >&2
    grep -F "$forbidden" "$TMP_OUTPUT" >&2 || true
    exit 1
  fi
done

if ! grep -Fq 'com.google.zxing:core:3.5.4' "$TMP_OUTPUT"; then
  echo "[FAIL] Expected FOSS scanner dependency com.google.zxing:core:3.5.4 was not found." >&2
  exit 1
fi

# Normalize external Maven coordinates from Gradle's dependency tree. Project
# dependencies are intentionally ignored: their source lives in this checkout.
sed -nE 's/^.*--- ([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([^[:space:]()]+).*$/\1:\2:\3/p' "$TMP_OUTPUT" \
  | sort -u >"$TMP_MODULES"

mapfile -t reviewed_groups < <(grep -Ev '^[[:space:]]*(#|$)' "$REVIEWED_GROUPS_FILE")

is_reviewed_group() {
  local group="$1"
  local reviewed
  local prefix
  for reviewed in "${reviewed_groups[@]}"; do
    if [[ "$reviewed" == *'.*' ]]; then
      prefix="${reviewed%.*}"
      if [[ "$group" == "$prefix" || "$group" == "$prefix."* ]]; then
        return 0
      fi
    elif [[ "$group" == "$reviewed" ]]; then
      return 0
    fi
  done
  return 1
}

unknown_modules=()
while IFS= read -r coordinate; do
  [[ -z "$coordinate" ]] && continue
  group="${coordinate%%:*}"
  if ! is_reviewed_group "$group"; then
    unknown_modules+=("$coordinate")
  fi
done <"$TMP_MODULES"

REPORT="$ANDROID_DIR/build/fdroid-release-runtime-dependencies.txt"
mkdir -p "$(dirname "$REPORT")"
cp "$TMP_MODULES" "$REPORT"

if (( ${#unknown_modules[@]} > 0 )); then
  echo "[FAIL] Android runtime dependencies from unreviewed Maven groups were found:" >&2
  printf '  - %s\n' "${unknown_modules[@]}" >&2
  echo >&2
  echo "Review the upstream source/license, then add the exact group or an explicit .* namespace to scripts/fdroid-reviewed-native-groups.txt." >&2
  echo "Normalized dependency inventory: $REPORT" >&2
  exit 1
fi

module_count="$(wc -l <"$TMP_MODULES" | tr -d ' ')"
echo "[PASS] Android release runtime graph contains ZXing Core 3.5.4 and no Google Play Services, Firebase, ML Kit, or Play SDK artifacts."
echo "[PASS] ${module_count} external Maven coordinates are within reviewed FOSS group families."
echo "Normalized dependency inventory: $REPORT"
