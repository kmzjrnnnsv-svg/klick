#!/usr/bin/env bash
# Ethereum-Knoten für den Wallet-Bereich: Reth (Ausführung, mit trace-API)
# + Lighthouse (Konsens), Plan Wallet Phase 0. Läuft auf dem Knoten-Server
# (root), JSON-RPC nur auf der WireGuard-Adresse.
#
#   RETH_VERSION=<vX.Y.Z> LIGHTHOUSE_VERSION=<vX.Y.Z> \
#   RETH_GPG_FPR=<Fingerabdruck> LIGHTHOUSE_GPG_FPR=<Fingerabdruck> \
#   NODE_WG_IP=10.8.0.2 NETWORK=sepolia ./setup-ethereum.sh
#
# Versionen und GPG-Fingerabdrücke aus den offiziellen Release-Seiten
# übernehmen (PRÜFEN: paradigmxyz/reth, sigp/lighthouse). Ohne gültige
# Signatur des angegebenen Schlüssels bricht das Skript ab.
#
# Reth läuft als Archivknoten (trace_filter über ältere Blöcke); Sepolia
# braucht dafür einige hundert GB SSD, das echte Netz deutlich mehr.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

: "${RETH_VERSION:?RETH_VERSION setzen (z. B. aus github.com/paradigmxyz/reth/releases)}"
: "${LIGHTHOUSE_VERSION:?LIGHTHOUSE_VERSION setzen (github.com/sigp/lighthouse/releases)}"
: "${RETH_GPG_FPR:?Fingerabdruck des Reth-Signaturschlüssels}"
: "${LIGHTHOUSE_GPG_FPR:?Fingerabdruck des Lighthouse-Signaturschlüssels}"
: "${NODE_WG_IP:?WireGuard-Adresse dieses Servers, z. B. 10.8.0.2}"
NETWORK="${NETWORK:-sepolia}"   # sepolia | mainnet
ARCH="${ARCH:-x86_64-unknown-linux-gnu}"
RPC_PORT=$([ "$NETWORK" = mainnet ] && echo 8546 || echo 8545)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"
export GNUPGHOME="$WORK/gnupg"; mkdir -m 700 "$GNUPGHOME"

fetch_verified() { # name url fpr
  local file; file="$(basename "$2")"
  curl -fsSLO "$2"
  curl -fsSLO "$2.asc"
  gpg --quiet --keyserver hkps://keys.openpgp.org --recv-keys "$3"
  if ! gpg --status-fd 1 --verify "$file.asc" "$file" 2>/dev/null | grep -q "VALIDSIG $3"; then
    echo "$1: Signatur passt nicht zu $3 — Abbruch" >&2
    exit 1
  fi
  echo "✔ $1 signiert von $3"
}

fetch_verified reth \
  "https://github.com/paradigmxyz/reth/releases/download/${RETH_VERSION}/reth-${RETH_VERSION}-${ARCH}.tar.gz" \
  "$RETH_GPG_FPR"
fetch_verified lighthouse \
  "https://github.com/sigp/lighthouse/releases/download/${LIGHTHOUSE_VERSION}/lighthouse-${LIGHTHOUSE_VERSION}-${ARCH}.tar.gz" \
  "$LIGHTHOUSE_GPG_FPR"
tar -xzf "reth-${RETH_VERSION}-${ARCH}.tar.gz"
tar -xzf "lighthouse-${LIGHTHOUSE_VERSION}-${ARCH}.tar.gz"
install -m 0755 -o root -g root reth /usr/local/bin/reth
install -m 0755 -o root -g root lighthouse /usr/local/bin/lighthouse

for u in reth lighthouse; do
  id "$u" >/dev/null 2>&1 || useradd --system --home "/var/lib/$u" --shell /usr/sbin/nologin "$u"
  install -d -m 0710 -o "$u" -g "$u" "/var/lib/$u"
done
# JWT für die Engine-API (nur lokal, beide Dienste lesen ihn)
groupadd -f ethjwt
usermod -aG ethjwt reth; usermod -aG ethjwt lighthouse
install -d -m 0750 -o root -g ethjwt /etc/ethereum
[ -s /etc/ethereum/jwt.hex ] || openssl rand -hex 32 > /etc/ethereum/jwt.hex
chown root:ethjwt /etc/ethereum/jwt.hex; chmod 0640 /etc/ethereum/jwt.hex

cat > /etc/ethereum/node.env <<ENV
ETH_NETWORK=${NETWORK}
NODE_WG_IP=${NODE_WG_IP}
RPC_PORT=${RPC_PORT}
# Checkpoint-Sync: Quelle 1 (Start). Nach dem Sync mit verify-checkpoint.sh
# gegen zwei weitere Quellen prüfen.
CHECKPOINT_URL=${CHECKPOINT_URL:-https://checkpoint-sync.${NETWORK}.ethpandaops.io}
ENV
chmod 0644 /etc/ethereum/node.env

install -m 0644 "$SCRIPT_DIR/../systemd/reth.service" /etc/systemd/system/reth.service
install -m 0644 "$SCRIPT_DIR/../systemd/lighthouse.service" /etc/systemd/system/lighthouse.service
systemctl daemon-reload
systemctl enable --now reth lighthouse

echo
echo "Reth + Lighthouse starten (${NETWORK}). Nach dem Sync:"
echo "  $SCRIPT_DIR/verify-checkpoint.sh   # finalen Block gegen zwei Quellen prüfen"
echo "Auf dem App-Server als Credential ablegen:"
NET_UPPER=$([ "$NETWORK" = mainnet ] && echo MAINNET || echo SEPOLIA)
echo "  WALLET_RPC_ETHEREUM_${NET_UPPER}=http://${NODE_WG_IP}:${RPC_PORT}"
