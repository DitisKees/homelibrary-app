#!/bin/sh
set -eu

config_file="/usr/share/nginx/html/runtime-config.js"
value="${POCKETBASE_URL:-}"

if [ -z "${value}" ]; then
  printf '%s\n' 'globalThis.__HOMELIBRARY_RUNTIME_CONFIG__ = { POCKETBASE_URL: null };' > "${config_file}"
  echo "HomeLibrary web: POCKETBASE_URL is not set; the server setup screen will be shown."
  exit 0
fi

if printf '%s' "${value}" | grep -q '[[:space:]]'; then
  echo "HomeLibrary web: POCKETBASE_URL must not contain whitespace." >&2
  exit 64
fi

case "${value}" in
  https://?*) ;;
  *)
    echo "HomeLibrary web: POCKETBASE_URL must be an absolute HTTPS URL." >&2
    exit 64
    ;;
esac

case "${value}" in
  *\?*|*\#*)
    echo "HomeLibrary web: POCKETBASE_URL must not contain a query string or fragment." >&2
    exit 64
    ;;
esac

authority="${value#https://}"
authority="${authority%%/*}"
case "${authority}" in
  *@*)
    echo "HomeLibrary web: credentials are not allowed in POCKETBASE_URL." >&2
    exit 64
    ;;
esac

escaped="$(printf '%s' "${value}" | sed 's/\\/\\\\/g; s/"/\\"/g')"
printf 'globalThis.__HOMELIBRARY_RUNTIME_CONFIG__ = { POCKETBASE_URL: "%s" };\n' "${escaped}" > "${config_file}"
