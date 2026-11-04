#!/usr/bin/env bash
# Liest systemd-Credentials in die Umgebung und startet Next.js.
set -euo pipefail
cred() { local f="${CREDENTIALS_DIRECTORY:-}/$1"; [ -r "$f" ] && cat "$f"; }
export BETTER_AUTH_SECRET="$(cred better_auth_secret)"
export VAULT_KEK_BASE64="$(cred vault_kek_base64)"
export DATABASE_URL="$(cred database_url)"
export DATABASE_URL_MIGRATE="$(cred database_url_migrate || true)"
export SMTP_PASS="$(cred smtp_pass || true)"
# Microsoft Teams (optional): Zertifikat bevorzugt, sonst Geheimnis
[ -r "${CREDENTIALS_DIRECTORY:-}/teams_cert" ] && export TEAMS_CERT_FILE="${CREDENTIALS_DIRECTORY}/teams_cert"
export TEAMS_CLIENT_SECRET="$(cred teams_client_secret || true)"
# Identität (optional): Entra-Zertifikat bevorzugt, sonst Geheimnis; Google-Dienstkonto
[ -r "${CREDENTIALS_DIRECTORY:-}/identity_ms_cert" ] && export IDENTITY_MS_CERT_FILE="${CREDENTIALS_DIRECTORY}/identity_ms_cert"
export IDENTITY_MS_CLIENT_SECRET="$(cred identity_ms_client_secret || true)"
[ -r "${CREDENTIALS_DIRECTORY:-}/identity_google_sa" ] && export IDENTITY_GOOGLE_SA_FILE="${CREDENTIALS_DIRECTORY}/identity_google_sa"
# Push-Benachrichtigungen (optional): privater VAPID-Schlüssel nur als Credential
[ -r "${CREDENTIALS_DIRECTORY:-}/web_push_private_key" ] && export WEB_PUSH_PRIVATE_KEY="$(cred web_push_private_key)"
exec /usr/bin/env node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-127.0.0.1}"
