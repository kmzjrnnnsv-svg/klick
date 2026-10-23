#!/usr/bin/env bash
# Bitcoin Core als eigener Knoten für den Wallet-Bereich (Plan Wallet, Phase 0).
# Läuft auf dem Knoten-Server (root), erreichbar nur über WireGuard.
#
#   BITCOIN_VERSION=<aktuelle Version> NODE_WG_IP=10.8.0.2 APP_WG_IP=10.8.0.1 \
#     CHAIN=signet ./setup-bitcoind.sh
#
# - lädt Bitcoin Core von bitcoincore.org und prüft SHA256SUMS samt
#   Signaturen der Builder (guix.sigs) — ohne mindestens MIN_SIGS gültige
#   Signaturen bricht das Skript ab
# - txindex, Wallet an (nur Beobachtungs-Wallets ohne private Schlüssel),
#   RPC nur auf der WireGuard-Adresse, rpcauth + rpcwhitelist (nur die
#   Methoden, die Klick nutzt; alles andere → HTTP 403)
# - gibt am Ende die WALLET_RPC_*-URL aus (als systemd-Credential ablegen)
#
# PRÜFEN vor dem Lauf: aktuelle Version und Release-Hinweise auf
# bitcoincore.org; Fingerabdrücke der Builder-Schlüssel gegen guix.sigs.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

: "${BITCOIN_VERSION:?BITCOIN_VERSION setzen (aktuelle stabile Version, z. B. von bitcoincore.org)}"
: "${NODE_WG_IP:?WireGuard-Adresse dieses Servers, z. B. 10.8.0.2}"
: "${APP_WG_IP:?WireGuard-Adresse des App-Servers, z. B. 10.8.0.1}"
CHAIN="${CHAIN:-signet}"          # signet | main
MIN_SIGS="${MIN_SIGS:-3}"
ARCH="${ARCH:-x86_64-linux-gnu}"
DATADIR=/var/lib/bitcoind
RPC_USER=klick

case "$CHAIN" in
  signet) RPC_PORT=38332 ;;
  main)   RPC_PORT=8332 ;;
  *) echo "CHAIN muss signet oder main sein" >&2; exit 2 ;;
esac

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

BASE="https://bitcoincore.org/bin/bitcoin-core-${BITCOIN_VERSION}"
TARBALL="bitcoin-${BITCOIN_VERSION}-${ARCH}.tar.gz"
curl -fsSLO "$BASE/$TARBALL"
curl -fsSLO "$BASE/SHA256SUMS"
curl -fsSLO "$BASE/SHA256SUMS.asc"

# Builder-Schlüssel aus guix.sigs (nur Schlüssel, keine Software)
git clone --depth 1 https://github.com/bitcoin-core/guix.sigs.git
export GNUPGHOME="$WORK/gnupg"; mkdir -m 700 "$GNUPGHOME"
gpg --quiet --import guix.sigs/builder-keys/*.gpg 2>/dev/null || true
GOOD=$(gpg --status-fd 1 --verify SHA256SUMS.asc SHA256SUMS 2>/dev/null | grep -c '^\[GNUPG:\] GOODSIG' || true)
if [ "$GOOD" -lt "$MIN_SIGS" ]; then
  echo "Nur $GOOD gültige Signaturen auf SHA256SUMS (mindestens $MIN_SIGS) — Abbruch" >&2
  exit 1
fi
sha256sum --ignore-missing --check SHA256SUMS
echo "✔ $GOOD Builder-Signaturen, Prüfsumme stimmt"

tar -xzf "$TARBALL"
install -m 0755 -o root -g root "bitcoin-${BITCOIN_VERSION}/bin/bitcoind" /usr/local/bin/bitcoind
install -m 0755 -o root -g root "bitcoin-${BITCOIN_VERSION}/bin/bitcoin-cli" /usr/local/bin/bitcoin-cli

id bitcoin >/dev/null 2>&1 || useradd --system --home "$DATADIR" --shell /usr/sbin/nologin bitcoin
install -d -m 0710 -o bitcoin -g bitcoin "$DATADIR"
install -d -m 0750 -o root -g bitcoin /etc/bitcoin

# rpcauth: user:salt$HMAC-SHA256(salt, passwort) — das Passwort steht nur in
# der ausgegebenen URL, nie in der Konfiguration
PASS="$(openssl rand -hex 32)"
SALT="$(openssl rand -hex 16)"
HASH="$(printf %s "$PASS" | openssl dgst -sha256 -hmac "$SALT" | awk '{print $NF}')"

METHODS="getblockchaininfo,listwallets,loadwallet,createwallet,getdescriptorinfo,importdescriptors,deriveaddresses,listsinceblock,gettransaction,getrawtransaction,getbalance,getbalances,listunspent,estimatesmartfee,testmempoolaccept,sendrawtransaction"

cat > /etc/bitcoin/bitcoin.conf <<CONF
# Klick Wallet-Knoten (deploy/nodes/setup-bitcoind.sh) — ${CHAIN}
chain=${CHAIN}
server=1
txindex=1
disablewallet=0
listen=1
dbcache=2048
maxconnections=40
rpcauth=${RPC_USER}:${SALT}\$${HASH}
rpcwhitelist=${RPC_USER}:${METHODS}
rpcwhitelistdefault=1
[${CHAIN}]
rpcbind=${NODE_WG_IP}
rpcport=${RPC_PORT}
rpcallowip=${APP_WG_IP}/32
CONF
chown root:bitcoin /etc/bitcoin/bitcoin.conf
chmod 0640 /etc/bitcoin/bitcoin.conf

install -m 0644 "$SCRIPT_DIR/../systemd/bitcoind.service" /etc/systemd/system/bitcoind.service
systemctl daemon-reload
systemctl enable --now bitcoind

echo
echo "Knoten startet und synchronisiert (Signet: Minuten, echtes Netz: Tage)."
echo "Auf dem App-Server als Credential ablegen (Runbook „Wallet: Knoten“):"
NET_UPPER=$([ "$CHAIN" = main ] && echo MAINNET || echo SIGNET)
echo "  WALLET_RPC_BITCOIN_${NET_UPPER}=http://${RPC_USER}:${PASS}@${NODE_WG_IP}:${RPC_PORT}"
