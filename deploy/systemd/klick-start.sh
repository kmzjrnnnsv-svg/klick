#!/usr/bin/env bash
# Liest systemd-Credentials in die Umgebung und startet Next.js.
set -euo pipefail
cred() { local f="${CREDENTIALS_DIRECTORY:-}/$1"; [ -r "$f" ] && cat "$f"; }
export BETTER_AUTH_SECRET="$(cred better_auth_secret)"
export VAULT_KEK_BASE64="$(cred vault_kek_base64)"
export DATABASE_URL="$(cred database_url)"
export DATABASE_URL_MIGRATE="$(cred database_url_migrate || true)"
export SMTP_PASS="$(cred smtp_pass || true)"
exec /usr/bin/env node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-127.0.0.1}"
