#!/usr/bin/env bash
# both.money: systemd-Credentials in die Umgebung lesen und Next.js starten.
set -euo pipefail
cred() { local f="${CREDENTIALS_DIRECTORY:-}/$1"; [ -r "$f" ] && cat "$f"; }
export WALLET_AUTH_SECRET="$(cred wallet_auth_secret)"
export WALLET_VAULT_KEK_BASE64="$(cred wallet_vault_kek_base64)"
export WALLET_DATABASE_URL="$(cred wallet_database_url)"
export WALLET_DATABASE_URL_MIGRATE="$(cred wallet_database_url_migrate || true)"
v="$(cred wallet_brevo_api_key || true)"
[ -n "$v" ] && export BREVO_API_KEY="$v"
# Eigene Knoten (both.service.d/nodes.conf): je Netz eine URL mit eigenem rpcauth-User
for n in bitcoin_signet bitcoin_mainnet ethereum_sepolia ethereum_mainnet; do
  v="$(cred "both_rpc_$n" || true)"
  [ -n "$v" ] && export "WALLET_RPC_${n^^}=$v"
done
exec /usr/bin/env node_modules/.bin/next start apps/wallet -p "${PORT:-3010}" -H "${HOSTNAME:-127.0.0.1}"
