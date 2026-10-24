#!/usr/bin/env bash
# Zweiten RPC-User am Bitcoin-Knoten anlegen (Plan both.money): both.money
# bekommt eigene Zugangsdaten mit derselben rpcwhitelist wie Klick — so lässt
# sich ein Zugang sperren, ohne den anderen zu stören. Auf dem Knoten-Server
# als root, nach setup-bitcoind.sh:
#
#   RPC_USER=both NODE_WG_IP=10.8.0.2 deploy/nodes/add-bitcoin-rpc-user.sh
#
# Grenze: Bitcoin Core trennt Beobachtungs-Wallets nicht je RPC-User; beide
# Apps sehen die Wallets des Knotens (die Namen tragen die Konto-ID).
set -euo pipefail
: "${RPC_USER:?RPC_USER setzen, z. B. both}"
: "${NODE_WG_IP:?WireGuard-Adresse dieses Servers, z. B. 10.8.0.2}"
CONF=/etc/bitcoin/bitcoin.conf
[[ "$RPC_USER" =~ ^[a-z]+$ ]] || { echo "RPC_USER nur a–z" >&2; exit 2; }
[ -f "$CONF" ] || { echo "$CONF fehlt — erst setup-bitcoind.sh" >&2; exit 1; }
if grep -q "^rpcauth=${RPC_USER}:" "$CONF"; then
  echo "RPC-User ${RPC_USER} gibt es schon" >&2
  exit 1
fi
METHODS="$(grep '^rpcwhitelist=klick:' "$CONF" | cut -d: -f2-)"
[ -n "$METHODS" ] || { echo "rpcwhitelist für klick fehlt in $CONF" >&2; exit 1; }
CHAIN="$(grep '^chain=' "$CONF" | cut -d= -f2)"
case "$CHAIN" in
  signet) RPC_PORT=38332; NET=SIGNET ;;
  main)   RPC_PORT=8332; NET=MAINNET ;;
  *) echo "chain in $CONF unbekannt" >&2; exit 1 ;;
esac

PASS="$(openssl rand -hex 32)"
SALT="$(openssl rand -hex 16)"
HASH="$(printf %s "$PASS" | openssl dgst -sha256 -hmac "$SALT" | awk '{print $NF}')"
# vor dem ersten Abschnitt einfügen, damit es für alle Ketten gilt
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
awk -v auth="rpcauth=${RPC_USER}:${SALT}\$${HASH}" -v wl="rpcwhitelist=${RPC_USER}:${METHODS}" '
  !done && /^\[/ { print auth; print wl; done=1 }
  { print }
  END { if (!done) { print auth; print wl } }
' "$CONF" > "$TMP"
install -m 0640 -o root -g bitcoin "$TMP" "$CONF"
systemctl restart bitcoind

echo "RPC-User ${RPC_USER} angelegt. Auf dem App-Server als Credential ablegen:"
echo "  printf %s 'http://${RPC_USER}:${PASS}@${NODE_WG_IP}:${RPC_PORT}' | systemd-creds encrypt \\"
echo "    --name=${RPC_USER}_rpc_bitcoin_$(echo "$CHAIN" | sed 's/main/mainnet/') - /etc/credstore.encrypted/${RPC_USER}_rpc_bitcoin_$(echo "$CHAIN" | sed 's/main/mainnet/')"
echo "  (Umgebung: WALLET_RPC_BITCOIN_${NET})"
